"""
app/services/gmail_auth.py
--------------------------
ONLY responsibility: manage the Google OAuth 2.0 dance and token refresh.

What this module does:
  1. Build the authorization URL (start of OAuth flow)
  2. Exchange the code → credentials (end of OAuth flow)
  3. Refresh an expired access token transparently
  4. Return a ready-to-use Gmail API service object

What this module does NOT do:
  - Handle HTTP requests / responses  (that's routes.py)
  - Store tokens                       (that's token_store.py)
  - Fetch emails                       (that's gmail_service.py)

Token refresh explained:
  Google access tokens expire in ~1 hour.
  If `credentials.expired` is True but `refresh_token` is present,
  google-auth refreshes automatically when you call any API method.
  We call `credentials.refresh(Request())` proactively to get a fresh
  token *before* handing the service to callers, and we re-save it so
  the new access token is persisted.
"""

import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from config import get_settings
from logging import getLogger
from token_store import load_token, save_token

logger = getLogger(__name__)
settings = get_settings()

# Allow HTTP during local development; remove in production (use HTTPS).
if settings.APP_ENV == "development":
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"


# ── OAuth Flow ────────────────────────────────────────────────────────────────

def build_oauth_flow(state: str | None = None) -> Flow:
    """
    Construct a google_auth_oauthlib Flow from the client secrets file.
    Pass `state` when reconstructing the flow in the callback.
    """
    kwargs: dict = dict(
        client_secrets_file=settings.GOOGLE_CLIENT_SECRETS_FILE,
        scopes=settings.GOOGLE_SCOPES,
    )
    if state:
        kwargs["state"] = state

    flow = Flow.from_client_secrets_file(**kwargs)
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    return flow


def get_authorization_url(flow: Flow) -> tuple[str, str]:
    """
    Generate the Google authorization URL.

    Returns:
        (authorization_url, state) — both must be stored in the session.

    access_type="offline" is MANDATORY if you want a refresh_token.
    prompt="consent" forces Google to return a new refresh_token every time
    (important during development; in production you can remove it once you
    have stored the refresh_token).
    """
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",          # always get refresh_token
        include_granted_scopes="true",
    )
    logger.debug("OAuth redirect URL generated, state=%s", state)
    return authorization_url, state


def exchange_code_for_credentials(
    state: str,
    authorization_response: str,
) -> Credentials:
    """
    Exchange the authorization code (from the callback URL) for credentials.

    The `code_verifier` issue you hit earlier:
      Flow.from_client_secrets_file generates a PKCE code_verifier internally
      when you call authorization_url(). You MUST store that verifier in the
      session during /login, then restore it to the flow before calling
      fetch_token() in the callback — otherwise Google rejects the token
      exchange with "missing code verifier".

      We handle this correctly in routes.py by saving/restoring it via the
      session.
    """
    flow = build_oauth_flow(state=state)
    flow.fetch_token(authorization_response=authorization_response)
    credentials = flow.credentials
    logger.info("OAuth code exchange succeeded")
    return credentials


# ── Service Builder ───────────────────────────────────────────────────────────

def get_gmail_service(user_id: str):
    """
    Load stored credentials for `user_id`, refresh if expired,
    and return an authenticated Gmail API service.

    Raises:
        ValueError: if no token exists for this user.
        google.auth.exceptions.RefreshError: if the refresh_token is revoked.
    """
    creds = load_token(user_id)

    if creds is None:
        raise ValueError(
            f"No credentials found for user '{user_id}'. "
            "They must complete the OAuth flow first."
        )

    # ── Token refresh logic ──────────────────────────────────────────────
    # creds.valid  → access token present AND not expired
    # creds.expired → access token is past its expiry
    # creds.refresh_token → we have a token to refresh with
    #
    # If invalid + refresh_token available → refresh proactively.
    # If invalid + no refresh_token → user must re-authenticate.
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            logger.info("Access token expired for '%s', refreshing…", user_id)
            creds.refresh(Request())          # mutates creds in-place
            save_token(user_id, creds)        # persist the new access token
            logger.info("Token refreshed and saved for '%s'", user_id)
        else:
            raise ValueError(
                f"Credentials for '{user_id}' are invalid and cannot be refreshed. "
                "User must re-authenticate via /login."
            )

    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    logger.debug("Gmail service built for user '%s'", user_id)
    return service
