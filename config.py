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
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/userinfo.email",
        "openid",
    ]
    # Granted only to the dedicated vendor-outreach mailbox below — every other
    # registered Gmail account stays read-only.
    GOOGLE_SCOPES_VENDOR_MAILBOX: list[str] = [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "openid",
    ]
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    CREDENTIAL_ENCRYPTION_KEY: str = ""

    NEXT_PARSER_API_URL: str = "http://localhost:3000/api/parser/rfq-items"
    NEXT_INQUIRIES_API_URL: str = "http://localhost:3000/api/inquiries"
    NEXT_INQUIRY_ITEMS_API_URL: str = "http://localhost:3000/api/inquiries/items"
    NEXT_REMINDERS_API_URL: str = "http://localhost:3000/api/parser/reminders"
    NEXT_BLOCKED_CLIENTS_API_URL: str = "http://localhost:3000/api/blocked-clients"

    # Vendor outreach / reply pipeline
    NEXT_DRAFTS_API_URL: str = "http://localhost:3000/api/drafts"
    NEXT_DRAFTS_STALE_API_URL: str = "http://localhost:3000/api/drafts/stale"
    NEXT_QUOTES_API_URL: str = "http://localhost:3000/api/quotes"

    # Single dedicated mailbox that sends every vendor RFQ and receives every
    # vendor price reply. Must be one of the Gmail accounts registered via
    # /login?mailbox=vendor (needs gmail.send).
    VENDOR_MAILBOX_USER_ID: str = ""
    VENDOR_REMINDER_AFTER_HOURS: int = 24

    # Single mailbox that sends final quotations back to clients, replying in
    # the original inquiry thread. Typically sales@fidusindia.com — must also
    # be (re-)registered via /login?mailbox=client (needs gmail.send).
    CLIENT_MAILBOX_USER_ID: str = ""

    DATABASE_URL: str = "sqlite:///emails.db"

    REDIS_URL: str = "redis://localhost:6379/0"

    GMAIL_FETCH_MAX_RESULTS: int = 500
    GMAIL_CHUNK_SIZE: int = 50

    CELERY_MAX_RETRIES: int = 3
    CELERY_RETRY_BACKOFF: int = 60

    # OpenAI
    OPENAI_API_KEY: str = ""

    # Vendor Discovery — SearchApi.io key (searchapi.io, NOT serpapi.com —
    # different company, despite the similar name; see vendor_discovery/searcher.py)
    SEARCHAPI_KEY: str = ""
    NEXT_VENDORS_API_URL: str = "http://localhost:3000/api/parser/vendors"
    NEXT_VENDORS_BRAND_STATUS_API_URL: str = "http://localhost:3000/api/parser/vendors/brand-status"
    NEXT_VENDORS_LINK_API_URL: str = "http://localhost:3000/api/parser/vendors/link"
    NEXT_VENDORS_DISCOVERY_PROGRESS_API_URL: str = "http://localhost:3000/api/parser/vendors/discovery-progress"

    # Days to wait before re-running a paid SearchApi.io search for a brand we've
    # already discovered vendors for. Within the window, new inquiries for
    # the same brand just reuse the existing vendor pool instead of paying
    # for a search that reliably returns the same top results.
    VENDOR_BRAND_SEARCH_COOLDOWN_DAYS: int = 30

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
