from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.config import Settings

JWT_ALGORITHM = "HS256"
password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def create_session_token(
    host_id: str,
    settings: Settings,
    now: datetime | None = None,
) -> str:
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + timedelta(days=settings.jwt_ttl_days)
    return jwt.encode(
        {"sub": host_id, "iat": issued_at, "exp": expires_at},
        settings.jwt_secret,
        algorithm=JWT_ALGORITHM,
    )


def decode_session_token(token: str, settings: Settings) -> str | None:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp"]},
        )
    except jwt.InvalidTokenError:
        return None

    subject = payload.get("sub")
    return subject if isinstance(subject, str) and subject else None
