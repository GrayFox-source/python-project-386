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
