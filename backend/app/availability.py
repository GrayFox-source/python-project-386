from dataclasses import dataclass
from datetime import date as date_type
from datetime import time
from typing import NoReturn
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.auth import UNAUTHORIZED_RESPONSES, get_current_host
from app.db import get_db, utcnow
from app.models import AvailabilityRecord, AvailabilityRuleRecord, HostRecord
from generated.models import (
    Availability as AvailabilitySchema,
)
from generated.models import (
    AvailabilityListResponse,
    AvailabilityWindow,
    AvailabilityWrite,
    ConflictError,
    DateOverride,
    NotFoundError,
    ValidationErrorResponse,
)

router = APIRouter(prefix="/hosts/me/availabilities", tags=["Availabilities"])

NOT_FOUND_RESPONSES = {404: {"model": NotFoundError}}
CONFLICT_RESPONSES = {409: {"model": ConflictError}}
VALIDATION_RESPONSES = {422: {"model": ValidationErrorResponse}}

MIDNIGHT = time(23, 59, 59, 999999)
MAX_INTERVALS_PER_DAY = 20
DAY_KEYS = {str(day) for day in range(1, 8)}


@dataclass(frozen=True)
class RuleData:
    kind: str
    day_of_week: int | None = None
    date: date_type | None = None
    start_time: time | None = None
    end_time: time | None = None
    is_closed: bool = False


def domain_error(status_code: int, code: str, message: str) -> NoReturn:
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def validation_error(
    loc: list[str | int],
    message: str,
    *,
    code: str | None = None,
) -> NoReturn:
    issue: dict[str, object] = {
        "loc": ["body", *loc],
        "msg": message,
        "type": "value_error",
    }
    if code is not None:
        issue["code"] = code
    raise HTTPException(status_code=422, detail=[issue])


def availability_not_found() -> NoReturn:
    domain_error(404, "availability_not_found", "Availability not found.")


def validate_name(name: str) -> str:
    stripped = name.strip()
    if not 1 <= len(stripped) <= 100:
        validation_error(
            ["name"], "Name must contain between 1 and 100 characters."
        )
    return stripped


def validate_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ValueError, ZoneInfoNotFoundError):
        domain_error(422, "invalid_timezone", "Unknown IANA timezone.")
    return value


def parse_window(
    window: AvailabilityWindow,
    loc: list[str | int],
) -> tuple[time, time]:
    start = time.fromisoformat(window.start)
    end = MIDNIGHT if window.end == "24:00" else time.fromisoformat(window.end)
    if start >= end:
        validation_error([*loc, "end"], "Window end must be after its start.")
    return start, end


def build_intervals(
    windows: list[AvailabilityWindow],
    loc: list[str | int],
) -> list[tuple[time, time]]:
    if len(windows) > MAX_INTERVALS_PER_DAY:
        validation_error(
            loc,
            f"A day can contain at most {MAX_INTERVALS_PER_DAY} intervals.",
        )

    intervals = sorted(
        (
            parse_window(window, [*loc, index])
            for index, window in enumerate(windows)
        ),
        key=lambda interval: interval[0],
    )

    for previous, current in zip(intervals, intervals[1:], strict=False):
        if current[0] < previous[1]:
            validation_error(
                loc,
                "Intervals in one day must not overlap.",
                code="overlapping_windows",
            )

    return intervals


def build_rules(payload: AvailabilityWrite) -> list[RuleData]:
    rules: list[RuleData] = []

    for day, windows in payload.weekly.items():
        if day not in DAY_KEYS:
            validation_error(
                ["weekly", day],
                "Weekly keys must be ISO weekdays from 1 to 7.",
            )

        for start, end in build_intervals(windows, ["weekly", day]):
            rules.append(
                RuleData(
                    kind="weekly",
                    day_of_week=int(day),
                    start_time=start,
                    end_time=end,
                )
            )

    seen_dates: set[date_type] = set()
    for index, override in enumerate(payload.overrides):
        if override.date in seen_dates:
            domain_error(
                422,
                "duplicate_override_date",
                "Only one override is allowed per date.",
            )
        seen_dates.add(override.date)

        intervals = override.intervals or []
        if override.closed:
            if intervals:
                domain_error(
                    422,
                    "invalid_override",
                    "A closed override cannot contain intervals.",
                )
            rules.append(
                RuleData(
                    kind="override",
                    date=override.date,
                    is_closed=True,
                )
            )
            continue

        if not intervals:
            domain_error(
                422,
                "invalid_override",
                "An open override must contain at least one interval.",
            )

        for start, end in build_intervals(
            intervals, ["overrides", index, "intervals"]
        ):
            rules.append(
                RuleData(
                    kind="override",
                    date=override.date,
                    start_time=start,
                    end_time=end,
                )
            )

    return rules


def replace_rules(
    session: Session,
    record: AvailabilityRecord,
    rules: list[RuleData],
) -> None:
    session.execute(
        delete(AvailabilityRuleRecord).where(
            AvailabilityRuleRecord.availability_id == record.id
        )
    )
    session.add_all(
        AvailabilityRuleRecord(
            availability_id=record.id,
            kind=rule.kind,
            day_of_week=rule.day_of_week,
            date=rule.date,
            start_time=rule.start_time,
            end_time=rule.end_time,
            is_closed=rule.is_closed,
        )
        for rule in rules
    )


def ensure_name_available(
    session: Session,
    host: HostRecord,
    name: str,
    *,
    exclude_id: str | None = None,
) -> None:
    statement = select(AvailabilityRecord.id).where(
        AvailabilityRecord.host_id == host.id,
        AvailabilityRecord.name_key == name.casefold(),
    )
    if exclude_id is not None:
        statement = statement.where(AvailabilityRecord.id != exclude_id)

    if session.scalar(statement) is not None:
        domain_error(
            422,
            "duplicate_availability_name",
            "An Availability with this name already exists.",
        )


def meeting_types_count(_session: Session, _availability_id: str) -> int:
    return 0


def format_time(value: time, *, end: bool = False) -> str:
    if end and value == MIDNIGHT:
        return "24:00"
    return value.strftime("%H:%M")


def rules_to_schema(
    record: AvailabilityRecord,
    rules: list[AvailabilityRuleRecord],
    meeting_types: int = 0,
) -> AvailabilitySchema:
    weekly = {str(day): [] for day in range(1, 8)}
    closed_dates: set[date_type] = set()
    override_windows: dict[date_type, list[AvailabilityWindow]] = {}

    for rule in rules:
        if rule.kind == "weekly":
            if (
                rule.day_of_week is None
                or rule.start_time is None
                or rule.end_time is None
            ):
                continue
            weekly[str(rule.day_of_week)].append(
                AvailabilityWindow(
                    start=format_time(rule.start_time),
                    end=format_time(rule.end_time, end=True),
                )
            )
            continue

        if rule.date is None:
            continue
        if rule.is_closed:
            closed_dates.add(rule.date)
            continue
        if rule.start_time is None or rule.end_time is None:
            continue
        override_windows.setdefault(rule.date, []).append(
            AvailabilityWindow(
                start=format_time(rule.start_time),
                end=format_time(rule.end_time, end=True),
            )
        )

    for windows in weekly.values():
        windows.sort(key=lambda window: window.start)

    overrides: list[DateOverride] = []
    for override_date in sorted(closed_dates | set(override_windows)):
        if override_date in closed_dates:
            overrides.append(DateOverride(date=override_date, closed=True))
            continue
        windows = sorted(
            override_windows[override_date], key=lambda window: window.start
        )
        overrides.append(
            DateOverride(
                date=override_date,
                closed=False,
                intervals=windows,
            )
        )

    return AvailabilitySchema(
        id=record.id,
        name=record.name,
        timezone=record.timezone,
        weekly=weekly,
        overrides=overrides,
        meeting_types_count=meeting_types,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def get_availability(
    session: Session,
    host: HostRecord,
    availability_id: str,
) -> AvailabilityRecord:
    record = session.scalar(
        select(AvailabilityRecord).where(
            AvailabilityRecord.id == availability_id,
            AvailabilityRecord.host_id == host.id,
        )
    )
    if record is None:
        availability_not_found()
    return record


def rules_for(
    session: Session,
    availability_id: str,
) -> list[AvailabilityRuleRecord]:
    return list(
        session.scalars(
            select(AvailabilityRuleRecord).where(
                AvailabilityRuleRecord.availability_id == availability_id
            )
        )
    )


@router.get(
    "",
    response_model=AvailabilityListResponse,
    responses=UNAUTHORIZED_RESPONSES,
)
def list_host_availabilities(
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> AvailabilityListResponse:
    records = list(
        session.scalars(
            select(AvailabilityRecord)
            .where(AvailabilityRecord.host_id == host.id)
            .order_by(AvailabilityRecord.created_at)
            .limit(limit)
            .offset(offset)
        )
    )
    total = session.scalar(
        select(func.count())
        .select_from(AvailabilityRecord)
        .where(AvailabilityRecord.host_id == host.id)
    )

    rules_by_id: dict[str, list[AvailabilityRuleRecord]] = {
        record.id: [] for record in records
    }
    if records:
        rules = session.scalars(
            select(AvailabilityRuleRecord).where(
                AvailabilityRuleRecord.availability_id.in_(rules_by_id)
            )
        )
        for rule in rules:
            rules_by_id[rule.availability_id].append(rule)

    return AvailabilityListResponse(
        items=[
            rules_to_schema(record, rules_by_id[record.id])
            for record in records
        ],
        total=total or 0,
    )


@router.post(
    "",
    response_model=AvailabilitySchema,
    responses={
        **UNAUTHORIZED_RESPONSES,
        **VALIDATION_RESPONSES,
    },
)
def create_host_availability(
    payload: AvailabilityWrite,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
) -> AvailabilitySchema:
    name = validate_name(payload.name)
    timezone = validate_timezone(payload.timezone)
    rules = build_rules(payload)
    ensure_name_available(session, host, name)

    record = AvailabilityRecord(
        host_id=host.id,
        name=name,
        name_key=name.casefold(),
        timezone=timezone,
    )
    session.add(record)
    session.flush()
    replace_rules(session, record, rules)
    session.commit()
    session.refresh(record)

    return rules_to_schema(record, rules_for(session, record.id))


@router.get(
    "/{id}",
    response_model=AvailabilitySchema,
    responses={**UNAUTHORIZED_RESPONSES, **NOT_FOUND_RESPONSES},
)
def get_host_availability(
    id: str,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
) -> AvailabilitySchema:
    record = get_availability(session, host, id)
    return rules_to_schema(record, rules_for(session, record.id))


@router.put(
    "/{id}",
    response_model=AvailabilitySchema,
    responses={
        **UNAUTHORIZED_RESPONSES,
        **NOT_FOUND_RESPONSES,
        **VALIDATION_RESPONSES,
    },
)
def replace_host_availability(
    id: str,
    payload: AvailabilityWrite,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
) -> AvailabilitySchema:
    record = get_availability(session, host, id)
    name = validate_name(payload.name)
    timezone = validate_timezone(payload.timezone)
    rules = build_rules(payload)
    ensure_name_available(session, host, name, exclude_id=record.id)

    record.name = name
    record.name_key = name.casefold()
    record.timezone = timezone
    record.updated_at = utcnow()
    replace_rules(session, record, rules)
    session.commit()
    session.refresh(record)

    return rules_to_schema(record, rules_for(session, record.id))


@router.delete(
    "/{id}",
    status_code=204,
    responses={
        **UNAUTHORIZED_RESPONSES,
        **NOT_FOUND_RESPONSES,
        **CONFLICT_RESPONSES,
    },
)
def remove_host_availability(
    id: str,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
) -> None:
    record = get_availability(session, host, id)
    if meeting_types_count(session, record.id) > 0:
        domain_error(
            409,
            "availability_in_use",
            "Availability is used by a Meeting Type.",
        )

    session.delete(record)
    session.commit()
