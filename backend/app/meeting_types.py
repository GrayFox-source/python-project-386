import re
import unicodedata
from typing import NoReturn

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import (
    UNAUTHORIZED_RESPONSES,
    get_app_settings,
    get_current_host,
)
from app.availability import get_availability
from app.config import Settings
from app.db import get_db, utcnow
from app.errors import domain_error, validation_error
from app.models import HostRecord, MeetingTypeRecord
from generated.models import (
    ConflictError,
    MeetingTypeListResponse,
    MeetingTypeWrite,
    NotFoundError,
    ValidationErrorResponse,
)
from generated.models import (
    MeetingType as MeetingTypeSchema,
)

router = APIRouter(prefix="/hosts/me/meeting-types", tags=["Meeting Types"])

NOT_FOUND_RESPONSES = {404: {"model": NotFoundError}}
CONFLICT_RESPONSES = {409: {"model": ConflictError}}
VALIDATION_RESPONSES = {422: {"model": ValidationErrorResponse}}

SLUG_RE = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
MAX_SLUG_LENGTH = 64
FALLBACK_SLUG = "meeting-type"

TRANSLITERATION = str.maketrans(
    {
        "а": "a",
        "б": "b",
        "в": "v",
        "г": "g",
        "д": "d",
        "е": "e",
        "ё": "e",
        "ж": "zh",
        "з": "z",
        "и": "i",
        "й": "y",
        "к": "k",
        "л": "l",
        "м": "m",
        "н": "n",
        "о": "o",
        "п": "p",
        "р": "r",
        "с": "s",
        "т": "t",
        "у": "u",
        "ф": "f",
        "х": "kh",
        "ц": "ts",
        "ч": "ch",
        "ш": "sh",
        "щ": "shch",
        "ъ": "",
        "ы": "y",
        "ь": "",
        "э": "e",
        "ю": "yu",
        "я": "ya",
        "і": "i",
        "ї": "yi",
        "є": "ye",
        "ґ": "g",
    }
)


def meeting_type_not_found() -> NoReturn:
    domain_error(404, "meeting_type_not_found", "Meeting Type not found.")


def validate_title(title: str) -> str:
    value = title.strip()
    if not 1 <= len(value) <= 120:
        validation_error(["title"], "Title must contain between 1 and 120 characters.")
    return value


def optional_text(value: str | None, field: str, limit: int) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if len(stripped) > limit:
        validation_error(
            [field], f"{field.capitalize()} must be at most {limit} characters."
        )
    return stripped


def bounded_int(
    value: int | None,
    field: str,
    minimum: int,
    maximum: int,
    default: int,
) -> int:
    if value is None:
        return default
    if not minimum <= value <= maximum:
        validation_error(
            [field],
            f"{field.replace('_', ' ').capitalize()} must be between "
            f"{minimum} and {maximum}.",
        )
    return value


def validate_slug(value: str) -> str:
    slug = value.strip()
    if not 1 <= len(slug) <= MAX_SLUG_LENGTH or SLUG_RE.fullmatch(slug) is None:
        validation_error(
            ["slug"],
            "Slug must be 1–64 lowercase letters, digits and single hyphens.",
        )
    return slug


def slugify_title(title: str) -> str:
    transliterated = title.casefold().translate(TRANSLITERATION)
    ascii_text = (
        unicodedata.normalize("NFKD", transliterated)
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    return slug[:MAX_SLUG_LENGTH].rstrip("-") or FALLBACK_SLUG


def slug_exists(
    session: Session,
    host: HostRecord,
    slug: str,
    *,
    exclude_id: str | None = None,
) -> bool:
    statement = select(MeetingTypeRecord.id).where(
        MeetingTypeRecord.host_id == host.id,
        MeetingTypeRecord.slug == slug,
    )
    if exclude_id is not None:
        statement = statement.where(MeetingTypeRecord.id != exclude_id)
    return session.scalar(statement) is not None


def generate_unique_slug(
    session: Session,
    host: HostRecord,
    title: str,
) -> str:
    base = slugify_title(title)
    candidate = base
    suffix = 2
    while slug_exists(session, host, candidate):
        suffix_text = f"-{suffix}"
        candidate = (
            f"{base[: MAX_SLUG_LENGTH - len(suffix_text)].rstrip('-')}{suffix_text}"
        )
        suffix += 1
    return candidate


def resolve_slug(
    session: Session,
    host: HostRecord,
    requested: str | None,
    title: str,
    *,
    current: MeetingTypeRecord | None = None,
) -> str:
    if requested is None or not requested.strip():
        if current is not None:
            return current.slug
        return generate_unique_slug(session, host, title)

    slug = validate_slug(requested)
    if slug_exists(
        session,
        host,
        slug,
        exclude_id=current.id if current is not None else None,
    ):
        domain_error(409, "slug_taken", "This slug is already in use.")
    return slug


def get_meeting_type(
    session: Session,
    host: HostRecord,
    meeting_type_id: str,
) -> MeetingTypeRecord:
    record = session.scalar(
        select(MeetingTypeRecord).where(
            MeetingTypeRecord.id == meeting_type_id,
            MeetingTypeRecord.host_id == host.id,
        )
    )
    if record is None:
        meeting_type_not_found()
    return record


def meeting_type_to_schema(
    record: MeetingTypeRecord,
    settings: Settings,
) -> MeetingTypeSchema:
    base_url = settings.public_base_url.rstrip("/")
    return MeetingTypeSchema(
        id=record.id,
        title=record.title,
        description=record.description,
        duration_minutes=record.duration_minutes,
        format=record.format,
        location=record.location,
        slug=record.slug,
        availability_id=record.availability_id,
        status=record.status,
        buffer_before_minutes=record.buffer_before_minutes,
        buffer_after_minutes=record.buffer_after_minutes,
        minimum_notice_minutes=record.minimum_notice_minutes,
        booking_horizon_days=record.booking_horizon_days,
        slot_interval_minutes=record.slot_interval_minutes,
        scheduling_link=f"{base_url}/book/{record.slug}",
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def apply_payload(
    session: Session,
    host: HostRecord,
    payload: MeetingTypeWrite,
    *,
    current: MeetingTypeRecord | None = None,
) -> dict[str, object]:
    title = validate_title(payload.title)
    availability = get_availability(session, host, payload.availability_id)
    duration = bounded_int(payload.duration_minutes, "duration_minutes", 5, 480, 5)
    slot_interval = bounded_int(
        payload.slot_interval_minutes,
        "slot_interval_minutes",
        5,
        480,
        duration,
    )
    slug = resolve_slug(
        session,
        host,
        payload.slug,
        title,
        current=current,
    )
    return {
        "availability_id": availability.id,
        "title": title,
        "description": optional_text(payload.description, "description", 2000),
        "duration_minutes": duration,
        "format": payload.format.value,
        "location": optional_text(payload.location, "location", 500),
        "slug": slug,
        "buffer_before_minutes": bounded_int(
            payload.buffer_before_minutes,
            "buffer_before_minutes",
            0,
            120,
            0,
        ),
        "buffer_after_minutes": bounded_int(
            payload.buffer_after_minutes,
            "buffer_after_minutes",
            0,
            120,
            0,
        ),
        "minimum_notice_minutes": bounded_int(
            payload.minimum_notice_minutes,
            "minimum_notice_minutes",
            0,
            10080,
            120,
        ),
        "booking_horizon_days": bounded_int(
            payload.booking_horizon_days,
            "booking_horizon_days",
            1,
            365,
            60,
        ),
        "slot_interval_minutes": slot_interval,
    }


@router.get(
    "",
    response_model=MeetingTypeListResponse,
    responses=UNAUTHORIZED_RESPONSES,
)
def list_host_meeting_types(
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> MeetingTypeListResponse:
    records = list(
        session.scalars(
            select(MeetingTypeRecord)
            .where(MeetingTypeRecord.host_id == host.id)
            .order_by(MeetingTypeRecord.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    total = session.scalar(
        select(func.count())
        .select_from(MeetingTypeRecord)
        .where(MeetingTypeRecord.host_id == host.id)
    )
    return MeetingTypeListResponse(
        items=[meeting_type_to_schema(record, settings) for record in records],
        total=total or 0,
    )


@router.post(
    "",
    response_model=MeetingTypeSchema,
    responses={
        **UNAUTHORIZED_RESPONSES,
        **NOT_FOUND_RESPONSES,
        **CONFLICT_RESPONSES,
        **VALIDATION_RESPONSES,
    },
)
def create_host_meeting_type(
    payload: MeetingTypeWrite,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> MeetingTypeSchema:
    values = apply_payload(session, host, payload)
    record = MeetingTypeRecord(host_id=host.id, status="active", **values)
    session.add(record)
    session.commit()
    session.refresh(record)
    return meeting_type_to_schema(record, settings)


@router.get(
    "/{id}",
    response_model=MeetingTypeSchema,
    responses={**UNAUTHORIZED_RESPONSES, **NOT_FOUND_RESPONSES},
)
def get_host_meeting_type(
    id: str,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> MeetingTypeSchema:
    record = get_meeting_type(session, host, id)
    return meeting_type_to_schema(record, settings)


@router.put(
    "/{id}",
    response_model=MeetingTypeSchema,
    responses={
        **UNAUTHORIZED_RESPONSES,
        **NOT_FOUND_RESPONSES,
        **CONFLICT_RESPONSES,
        **VALIDATION_RESPONSES,
    },
)
def replace_host_meeting_type(
    id: str,
    payload: MeetingTypeWrite,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> MeetingTypeSchema:
    record = get_meeting_type(session, host, id)
    values = apply_payload(session, host, payload, current=record)
    for field, value in values.items():
        setattr(record, field, value)
    record.updated_at = utcnow()
    session.commit()
    session.refresh(record)
    return meeting_type_to_schema(record, settings)


@router.delete(
    "/{id}",
    status_code=204,
    responses={**UNAUTHORIZED_RESPONSES, **NOT_FOUND_RESPONSES},
)
def remove_host_meeting_type(
    id: str,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
) -> None:
    record = get_meeting_type(session, host, id)
    session.delete(record)
    session.commit()


def set_meeting_type_status(
    session: Session,
    host: HostRecord,
    meeting_type_id: str,
    status: str,
    settings: Settings,
) -> MeetingTypeSchema:
    record = get_meeting_type(session, host, meeting_type_id)
    if record.status != status:
        record.status = status
        record.updated_at = utcnow()
        session.commit()
        session.refresh(record)
    return meeting_type_to_schema(record, settings)


@router.post(
    "/{id}/archive",
    response_model=MeetingTypeSchema,
    responses={**UNAUTHORIZED_RESPONSES, **NOT_FOUND_RESPONSES},
)
def archive_host_meeting_type(
    id: str,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> MeetingTypeSchema:
    return set_meeting_type_status(session, host, id, "archived", settings)


@router.post(
    "/{id}/unarchive",
    response_model=MeetingTypeSchema,
    responses={**UNAUTHORIZED_RESPONSES, **NOT_FOUND_RESPONSES},
)
def unarchive_host_meeting_type(
    id: str,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> MeetingTypeSchema:
    return set_meeting_type_status(session, host, id, "active", settings)
