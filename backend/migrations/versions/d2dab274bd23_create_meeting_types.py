"""create meeting types

Revision ID: d2dab274bd23
Revises: 83069c4fb88b
Create Date: 2026-10-20 19:21:14.081240

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import app.db

# revision identifiers, used by Alembic.
revision: str = "d2dab274bd23"
down_revision: str | Sequence[str] | None = "83069c4fb88b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "meeting_types",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("host_id", sa.String(length=36), nullable=False),
        sa.Column("availability_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column("duration_minutes", sa.SmallInteger(), nullable=False),
        sa.Column("format", sa.String(length=16), nullable=False),
        sa.Column("location", sa.String(length=500), nullable=True),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("buffer_before_minutes", sa.SmallInteger(), nullable=False),
        sa.Column("buffer_after_minutes", sa.SmallInteger(), nullable=False),
        sa.Column("minimum_notice_minutes", sa.SmallInteger(), nullable=False),
        sa.Column("booking_horizon_days", sa.SmallInteger(), nullable=False),
        sa.Column("slot_interval_minutes", sa.SmallInteger(), nullable=False),
        sa.Column("created_at", app.db.UTCDateTime(timezone=True), nullable=False),
        sa.Column("updated_at", app.db.UTCDateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "format IN ('online', 'offline')", name="ck_meeting_types_format"
        ),
        sa.CheckConstraint(
            "status IN ('active', 'archived')", name="ck_meeting_types_status"
        ),
        sa.CheckConstraint(
            "booking_horizon_days BETWEEN 1 AND 365",
            name="ck_meeting_types_booking_horizon",
        ),
        sa.CheckConstraint(
            "buffer_after_minutes BETWEEN 0 AND 120",
            name="ck_meeting_types_buffer_after",
        ),
        sa.CheckConstraint(
            "buffer_before_minutes BETWEEN 0 AND 120",
            name="ck_meeting_types_buffer_before",
        ),
        sa.CheckConstraint(
            "duration_minutes BETWEEN 5 AND 480", name="ck_meeting_types_duration"
        ),
        sa.CheckConstraint(
            "minimum_notice_minutes BETWEEN 0 AND 10080",
            name="ck_meeting_types_minimum_notice",
        ),
        sa.CheckConstraint(
            "slot_interval_minutes BETWEEN 5 AND 480",
            name="ck_meeting_types_slot_interval",
        ),
        sa.ForeignKeyConstraint(
            ["availability_id"], ["availabilities.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["host_id"], ["hosts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("meeting_types", schema=None) as batch_op:
        batch_op.create_index(
            "ix_meeting_types_availability_id", ["availability_id"], unique=False
        )
        batch_op.create_index(
            "ix_meeting_types_host_created", ["host_id", "created_at"], unique=False
        )
        batch_op.create_index(
            "uq_meeting_types_host_slug", ["host_id", "slug"], unique=True
        )


def downgrade() -> None:
    with op.batch_alter_table("meeting_types", schema=None) as batch_op:
        batch_op.drop_index("uq_meeting_types_host_slug")
        batch_op.drop_index("ix_meeting_types_host_created")
        batch_op.drop_index("ix_meeting_types_availability_id")

    op.drop_table("meeting_types")
