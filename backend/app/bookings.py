import hashlib
import json
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import NoReturn
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    UNAUTHORIZED_RESPONSES,
    get_app_settings,
    get_current_host,
)
from app.availability import validate_timezone
from app.booking_page import (
    get_now,
    require_active_meeting_type,
    time_windows,
)
from app.booking_service import active_busy, expire_pending
from app.config import Settings
from app.db import begin_write, get_db
from app.errors import domain_error, validation_error
from app.models import (
    AvailabilityRecord,
    BookingRecord,
    HostRecord,
    IdempotencyKeyRecord,
    MeetingTypeRecord,
    normalize_email,
)
from app.slots import BusyBooking, generate_slots
from generated.models import (
    BookingCancel,
    BookingCreate,
    BookingCreated,
    BookingMeetingTypeSummary,
    BookingStatus,
    CancelledBy,
    ConflictError,
    GuestBookingView,
    HostBooking,
    HostBookingListResponse,
    MeetingTypeFormat,
    NotFoundError,
    ValidationErrorResponse,
)

public_router = APIRouter(prefix="/book", tags=["Booking Page"])
guest_router = APIRouter(prefix="/bookings", tags=["Guest Bookings"])
host_router = APIRouter(prefix="/hosts/me/bookings", tags=["Host Bookings"])

NOT_FOUND_RESPONSES = {404: {"model": NotFoundError}}
CONFLICT_RESPONSES = {409: {"model": ConflictError}}
VALIDATION_RESPONSES = {422: {"model": ValidationErrorResponse}}

TOKEN_TTL = timedelta(hours=24)
GUEST_VIEW_WINDOW = timedelta(days=7)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def booking_not_found() -> NoReturn:
    domain_error(404, "booking_not_found", "Booking not found.")


def invalid_transition() -> NoReturn:
    domain_error(
        409,
        "invalid_state_transition",
        "This Booking cannot change state.",
    )


def booking_started() -> NoReturn:
    domain_error(409, "booking_started", "The Booking has already started.")


def slot_taken() -> NoReturn:
    domain_error(409, "slot_taken", "This Slot is already taken.")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def request_hash(slug: str, payload: BookingCreate) -> str:
    body = json.dumps(
        {
            "slug": slug,
            "body": payload.model_dump(mode="json"),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(body.encode()).hexdigest()


def validate_guest(
    payload: BookingCreate,
) -> tuple[str, str, str | None]:
    name = payload.guest_name.strip()
    if not 1 <= len(name) <= 200:
        validation_error(
            ["guest_name"],
            "Guest name must contain between 1 and 200 characters.",
        )

    email = normalize_email(payload.guest_email)
    if len(email) > 320 or EMAIL_RE.fullmatch(email) is None:
        validation_error(["guest_email"], "Enter a valid email address.")

    comment = payload.comment.strip() if payload.comment is not None else None
    if comment == "":
        comment = None
    if comment is not None and len(comment) > 1000:
        validation_error(
            ["comment"], "Comment must be at most 1000 characters."
        )

    return name, email, comment


def validate_cancellation_reason(value: str | None) -> str | None:
    if value is None:
        return None
    reason = value.strip()
    if not reason:
        return None
    if len(reason) > 500:
        validation_error(
            ["cancellation_reason"],
            "Cancellation reason must be at most 500 characters.",
        )
    return reason


def is_valid_slot(
    session: Session,
    meeting_type: MeetingTypeRecord,
    availability: AvailabilityRecord,
    starts_at: datetime,
    now: datetime,
) -> bool:
    zone = ZoneInfo(validate_timezone(availability.timezone))
    local_date = starts_at.astimezone(zone).date()
    weekly, overrides = time_windows(session, availability.id)
    slots = generate_slots(
        weekly=weekly,
        overrides=overrides,
        availability_timezone=availability.timezone,
        display_timezone=availability.timezone,
        display_from=local_date,
        display_to=local_date,
        now=now,
        duration_minutes=meeting_type.duration_minutes,
        slot_interval_minutes=meeting_type.slot_interval_minutes,
        minimum_notice_minutes=meeting_type.minimum_notice_minutes,
        booking_horizon_days=meeting_type.booking_horizon_days,
        buffer_before_minutes=meeting_type.buffer_before_minutes,
        buffer_after_minutes=meeting_type.buffer_after_minutes,
        busy=[],
    )
    return any(slot.start == starts_at for slot in slots)


def overlaps_busy(
    busy: list[BusyBooking],
    starts_at: datetime,
    ends_at: datetime,
    buffer_before_minutes: int,
    buffer_after_minutes: int,
) -> bool:
    for booking in busy:
        busy_start = booking.starts_at - timedelta(
            minutes=booking.buffer_before_minutes + buffer_after_minutes
        )
        busy_end = booking.ends_at + timedelta(
            minutes=booking.buffer_after_minutes + buffer_before_minutes
        )
        if starts_at < busy_end and ends_at > busy_start:
            return True
    return False


def booking_fields(record: BookingRecord) -> dict[str, object]:
    return {
        "id": record.id,
        "meeting_type_id": record.meeting_type_id,
        "guest_name": record.guest_name,
        "guest_email": record.guest_email,
        "comment": record.comment,
        "status": BookingStatus(record.status),
        "starts_at": record.starts_at,
        "ends_at": record.ends_at,
        "expires_at": record.expires_at,
        "cancelled_at": record.cancelled_at,
        "cancelled_by": (
            CancelledBy(record.cancelled_by) if record.cancelled_by else None
        ),
        "cancellation_reason": record.cancellation_reason,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def booking_created(
    record: BookingRecord,
    settings: Settings,
    *,
    token: str | None,
) -> BookingCreated:
    booking_url = (
        f"{settings.public_base_url.rstrip('/')}/booking/{token}"
        if token is not None
        else None
    )
    return BookingCreated(
        **booking_fields(record),
        token=token,
        booking_url=booking_url,
    )


def host_booking(
    record: BookingRecord,
    meeting_type: MeetingTypeRecord,
) -> HostBooking:
    return HostBooking(
        **booking_fields(record),
        meeting_type_title=meeting_type.title,
        meeting_type_slug=meeting_type.slug,
    )


def guest_booking(
    record: BookingRecord,
    meeting_type: MeetingTypeRecord,
) -> GuestBookingView:
    return GuestBookingView(
        guest_name=record.guest_name,
        guest_email=record.guest_email,
        comment=record.comment,
        status=BookingStatus(record.status),
        starts_at=record.starts_at,
        ends_at=record.ends_at,
        expires_at=record.expires_at,
        cancelled_at=record.cancelled_at,
        cancelled_by=(
            CancelledBy(record.cancelled_by) if record.cancelled_by else None
        ),
        cancellation_reason=record.cancellation_reason,
        created_at=record.created_at,
        meeting_type=BookingMeetingTypeSummary(
            title=meeting_type.title,
            description=meeting_type.description,
            duration_minutes=meeting_type.duration_minutes,
            format=MeetingTypeFormat(meeting_type.format),
            location=meeting_type.location,
        ),
    )


def get_host_booking(
    session: Session,
    host: HostRecord,
    booking_id: str,
) -> tuple[BookingRecord, MeetingTypeRecord]:
    row = session.execute(
        select(BookingRecord, MeetingTypeRecord)
        .join(
            MeetingTypeRecord,
            BookingRecord.meeting_type_id == MeetingTypeRecord.id,
        )
        .where(
            BookingRecord.id == booking_id,
            BookingRecord.host_id == host.id,
        )
    ).first()
    if row is None:
        booking_not_found()
    return row[0], row[1]


def get_guest_booking(
    session: Session,
    token: str,
    now: datetime,
) -> tuple[BookingRecord, MeetingTypeRecord]:
    row = session.execute(
        select(BookingRecord, MeetingTypeRecord)
        .join(
            MeetingTypeRecord,
            BookingRecord.meeting_type_id == MeetingTypeRecord.id,
        )
        .where(BookingRecord.token_hash == hash_token(token))
    ).first()
    if row is None:
        booking_not_found()
    record = row[0]
    if now > record.starts_at + GUEST_VIEW_WINDOW:
        booking_not_found()
    return record, row[1]


def cancel_record(
    record: BookingRecord,
    cancelled_by: str,
    reason: str | None,
    now: datetime,
) -> None:
    record.status = "cancelled"
    record.cancelled_at = now
    record.cancelled_by = cancelled_by
    record.cancellation_reason = reason
    record.updated_at = now


@public_router.post(
    "/{slug}/bookings",
    response_model=BookingCreated,
    status_code=201,
    responses={
        **NOT_FOUND_RESPONSES,
        **CONFLICT_RESPONSES,
        **VALIDATION_RESPONSES,
    },
)
def create_booking(
    slug: str,
    payload: BookingCreate,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    session: Session = Depends(get_db),
    now: datetime = Depends(get_now),
    settings: Settings = Depends(get_app_settings),
) -> BookingCreated:
    name, email, comment = validate_guest(payload)
    key = idempotency_key.strip() if idempotency_key else None
    key = key or None
    digest = request_hash(slug, payload)

    begin_write(session)
    expire_pending(session, now)

    if key is not None:
        existing = session.get(IdempotencyKeyRecord, key)
        if existing is not None and existing.expires_at <= now:
            session.delete(existing)
            session.flush()
        elif existing is not None:
            if existing.request_hash != digest:
                domain_error(
                    409,
                    "idempotency_key_reused",
                    "This Idempotency-Key was used with a different payload.",
                )
            record = session.get(BookingRecord, existing.booking_id)
            if record is not None:
                session.commit()
                session.refresh(record)
                response.status_code = 200
                return booking_created(record, settings, token=None)
            session.delete(existing)
            session.flush()

    meeting_type = require_active_meeting_type(session, slug)
    availability = session.get(
        AvailabilityRecord, meeting_type.availability_id
    )
    if availability is None:
        domain_error(
            404, "meeting_type_not_found", "Meeting Type not found."
        )

    starts_at = payload.starts_at.astimezone(UTC)
    ends_at = starts_at + timedelta(minutes=meeting_type.duration_minutes)

    if not is_valid_slot(session, meeting_type, availability, starts_at, now):
        domain_error(
            409,
            "slot_unavailable",
            "The requested time is not an available Slot.",
        )

    busy = active_busy(session, meeting_type.host_id)
    if overlaps_busy(
        busy,
        starts_at,
        ends_at,
        meeting_type.buffer_before_minutes,
        meeting_type.buffer_after_minutes,
    ):
        slot_taken()

    token = secrets.token_urlsafe(32)
    expires_at = min(now + TOKEN_TTL, starts_at)
    record = BookingRecord(
        host_id=meeting_type.host_id,
        meeting_type_id=meeting_type.id,
        guest_name=name,
        guest_email=email,
        comment=comment,
        status="pending",
        starts_at=starts_at,
        ends_at=ends_at,
        expires_at=expires_at,
        token_hash=hash_token(token),
        created_at=now,
        updated_at=now,
    )
    session.add(record)
    session.flush()

    if key is not None:
        session.add(
            IdempotencyKeyRecord(
                key=key,
                booking_id=record.id,
                request_hash=digest,
                expires_at=now + TOKEN_TTL,
            )
        )

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        slot_taken()

    session.refresh(record)
    response.status_code = 201
    return booking_created(record, settings, token=token)


@guest_router.get(
    "/{token}",
    response_model=GuestBookingView,
    responses=NOT_FOUND_RESPONSES,
)
def get_guest_booking_by_token(
    token: str,
    session: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> GuestBookingView:
    begin_write(session)
    expire_pending(session, now)
    record, meeting_type = get_guest_booking(session, token, now)
    session.commit()
    session.refresh(record)
    return guest_booking(record, meeting_type)


@guest_router.post(
    "/{token}/cancel",
    response_model=GuestBookingView,
    responses={
        **NOT_FOUND_RESPONSES,
        **CONFLICT_RESPONSES,
        **VALIDATION_RESPONSES,
    },
)
def cancel_guest_booking(
    token: str,
    payload: BookingCancel,
    session: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> GuestBookingView:
    reason = validate_cancellation_reason(payload.cancellation_reason)
    begin_write(session)
    expire_pending(session, now)
    record, meeting_type = get_guest_booking(session, token, now)

    if now >= record.starts_at:
        booking_started()
    if record.status not in ("pending", "confirmed"):
        invalid_transition()

    cancel_record(record, "guest", reason, now)
    session.commit()
    session.refresh(record)
    return guest_booking(record, meeting_type)


@host_router.get(
    "",
    response_model=HostBookingListResponse,
    responses=UNAUTHORIZED_RESPONSES,
)
def list_host_bookings(
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
    now: datetime = Depends(get_now),
    status: BookingStatus | None = Query(default=None),
    from_value: datetime | None = Query(default=None, alias="from"),
    to_value: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> HostBookingListResponse:
    begin_write(session)
    expire_pending(session, now)

    filters = [BookingRecord.host_id == host.id]
    if status is not None:
        filters.append(BookingRecord.status == status.value)
    if from_value is not None:
        filters.append(BookingRecord.starts_at >= from_value)
    if to_value is not None:
        filters.append(BookingRecord.starts_at <= to_value)

    rows = session.execute(
        select(BookingRecord, MeetingTypeRecord)
        .join(
            MeetingTypeRecord,
            BookingRecord.meeting_type_id == MeetingTypeRecord.id,
        )
        .where(*filters)
        .order_by(BookingRecord.starts_at)
        .limit(limit)
        .offset(offset)
    ).all()
    total = session.scalar(
        select(func.count()).select_from(BookingRecord).where(*filters)
    )
    session.commit()

    return HostBookingListResponse(
        items=[
            host_booking(record, meeting_type)
            for record, meeting_type in rows
        ],
        total=total or 0,
    )


@host_router.get(
    "/{id}",
    response_model=HostBooking,
    responses={**UNAUTHORIZED_RESPONSES, **NOT_FOUND_RESPONSES},
)
def get_host_booking_by_id(
    id: str,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> HostBooking:
    begin_write(session)
    expire_pending(session, now)
    record, meeting_type = get_host_booking(session, host, id)
    session.commit()
    session.refresh(record)
    return host_booking(record, meeting_type)


@host_router.post(
    "/{id}/confirm",
    response_model=HostBooking,
    responses={
        **UNAUTHORIZED_RESPONSES,
        **NOT_FOUND_RESPONSES,
        **CONFLICT_RESPONSES,
    },
)
def confirm_host_booking(
    id: str,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> HostBooking:
    begin_write(session)
    expire_pending(session, now)
    record, meeting_type = get_host_booking(session, host, id)

    if now >= record.starts_at:
        booking_started()
    if record.status != "pending":
        invalid_transition()

    record.status = "confirmed"
    record.updated_at = now
    session.commit()
    session.refresh(record)
    return host_booking(record, meeting_type)


@host_router.post(
    "/{id}/cancel",
    response_model=HostBooking,
    responses={
        **UNAUTHORIZED_RESPONSES,
        **NOT_FOUND_RESPONSES,
        **CONFLICT_RESPONSES,
        **VALIDATION_RESPONSES,
    },
)
def cancel_host_booking(
    id: str,
    payload: BookingCancel,
    host: HostRecord = Depends(get_current_host),
    session: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> HostBooking:
    reason = validate_cancellation_reason(payload.cancellation_reason)
    begin_write(session)
    expire_pending(session, now)
    record, meeting_type = get_host_booking(session, host, id)

    if now >= record.starts_at:
        booking_started()
    if record.status not in ("pending", "confirmed"):
        invalid_transition()

    cancel_record(record, "host", reason, now)
    session.commit()
    session.refresh(record)
    return host_booking(record, meeting_type)
