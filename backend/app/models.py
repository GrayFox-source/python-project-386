from datetime import date as date_type
from datetime import datetime, time
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Time,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime, utcnow


def new_id() -> str:
    return str(uuid4())


def normalize_email(email: str) -> str:
    return email.strip().lower()


class HostRecord(Base):
    __tablename__ = "hosts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(
        String(320), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, onupdate=utcnow, nullable=False
    )


class AvailabilityRecord(Base):
    __tablename__ = "availabilities"
    __table_args__ = (
        Index(
            "uq_availabilities_host_name",
            "host_id",
            "name_key",
            unique=True,
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    host_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_key: Mapped[str] = mapped_column(String(200), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, onupdate=utcnow, nullable=False
    )


class AvailabilityRuleRecord(Base):
    __tablename__ = "availability_rules"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('weekly', 'override')",
            name="ck_availability_rules_kind",
        ),
        CheckConstraint(
            "(kind = 'weekly' AND day_of_week BETWEEN 1 AND 7 "
            "AND date IS NULL AND start_time IS NOT NULL "
            "AND end_time IS NOT NULL AND is_closed = 0) "
            "OR (kind = 'override' AND day_of_week IS NULL "
            "AND date IS NOT NULL AND ((is_closed = 1 "
            "AND start_time IS NULL AND end_time IS NULL) "
            "OR (is_closed = 0 AND start_time IS NOT NULL "
            "AND end_time IS NOT NULL)))",
            name="ck_availability_rules_shape",
        ),
        CheckConstraint(
            "start_time IS NULL OR end_time IS NULL OR start_time < end_time",
            name="ck_availability_rules_time_order",
        ),
        Index("ix_availability_rules_availability_id", "availability_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    availability_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("availabilities.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    day_of_week: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    date: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class MeetingTypeRecord(Base):
    __tablename__ = "meeting_types"
    __table_args__ = (
        Index(
            "uq_meeting_types_host_slug",
            "host_id",
            "slug",
            unique=True,
        ),
        Index("ix_meeting_types_availability_id", "availability_id"),
        Index("ix_meeting_types_host_created", "host_id", "created_at"),
        CheckConstraint(
            "format IN ('online', 'offline')",
            name="ck_meeting_types_format",
        ),
        CheckConstraint(
            "status IN ('active', 'archived')",
            name="ck_meeting_types_status",
        ),
        CheckConstraint(
            "duration_minutes BETWEEN 5 AND 480",
            name="ck_meeting_types_duration",
        ),
        CheckConstraint(
            "buffer_before_minutes BETWEEN 0 AND 120",
            name="ck_meeting_types_buffer_before",
        ),
        CheckConstraint(
            "buffer_after_minutes BETWEEN 0 AND 120",
            name="ck_meeting_types_buffer_after",
        ),
        CheckConstraint(
            "minimum_notice_minutes BETWEEN 0 AND 10080",
            name="ck_meeting_types_minimum_notice",
        ),
        CheckConstraint(
            "booking_horizon_days BETWEEN 1 AND 365",
            name="ck_meeting_types_booking_horizon",
        ),
        CheckConstraint(
            "slot_interval_minutes BETWEEN 5 AND 480",
            name="ck_meeting_types_slot_interval",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    host_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False
    )
    availability_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("availabilities.id", ondelete="RESTRICT"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    duration_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    format: Mapped[str] = mapped_column(String(16), nullable=False)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)
    buffer_before_minutes: Mapped[int] = mapped_column(
        SmallInteger, default=0, nullable=False
    )
    buffer_after_minutes: Mapped[int] = mapped_column(
        SmallInteger, default=0, nullable=False
    )
    minimum_notice_minutes: Mapped[int] = mapped_column(
        SmallInteger, default=120, nullable=False
    )
    booking_horizon_days: Mapped[int] = mapped_column(
        SmallInteger, default=60, nullable=False
    )
    slot_interval_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, onupdate=utcnow, nullable=False
    )


class BookingRecord(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        Index(
            "uq_bookings_host_active_start",
            "host_id",
            "starts_at",
            unique=True,
            sqlite_where=text("status IN ('pending', 'confirmed')"),
            postgresql_where=text("status IN ('pending', 'confirmed')"),
        ),
        Index("ix_bookings_host_starts_at", "host_id", "starts_at"),
        Index("ix_bookings_expires_at", "expires_at"),
        Index("uq_bookings_token_hash", "token_hash", unique=True),
        Index("ix_bookings_meeting_type_id", "meeting_type_id"),
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'cancelled', 'expired')",
            name="ck_bookings_status",
        ),
        CheckConstraint(
            "cancelled_by IS NULL OR cancelled_by IN ('guest', 'host')",
            name="ck_bookings_cancelled_by",
        ),
        CheckConstraint(
            "starts_at < ends_at",
            name="ck_bookings_time_order",
        ),
        CheckConstraint(
            "expires_at <= starts_at",
            name="ck_bookings_expires_at",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    host_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("hosts.id", ondelete="CASCADE"), nullable=False
    )
    meeting_type_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("meeting_types.id", ondelete="RESTRICT"),
        nullable=False,
    )
    guest_name: Mapped[str] = mapped_column(String(200), nullable=False)
    guest_email: Mapped[str] = mapped_column(String(320), nullable=False)
    comment: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), default="pending", nullable=False
    )
    starts_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(
        UTCDateTime(), nullable=True
    )
    cancelled_by: Mapped[str | None] = mapped_column(String(16), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, onupdate=utcnow, nullable=False
    )


class IdempotencyKeyRecord(Base):
    __tablename__ = "idempotency_keys"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    booking_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
    )
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
