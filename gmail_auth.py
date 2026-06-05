"""
OAuth and Gmail service creation for a multi-tenant Gmail integration.

There is one Google Cloud Project, one OAuth client, and one client_secret.json.
Each connected Gmail account is stored as a separate users row in the database.
No token.json file is used.
"""

import json
import os
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from config import get_settings
from logging_setup import get_logger
from models.user_model import get_user_credentials, save_user_credentials

logger = get_logger(__name__)
settings = get_settings()

if settings.APP_ENV == "development":
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"


def _oauth_client_config() -> dict:
    path = Path(settings.GOOGLE_CLIENT_SECRETS_FILE)
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    return data.get("web") or data.get("installed") or {}


def _client_id() -> str:
    value = settings.GOOGLE_CLIENT_ID or _oauth_client_config().get("client_id", "")
    if not value:
        raise ValueError("GOOGLE_CLIENT_ID env var is not set")
    return value


def _client_secret() -> str:
    value = settings.GOOGLE_CLIENT_SECRET or _oauth_client_config().get("client_secret", "")
    if not value:
        raise ValueError("GOOGLE_CLIENT_SECRET env var is not set")
    return value


def build_oauth_flow(state: str | None = None) -> Flow:
    client_config = {
        "web": {
            "client_id": _client_id(),
            "client_secret": _client_secret(),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
        }
    }
    kwargs: dict = {
        "client_config": client_config,
        "scopes": settings.GOOGLE_SCOPES,
    }
    if state:
        kwargs["state"] = state

    flow = Flow.from_client_config(**kwargs)
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    return flow


def get_authorization_url(flow: Flow) -> tuple[str, str]:
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    logger.debug("OAuth redirect URL generated, state=%s", state)
    return authorization_url, state


def credentials_from_user(user_id: str) -> Credentials:
    stored = get_user_credentials(user_id)
    if stored is None:
        raise ValueError(
            f"No credentials found for user '{user_id}'. "
            "They must complete the OAuth flow first."
        )

    creds = Credentials(
        token=stored.get("access_token"),
        refresh_token=stored["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=_client_id(),
        client_secret=_client_secret(),
        scopes=stored.get("scopes") or settings.GOOGLE_SCOPES,
    )
    creds.expiry = stored.get("access_token_expiry")

    if not creds.valid:
        if creds.refresh_token:
            logger.info("Access token expired for %s, refreshing", user_id)
            creds.refresh(Request())
            save_user_credentials(
                email=user_id,
                refresh_token=creds.refresh_token,
                access_token=creds.token,
                access_token_expiry=creds.expiry,
                scopes=list(creds.scopes or settings.GOOGLE_SCOPES),
            )
        else:
            raise ValueError(
                f"Credentials for '{user_id}' are invalid and cannot be refreshed. "
                "User must re-authenticate via /login."
            )

    return creds


def get_gmail_service_for_user(user_id: str):
    creds = credentials_from_user(user_id)
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    logger.debug("Gmail service built for user %s", user_id)
    return service


def get_gmail_service(user_id: str):
    """Backward-compatible alias. New code should use get_gmail_service_for_user."""
    return get_gmail_service_for_user(user_id)
