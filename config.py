"""
app/core/config.py
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me-in-production"

    GOOGLE_CLIENT_SECRETS_FILE: str = "client_secret.json"
    GOOGLE_REDIRECT_URI: str = "http://127.0.0.1:8000/auth/google/callback"
    GOOGLE_SCOPES: list[str] = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "openid",
    ]
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    CREDENTIAL_ENCRYPTION_KEY: str = ""

    NEXT_PARSER_API_URL: str = "http://localhost:3000/api/parser/rfq-items"
    NEXT_REMINDERS_API_URL: str = "http://localhost:3000/api/parser/reminders"
    NEXT_INQUIRIES_API_URL: str = "http://localhost:3000/api/inquiries"

    DATABASE_URL: str = "sqlite:///emails.db"

    REDIS_URL: str = "redis://localhost:6379/0"

    GMAIL_FETCH_MAX_RESULTS: int = 500
    GMAIL_CHUNK_SIZE: int = 50

    CELERY_MAX_RETRIES: int = 3
    CELERY_RETRY_BACKOFF: int = 60

    # OpenAI
    OPENAI_API_KEY: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
