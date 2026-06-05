"""
Database-backed Gmail tenant credentials.

One OAuth client app can serve many Gmail accounts. Each connected Gmail
mailbox gets one row in users with its own refresh token and historyId.
"""

import json
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from config import get_settings
from database import Base, SessionLocal, engine
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()


def _fernet():
    if not settings.CREDENTIAL_ENCRYPTION_KEY:
        return None

    from cryptography.fernet import Fernet

    return Fernet(settings.CREDENTIAL_ENCRYPTION_KEY.encode("utf-8"))


def _encrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    fernet = _fernet()
    if fernet is None:
        if settings.APP_ENV != "development":
            raise ValueError("CREDENTIAL_ENCRYPTION_KEY is required outside development")
        return value
    return fernet.encrypt(value.encode("utf-8")).decode("utf-8")


def _decrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    fernet = _fernet()
    if fernet is None:
        return value
    return fernet.decrypt(value.encode("utf-8")).decode("utf-8")


class User(Base):
    __tablename__ = "gmail_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    refresh_token = Column(Text, nullable=False)
    access_token = Column(Text, nullable=True)
    access_token_expiry = Column(DateTime, nullable=True)
    history_id = Column(String(64), nullable=True, index=True)
    scopes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


def init_user_db() -> None:
    Base.metadata.create_all(bind=engine)


def save_user_credentials(
    email: str,
    refresh_token: str | None,
    access_token: str | None = None,
    access_token_expiry: datetime | None = None,
    history_id: str | int | None = None,
    scopes: list[str] | tuple[str, ...] | str | None = None,
) -> User:
    """
    Insert or update one Gmail tenant.

    Google may not return refresh_token on every OAuth callback. Keep the
    existing refresh token in that case, otherwise the user would be stranded.
    """
    if not email:
        raise ValueError("email is required")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one_or_none()
        if user is None:
            if not refresh_token:
                raise ValueError("refresh_token is required for a new Gmail user")
            user = User(email=email, refresh_token=_encrypt_secret(refresh_token))
            db.add(user)
        elif refresh_token:
            user.refresh_token = _encrypt_secret(refresh_token)

        if access_token:
            user.access_token = _encrypt_secret(access_token)
        if access_token_expiry:
            user.access_token_expiry = access_token_expiry
        if history_id is not None:
            user.history_id = str(history_id)
        if scopes is not None:
            user.scopes = json.dumps(list(scopes)) if not isinstance(scopes, str) else scopes

        user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        logger.info("Saved Gmail credentials | user=%s historyId=%s", email, user.history_id)
        return user
    finally:
        db.close()


def get_user_credentials(user_id: str) -> dict | None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == user_id).one_or_none()
        if user is None:
            return None
        return {
            "id": user.id,
            "email": user.email,
            "refresh_token": _decrypt_secret(user.refresh_token),
            "access_token": _decrypt_secret(user.access_token),
            "access_token_expiry": user.access_token_expiry,
            "history_id": user.history_id,
            "scopes": json.loads(user.scopes or "[]"),
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        }
    finally:
        db.close()


def update_history_id(user_id: str, history_id: str | int) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == user_id).one_or_none()
        if user is None:
            raise ValueError(f"No Gmail user found for {user_id!r}")
        user.history_id = str(history_id)
        user.updated_at = datetime.utcnow()
        db.commit()
        logger.info("Updated Gmail historyId | user=%s historyId=%s", user_id, history_id)
    finally:
        db.close()


def get_all_user_ids() -> list[str]:
    db = SessionLocal()
    try:
        return [
            row[0]
            for row in db.query(User.email).filter(User.history_id.isnot(None)).all()
        ]
    finally:
        db.close()
