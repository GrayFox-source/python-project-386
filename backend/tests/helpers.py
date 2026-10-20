from pathlib import Path

from alembic import command
from alembic.config import Config

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_JWT_SECRET = "test-secret-test-secret-test-secret"
TEST_EMAIL = "host@example.com"
TEST_PASSWORD = "correct horse battery staple"
TEST_TIMEZONE = "Europe/Moscow"


def run_migrations(database_url: str) -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")
