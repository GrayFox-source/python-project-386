from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_db
from app.models import HostRecord, normalize_email
from app.security import (
    create_session_token,
    decode_session_token,
    verify_password,
)
from generated.models import Host as HostSchema
from generated.models import LoginRequest, UnauthorizedError

router = APIRouter(prefix="/auth", tags=["Auth"])

UNAUTHORIZED_RESPONSES = {401: {"model": UnauthorizedError}}


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def unauthorized(message: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=401,
        detail={"code": "unauthorized", "message": message},
    )


def get_current_host(
    request: Request,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> HostRecord:
    token = request.cookies.get(settings.cookie_name)
    if not token:
        raise unauthorized()

    host_id = decode_session_token(token, settings)
    if host_id is None:
        raise unauthorized()

    host = session.get(HostRecord, host_id)
    if host is None:
        raise unauthorized()

    return host


def host_to_schema(host: HostRecord) -> HostSchema:
    return HostSchema(
        id=host.id,
        email=host.email,
        timezone=host.timezone,
        created_at=host.created_at,
        updated_at=host.updated_at,
    )


@router.post(
    "/login",
    response_model=HostSchema,
    responses=UNAUTHORIZED_RESPONSES,
)
def login(
    credentials: LoginRequest,
    response: Response,
    session: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> HostSchema:
    email = normalize_email(credentials.email)
    host = session.scalar(
        select(HostRecord).where(func.lower(HostRecord.email) == email)
    )
    if host is None or not verify_password(host.password_hash, credentials.password):
        raise unauthorized("Invalid email or password.")

    response.set_cookie(
        key=settings.cookie_name,
        value=create_session_token(host.id, settings),
        max_age=settings.jwt_ttl_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )
    return host_to_schema(host)


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    settings: Settings = Depends(get_app_settings),
) -> None:
    response.delete_cookie(
        key=settings.cookie_name,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )


@router.get(
    "/me",
    response_model=HostSchema,
    responses=UNAUTHORIZED_RESPONSES,
)
def me(host: HostRecord = Depends(get_current_host)) -> HostSchema:
    return host_to_schema(host)
