# pyright: reportMissingImports=false

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.engine import Engine

DEFAULT_TEST_DATABASE_URL = "postgresql://social_commerce:social_commerce@localhost:5432/social_commerce"

TABLES_TO_TRUNCATE = (
    "payments",
    "order_items",
    "product_images",
    "product_variants",
    "orders",
    "products",
    "customers",
)


def _ensure_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if database_url is None or database_url.strip() == "":
        database_url = DEFAULT_TEST_DATABASE_URL
    os.environ["DATABASE_URL"] = database_url
    return database_url


@pytest.fixture(scope="session", autouse=True)
def _apply_migrations() -> None:
    database_url = _ensure_database_url()
    os.environ.setdefault("OIDC_JWKS_URL", "http://localhost/test-jwks")

    backend_dir = Path(__file__).resolve().parents[1]
    alembic_cfg = Config(str(backend_dir / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", database_url)
    try:
        command.upgrade(alembic_cfg, "head")
    except Exception as exc:
        pytest.skip(f"Skipping backend integration tests: database not reachable at {database_url}: {exc}")


@pytest.fixture(scope="session")
def db_engine() -> Engine:
    _ensure_database_url()
    os.environ.setdefault("OIDC_JWKS_URL", "http://localhost/test-jwks")
    from app.db.session import engine

    return engine


@pytest.fixture(autouse=True)
def clean_database(db_engine: Engine) -> Iterator[None]:
    truncate_sql = f"TRUNCATE TABLE {', '.join(TABLES_TO_TRUNCATE)} RESTART IDENTITY CASCADE"
    with db_engine.begin() as connection:
        connection.execute(text(truncate_sql))
    yield
    with db_engine.begin() as connection:
        connection.execute(text(truncate_sql))


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    os.environ.setdefault("OIDC_JWKS_URL", "http://localhost/test-jwks")
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_session() -> Iterator[object]:
    from app.db.session import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
