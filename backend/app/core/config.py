import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    oidc_jwks_url: str
    oidc_issuer: str | None = None
    oidc_audience: str | None = None
    oidc_clock_skew_seconds: int = 300
    oidc_jwks_cache_ttl_seconds: int = 300
    frontend_origin: str = "http://localhost:3000"
    app_name: str = "social-commerce-backend"


def _read_required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_settings() -> Settings:
    return Settings(
        database_url=_read_required_env("DATABASE_URL"),
        oidc_jwks_url=_read_required_env("OIDC_JWKS_URL"),
        oidc_issuer=os.getenv("OIDC_ISSUER"),
        oidc_audience=os.getenv("OIDC_AUDIENCE"),
        oidc_clock_skew_seconds=int(os.getenv("OIDC_CLOCK_SKEW_SECONDS", "300")),
        oidc_jwks_cache_ttl_seconds=int(os.getenv("OIDC_JWKS_CACHE_TTL_SECONDS", "300")),
        frontend_origin=os.getenv("FRONTEND_ORIGIN", "http://localhost:3000"),
        app_name=os.getenv("APP_NAME", "social-commerce-backend"),
    )
