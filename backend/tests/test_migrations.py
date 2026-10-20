from pathlib import Path

from sqlalchemy import create_engine, inspect

from tests.helpers import run_migrations


def test_migrations_apply_to_empty_database(tmp_path: Path) -> None:
    database_url = f"sqlite:///{tmp_path / 'empty.db'}"

    run_migrations(database_url)

    inspector = inspect(create_engine(database_url))
    assert "hosts" in inspector.get_table_names()
    assert "alembic_version" in inspector.get_table_names()
    assert {column["name"] for column in inspector.get_columns("hosts")} == {
        "id",
        "email",
        "password_hash",
        "timezone",
        "created_at",
        "updated_at",
    }
