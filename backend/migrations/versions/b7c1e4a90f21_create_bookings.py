"""create bookings and idempotency keys

Revision ID: b7c1e4a90f21
Revises: d2dab274bd23
Create Date: 2026-10-20 23:59:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import app.db

# revision identifiers, used by Alembic.
revision: str = "b7c1e4a90f21"
down_revision: str | Sequence[str] | None = "d2dab274bd23"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bookings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("host_id", sa.String(length=36), nullable=False),
        sa.Column("meeting_type_id", sa.String(length=36), nullable=False),
        sa.Column("guest_name", sa.String(length=200), nullable=False),
        sa.Column("guest_email", sa.String(length=320), nullable=False),
        sa.Column("comment", sa.String(length=1000), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("starts_at", app.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("ends_at", app.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("expires_at", app.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("cancelled_at", app.db.UTCDateTime(timezone=True), nullable=True),
        sa.Column("cancelled_by", sa.String(length=16), nullable=True),
        sa.Column("cancellation_reason", sa.String(length=500), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", app.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", app.db.UTCDateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'confirmed', 'cancelled', 'expired')",
            name="ck_bookings_status",
        ),
        sa.CheckConstraint(
            "cancelled_by IS NULL OR cancelled_by IN ('guest', 'host')",
            name="ck_bookings_cancelled_by",
        ),
        sa.CheckConstraint("starts_at < ends_at", name="ck_bookings_time_order"),
        sa.CheckConstraint(
            "expires_at <= starts_at", name="ck_bookings_expires_at"
        ),
        sa.ForeignKeyConstraint(
            ["meeting_type_id"], ["meeting_types.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["host_id"], ["hosts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_bookings_host_active_start",
        "bookings",
        ["host_id", "starts_at"],
        unique=True,
        sqlite_where=sa.text("status IN ('pending', 'confirmed')"),
        postgresql_where=sa.text("status IN ('pending', 'confirmed')"),
    )
    op.create_index(
        "ix_bookings_host_starts_at", "bookings", ["host_id", "starts_at"]
    )
    op.create_index("ix_bookings_expires_at", "bookings", ["expires_at"])
    op.create_index(
        "uq_bookings_token_hash", "bookings", ["token_hash"], unique=True
    )
    op.create_index(
        "ix_bookings_meeting_type_id", "bookings", ["meeting_type_id"]
    )

    op.create_table(
        "idempotency_keys",
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("booking_id", sa.String(length=36), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", app.db.UTCDateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("idempotency_keys")
    op.drop_index("ix_bookings_meeting_type_id", table_name="bookings")
    op.drop_index("uq_bookings_token_hash", table_name="bookings")
    op.drop_index("ix_bookings_expires_at", table_name="bookings")
    op.drop_index("ix_bookings_host_starts_at", table_name="bookings")
    op.drop_index("uq_bookings_host_active_start", table_name="bookings")
    op.drop_table("bookings")
