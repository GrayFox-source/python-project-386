import os
from pathlib import Path

os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret")

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.seed import seed_host
from tests.helpers import (
    TEST_EMAIL,
    TEST_JWT_SECRET,
    TEST_PASSWORD,
    TEST_TIMEZONE,
    run_migrations,
)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        jwt_secret=TEST_JWT_SECRET,
        environment="development",
        host_email=TEST_EMAIL,
        host_password=TEST_PASSWORD,
        host_timezone=TEST_TIMEZONE,
    )


@pytest.fixture
def app(settings: Settings):
    run_migrations(settings.database_url)
    application = create_app(settings)
    with application.state.session_factory() as session:
        seed_host(
            session,
            email=TEST_EMAIL,
            password=TEST_PASSWORD,
            timezone=TEST_TIMEZONE,
        )
    return application


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client
