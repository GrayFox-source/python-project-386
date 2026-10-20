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
    is_closed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
