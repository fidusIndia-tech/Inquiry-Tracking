"""
Shared SQLAlchemy database setup.

Set DATABASE_URL in .env for production, for example:
  DATABASE_URL=postgresql://user:pass@localhost:5432/gmail_db
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from config import get_settings

settings = get_settings()

DATABASE_URL = settings.DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    echo=False,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


def init_db() -> None:
    """Import models and create all known tables."""
    import models.email_model  # noqa: F401
    import models.rfq_model  # noqa: F401
    import models.user_model  # noqa: F401

    Base.metadata.create_all(bind=engine)
