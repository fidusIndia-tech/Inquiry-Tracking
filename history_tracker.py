"""
history_tracker.py
------------------
Persists the Gmail History ID checkpoint per user.

Storage: JSON file at {TOKEN_DIR}/history_ids.json
To migrate to a database, replace _load() / _save() with ORM calls —
get_latest_history_id() and save_latest_history_id() are the only
public interface the rest of the app uses.
"""

import json
import threading
from pathlib import Path

from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()

_lock = threading.Lock()


def _path() -> Path:
    p = Path(settings.TOKEN_DIR) / "history_ids.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _load() -> dict:
    f = _path()
    if not f.exists():
        return {}
    return json.loads(f.read_text())


def _save(data: dict) -> None:
    _path().write_text(json.dumps(data, indent=2))


def get_latest_history_id(user_id: str) -> str | None:
    """Return stored historyId for user, or None if not yet seeded."""
    with _lock:
        return _load().get(user_id)


def save_latest_history_id(user_id: str, history_id: str | int) -> None:
    """Persist the latest historyId as the new checkpoint for user."""
    with _lock:
        data = _load()
        data[user_id] = str(history_id)
        _save(data)
    logger.info("historyId saved | user=%s historyId=%s", user_id, history_id)


def get_all_user_ids() -> list[str]:
    """Return all user IDs that have a stored historyId (used by the beat scheduler)."""
    with _lock:
        return list(_load().keys())
