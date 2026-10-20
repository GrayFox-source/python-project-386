from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./booking.db"
    jwt_secret: str = Field(min_length=32)
    environment: str = "development"

    host_email: str = ""
    host_password: str = ""
    host_timezone: str = ""

    cors_origins: str = "http://localhost:5173"
    cookie_name: str = "host_session"
    jwt_ttl_days: int = 7
    public_base_url: str = "http://localhost:5173"

    @field_validator("host_timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        if not value:
            return value

        try:
            ZoneInfo(value)
        except (ValueError, ZoneInfoNotFoundError) as exc:
            raise ValueError(f"Unknown IANA timezone: {value}") from exc
        return value

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def secure_cookies(self) -> bool:
        return self.is_production

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin]

    @property
    def allow_all_origins(self) -> bool:
        return "*" in self.allowed_origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
