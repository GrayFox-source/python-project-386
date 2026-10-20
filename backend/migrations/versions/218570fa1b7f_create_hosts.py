"""create hosts

Revision ID: 218570fa1b7f
Revises:
Create Date: 2026-10-20 18:31:33.355576

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "218570fa1b7f"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "hosts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("hosts", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_hosts_email"), ["email"], unique=True
        )


def downgrade() -> None:
    with op.batch_alter_table("hosts", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_hosts_email"))

    op.drop_table("hosts")
