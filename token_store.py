"""
app/utils/token_store.py  (flat-import edition)
"""

import json
from pathlib import Path
from google.oauth2.credentials import Credentials

from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()


def _token_path(user_id: str) -> Path:
    token_dir = Path(settings.TOKEN_DIR)
    token_dir.mkdir(parents=True, exist_ok=True)
    return token_dir / f"{user_id}.json"


def save_token(user_id: str, credentials: Credentials) -> None:
    path = _token_path(user_id)
    path.write_text(credentials.to_json())
    logger.info("Token saved for user '%s' → %s", user_id, path)


def load_token(user_id: str) -> Credentials | None:
    path = _token_path(user_id)
    if not path.exists():
        logger.warning("No token found for user '%s'", user_id)
        return None

    data = json.loads(path.read_text())
    return Credentials(
        token=data.get("token"),
        refresh_token=data.get("refresh_token"),
        token_uri=data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=data.get("client_id"),
        client_secret=data.get("client_secret"),
        scopes=data.get("scopes"),
    )


def delete_token(user_id: str) -> None:
    path = _token_path(user_id)
    if path.exists():
        path.unlink()
        logger.info("Token deleted for user '%s'", user_id)
