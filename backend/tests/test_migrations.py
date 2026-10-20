from pathlib import Path

from sqlalchemy import create_engine, inspect

from tests.helpers import run_migrations


def test_migrations_apply_to_empty_database(tmp_path: Path) -> None:
    database_url = f"sqlite:///{tmp_path / 'empty.db'}"

    run_migrations(database_url)

    inspector = inspect(create_engine(database_url))
    assert {
        "hosts",
        "availabilities",
        "availability_rules",
        "meeting_types",
        "alembic_version",
    } <= set(inspector.get_table_names())
    assert {column["name"] for column in inspector.get_columns("hosts")} == {
        "id",
        "email",
        "password_hash",
        "timezone",
        "created_at",
        "updated_at",
    }

    assert {column["name"] for column in inspector.get_columns("availabilities")} == {
        "id",
        "host_id",
        "name",
        "name_key",
        "timezone",
        "created_at",
        "updated_at",
    }
    assert {
        column["name"] for column in inspector.get_columns("availability_rules")
    } == {
        "id",
        "availability_id",
        "kind",
        "day_of_week",
        "date",
        "start_time",
        "end_time",
        "is_closed",
    }
    assert {column["name"] for column in inspector.get_columns("meeting_types")} == {
        "id",
        "host_id",
        "availability_id",
        "title",
        "description",
        "duration_minutes",
        "format",
        "location",
        "slug",
        "status",
        "buffer_before_minutes",
        "buffer_after_minutes",
        "minimum_notice_minutes",
        "booking_horizon_days",
        "slot_interval_minutes",
        "created_at",
        "updated_at",
    }
    assert {index["name"] for index in inspector.get_indexes("meeting_types")} >= {
        "ix_meeting_types_availability_id",
        "ix_meeting_types_host_created",
        "uq_meeting_types_host_slug",
    }
