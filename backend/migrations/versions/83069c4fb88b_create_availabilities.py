"""create availabilities

Revision ID: 83069c4fb88b
Revises: 218570fa1b7f
Create Date: 2026-10-20 19:05:20.143758

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import app.db

revision: str = "83069c4fb88b"
down_revision: str | Sequence[str] | None = "218570fa1b7f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "availabilities",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("host_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("name_key", sa.String(length=200), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", app.db.UTCDateTime(timezone=True), nullable=False
        ),
        sa.Column(
            "updated_at", app.db.UTCDateTime(timezone=True), nullable=False
        ),
        sa.ForeignKeyConstraint(["host_id"], ["hosts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_availabilities_host_name",
        "availabilities",
        ["host_id", "name_key"],
        unique=True,
    )

    op.create_table(
        "availability_rules",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("availability_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("day_of_week", sa.SmallInteger(), nullable=True),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("is_closed", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('weekly', 'override')",
            name="ck_availability_rules_kind",
        ),
        sa.CheckConstraint(
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
        sa.CheckConstraint(
            "start_time IS NULL OR end_time IS NULL OR start_time < end_time",
            name="ck_availability_rules_time_order",
        ),
        sa.ForeignKeyConstraint(
            ["availability_id"],
            ["availabilities.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("availability_rules", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_availability_rules_availability_id"),
            ["availability_id"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("availability_rules", schema=None) as batch_op:
        batch_op.drop_index(
            batch_op.f("ix_availability_rules_availability_id")
        )

    op.drop_table("availability_rules")
    op.drop_index(
        "uq_availabilities_host_name",
        table_name="availabilities",
    )
    op.drop_table("availabilities")
