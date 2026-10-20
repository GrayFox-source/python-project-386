from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import router as auth_router
from app.availability import router as availability_router
from app.booking_page import router as booking_page_router
from app.bookings import (
    guest_router as guest_bookings_router,
)
from app.bookings import (
    host_router as host_bookings_router,
)
from app.bookings import (
    public_router as public_bookings_router,
)
from app.config import Settings, get_settings
from app.db import create_db_engine, create_session_factory
from app.meeting_types import router as meeting_types_router


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or get_settings()
    engine = create_db_engine(app_settings.database_url)
    session_factory = create_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        engine.dispose()

    app = FastAPI(title="Cal.com Clone API", lifespan=lifespan)
    app.state.settings = app_settings
    app.state.engine = engine
    app.state.session_factory = session_factory

    if not app_settings.is_production:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=app_settings.allowed_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.get("/health")
    def health_check() -> dict[str, str]:
        return {"status": "ok", "service": "backend"}

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        details = [
            {key: error[key] for key in ("loc", "msg", "type") if key in error}
            for error in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": details})

    app.include_router(auth_router)
    app.include_router(availability_router)
    app.include_router(meeting_types_router)
    app.include_router(booking_page_router)
    app.include_router(public_bookings_router)
    app.include_router(guest_bookings_router)
    app.include_router(host_bookings_router)
    return app
