from sqlalchemy import func, select

from app.db import create_db_engine, create_session_factory
from app.models import HostRecord
from app.security import verify_password
from app.seed import seed_host
from tests.helpers import run_migrations


def test_seed_creates_one_host_with_an_argon2id_hash(settings) -> None:
    run_migrations(settings.database_url)
    engine = create_db_engine(settings.database_url)
    try:
        with create_session_factory(engine)() as session:
            host = seed_host(
                session,
                email=settings.host_email,
                password=settings.host_password,
                timezone=settings.host_timezone,
            )

            assert host.email == settings.host_email
            assert host.timezone == settings.host_timezone
            assert host.password_hash.startswith("$argon2id$")
            assert settings.host_password not in host.password_hash
            assert verify_password(host.password_hash, settings.host_password)
    finally:
        engine.dispose()


def test_repeated_seed_updates_the_existing_host(settings) -> None:
    run_migrations(settings.database_url)
    engine = create_db_engine(settings.database_url)
    new_password = "a brand new passphrase"
    try:
        with create_session_factory(engine)() as session:
            first = seed_host(
                session,
                email=settings.host_email,
                password=settings.host_password,
                timezone=settings.host_timezone,
            )
            first_id = first.id

            updated = seed_host(
                session,
                email=f"  {settings.host_email.upper()} ",
                password=new_password,
                timezone="America/New_York",
            )

            count = session.scalar(
                select(func.count()).select_from(HostRecord)
            )
            assert count == 1
            assert updated.id == first_id
            assert updated.email == settings.host_email
            assert updated.timezone == "America/New_York"
            assert verify_password(updated.password_hash, new_password)
    finally:
        engine.dispose()
