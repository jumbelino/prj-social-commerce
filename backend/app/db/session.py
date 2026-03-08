import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .url import normalize_database_url


def _read_database_url() -> str:
    value = os.getenv("DATABASE_URL")
    if value is None or value.strip() == "":
        raise RuntimeError("Missing required environment variable: DATABASE_URL")
    return value


engine = create_engine(normalize_database_url(_read_database_url()), future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)


def get_db_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
