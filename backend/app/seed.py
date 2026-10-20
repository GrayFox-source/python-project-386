from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import create_db_engine, create_session_factory
from app.models import HostRecord, normalize_email
from app.security import hash_password


def seed_host(
    session: Session,
    *,
    email: str,
    password: str,
    timezone: str,
) -> HostRecord:
    hosts = session.scalars(select(HostRecord).order_by(HostRecord.created_at)).all()
    if len(hosts) > 1:
        raise RuntimeError("Expected at most one Host, found several")

    normalized_email = normalize_email(email)
    if hosts:
        host = hosts[0]
        host.email = normalized_email
        host.password_hash = hash_password(password)
        host.timezone = timezone
    else:
        host = HostRecord(
            email=normalized_email,
            password_hash=hash_password(password),
            timezone=timezone,
        )
        session.add(host)

    session.commit()
    session.refresh(host)
    return host


def main() -> None:
    settings = get_settings()
    if not (
        settings.host_email
        and settings.host_password
        and settings.host_timezone
    ):
        raise SystemExit(
            "HOST_EMAIL, HOST_PASSWORD and HOST_TIMEZONE must be set"
        )

    engine = create_db_engine(settings.database_url)
    try:
        with create_session_factory(engine)() as session:
            host = seed_host(
                session,
                email=settings.host_email,
                password=settings.host_password,
                timezone=settings.host_timezone,
            )
            print(f"Seeded Host {host.email} ({host.id})")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
