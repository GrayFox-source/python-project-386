from datetime import UTC, date, datetime, time
from typing import NoReturn
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_app_settings
from app.availability import rules_for, validate_timezone
from app.config import Settings
from app.db import get_db, utcnow
from app.errors import domain_error
from app.meeting_types import meeting_type_to_schema
from app.models import AvailabilityRecord, MeetingTypeRecord
from app.slots import generate_slots
from generated.models import (
    GoneError,
    NotFoundError,
    SlotListResponse,
    ValidationErrorResponse,
)
from generated.models import (
    MeetingType as MeetingTypeSchema,
)

router = APIRouter(prefix="/book", tags=["Booking Page"])

NOT_FOUND_RESPONSES = {404: {"model": NotFoundError}}
GONE_RESPONSES = {410: {"model": GoneError}}
VALIDATION_RESPONSES = {422: {"model": ValidationErrorResponse}}
MAX_SLOT_RANGE_DAYS = 62


def get_now() -> datetime:
    return utcnow()


def meeting_type_not_found() -> NoReturn:
    domain_error(404, "meeting_type_not_found", "Meeting Type not found.")


def require_active_meeting_type(
    session: Session,
    slug: str,
) -> MeetingTypeRecord:
    record = session.scalar(
        select(MeetingTypeRecord).where(MeetingTypeRecord.slug == slug)
    )
    if record is None:
        meeting_type_not_found()
    if record.status != "active":
        domain_error(
            410,
            "meeting_type_archived",
            "This Meeting Type is archived.",
        )
    return record


def time_windows(
    session: Session,
    availability_id: str,
) -> tuple[
    dict[int, list[tuple[time, time]]],
    dict[date, list[tuple[time, time]] | None],
]:
    weekly: dict[int, list[tuple[time, time]]] = {}
    overrides: dict[date, list[tuple[time, time]] | None] = {}

    for rule in rules_for(session, availability_id):
        if rule.kind == "weekly":
            if (
                rule.day_of_week is None
                or rule.start_time is None
                or rule.end_time is None
            ):
                continue
            weekly.setdefault(rule.day_of_week, []).append(
                (rule.start_time, rule.end_time)
            )
            continue

        if rule.date is None:
            continue
        if rule.is_closed:
            overrides[rule.date] = None
            continue
        if rule.start_time is None or rule.end_time is None:
            continue
        if rule.date in overrides and overrides[rule.date] is None:
            continue
        overrides.setdefault(rule.date, []).append(
            (rule.start_time, rule.end_time)
        )

    return weekly, overrides


def utc_z(value: datetime) -> str:
    return (
        value.astimezone(UTC)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


@router.get(
    "/{slug}",
    response_model=MeetingTypeSchema,
    responses={**NOT_FOUND_RESPONSES, **GONE_RESPONSES},
)
def get_public_meeting_type(
    slug: str,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> MeetingTypeSchema:
    record = require_active_meeting_type(session, slug)
    return meeting_type_to_schema(record, settings)


@router.get(
    "/{slug}/slots",
    response_model=SlotListResponse,
    responses={
        **NOT_FOUND_RESPONSES,
        **GONE_RESPONSES,
        **VALIDATION_RESPONSES,
    },
)
def list_public_slots(
    slug: str,
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    timezone: str = Query(),
    session: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> JSONResponse:
    record = require_active_meeting_type(session, slug)
    display_timezone = validate_timezone(timezone)
    display_zone = ZoneInfo(display_timezone)

    if from_date > to_date:
        domain_error(422, "range_too_large", "Invalid slot date range.")
    if (to_date - from_date).days + 1 > MAX_SLOT_RANGE_DAYS:
        domain_error(422, "range_too_large", "Slot range is too large.")

    availability = session.get(AvailabilityRecord, record.availability_id)
    if availability is None:
        meeting_type_not_found()

    weekly, overrides = time_windows(session, availability.id)
    slots = generate_slots(
        weekly=weekly,
        overrides=overrides,
        availability_timezone=availability.timezone,
        display_timezone=display_timezone,
        display_from=from_date,
        display_to=to_date,
        now=now,
        duration_minutes=record.duration_minutes,
        slot_interval_minutes=record.slot_interval_minutes,
        minimum_notice_minutes=record.minimum_notice_minutes,
        booking_horizon_days=record.booking_horizon_days,
        buffer_before_minutes=record.buffer_before_minutes,
        buffer_after_minutes=record.buffer_after_minutes,
        busy=[],
    )

    grouped: dict[date, list[dict[str, str]]] = {}
    for slot in slots:
        local_date = slot.start.astimezone(display_zone).date()
        grouped.setdefault(local_date, []).append(
            {"start": utc_z(slot.start), "end": utc_z(slot.end)}
        )

    return JSONResponse(
        content={
            "timezone": display_timezone,
            "days": [
                {"date": day.isoformat(), "slots": slots}
                for day, slots in sorted(grouped.items())
            ],
        }
    )
