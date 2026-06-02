"""
Database-backed Gmail History API checkpoints.

Each Gmail account has its own users.history_id value. This keeps mailbox
sync isolated per tenant and removes the old history_ids.json file.
"""

from models.user_model import get_all_user_ids, get_user_credentials, update_history_id


def get_latest_history_id(user_id: str) -> str | None:
    user = get_user_credentials(user_id)
    if user is None:
        return None
    return user.get("history_id")


def save_latest_history_id(user_id: str, history_id: str | int) -> None:
    update_history_id(user_id, history_id)
