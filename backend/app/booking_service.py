from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import BookingRecord, MeetingTypeRecord
from app.slots import BusyBooking


def expire_pending(session: Session, now: datetime) -> None:
    session.execute(
        update(BookingRecord)
        .where(
            BookingRecord.status == "pending",
            BookingRecord.expires_at <= now,
        )
        .values(status="expired", updated_at=now)
    )


def active_busy(session: Session, host_id: str) -> list[BusyBooking]:
    rows = session.execute(
        select(BookingRecord, MeetingTypeRecord)
        .join(
            MeetingTypeRecord,
            BookingRecord.meeting_type_id == MeetingTypeRecord.id,
        )
        .where(
            BookingRecord.host_id == host_id,
            BookingRecord.status.in_(("pending", "confirmed")),
        )
    ).all()

    return [
        BusyBooking(
            starts_at=booking.starts_at,
            ends_at=booking.ends_at,
            buffer_before_minutes=meeting_type.buffer_before_minutes,
            buffer_after_minutes=meeting_type.buffer_after_minutes,
        )
        for booking, meeting_type in rows
    ]
