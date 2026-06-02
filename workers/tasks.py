"""
workers/tasks.py
----------------
Full pipeline — saves ONE row per email, comma-joined fields.
"""

import traceback
from celery import Task
from googleapiclient.errors import HttpError
from sqlalchemy.exc import IntegrityError

from workers.celery_app import celery_app
from gmail_auth import get_gmail_service
from gmail_service import (
    get_full_message,
    fetch_new_message_ids_from_history,
    HistoryExpiredError,
    chunk_messages,
)
from history_tracker import get_latest_history_id, save_latest_history_id, get_all_user_ids
from email_parser import parse_email
from rfq_filter import is_rfq_candidate
from attachment_handler import extract_attachment_text
from llm_extractor import is_rfq_email, extract_rfq_data
from models.email_model import Email, SessionLocal, init_db
from models.rfq_model import RFQItem, init_rfq_db
from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()

init_db()
init_rfq_db()


class BaseTask(Task):
    abstract = True
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error("Task %s [%s] FAILED: %s\n%s", self.name, task_id, exc, einfo)


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="workers.tasks.process_email_chunk",
    autoretry_for=(HttpError, ConnectionError, TimeoutError),
    max_retries=3,
    retry_backoff=60,
    retry_backoff_max=600,
    retry_jitter=True,
    rate_limit="30/s",
)
def process_email_chunk(self, user_id: str, messages: list[dict]) -> dict:
    logger.info(
        "Task %s | user=%s | chunk=%d | attempt=%d",
        self.request.id, user_id, len(messages), self.request.retries + 1,
    )

    try:
        service = get_gmail_service(user_id)
    except ValueError as exc:
        logger.error("Auth error for '%s': %s", user_id, exc)
        raise

    stats = {
        "total": len(messages),
        "stored_raw": 0,
        "layer1_dropped": 0,
        "layer2_dropped": 0,
        "rfq_found": 0,
        "failed": 0,
    }

    db = SessionLocal()
    try:
        for msg_stub in messages:
            msg_id = msg_stub["id"]
            try:
                # ── 1. Fetch full email from Gmail API ────────────────────
                raw    = get_full_message(service, msg_id)
                parsed = parse_email(raw, user_id)

                # ── 2. Save raw email — skip if already stored ────────────
                try:
                    db.add(Email(**parsed))
                    db.commit()
                    stats["stored_raw"] += 1
                except IntegrityError:
                    db.rollback()

                # ── 3. Layer 1: instant rule-based filter (free) ──────────
                if not is_rfq_candidate(parsed):
                    stats["layer1_dropped"] += 1
                    continue

                # ── 4. Extract text from attachments (PDF/XLSX/DOCX) ──────
                attachment_text = ""
                if parsed.get("has_attachment"):
                    attachment_text = extract_attachment_text(
                        service, msg_id, raw.get("payload", {})
                    )

                # ── 5. Layer 2: LLM yes/no classifier (gpt-4o-mini) ───────
                if not is_rfq_email(parsed):
                    stats["layer2_dropped"] += 1
                    logger.debug("L2 DROP | %s | %s", parsed["sender"], parsed["subject"])
                    continue

                logger.info("✓ RFQ | %s | %s", parsed.get("sender", ""), parsed.get("subject", ""))

                # ── 6. Layer 3: LLM structured extractor (gpt-4o) ─────────
                line_items = extract_rfq_data(parsed, attachment_text)

                if not line_items:
                    logger.warning("  No items extracted for %s", msg_id)
                    continue

                # ── 7. Collapse all items into ONE row ────────────────────
                # username + location come from first item (same sender throughout)
                username = None
                location = None
                for item in line_items:
                    if isinstance(item, dict):
                        username = username or item.get("username")
                        location = location or item.get("location")

                brands       = ", ".join(str(i.get("brand")       or "") for i in line_items if isinstance(i, dict))
                part_numbers = ", ".join(str(i.get("part_number") or "") for i in line_items if isinstance(i, dict))
                quantities   = ", ".join(str(i.get("quantity")    or "") for i in line_items if isinstance(i, dict))
                notes        = ", ".join(str(i.get("notes")       or "") for i in line_items if isinstance(i, dict))

                # ── 8. Upsert: update if message already exists ───────────
                existing = db.query(RFQItem).filter_by(message_id=msg_id).first()
                if existing:
                    existing.username     = username
                    existing.location     = location
                    existing.brands       = brands
                    existing.part_numbers = part_numbers
                    existing.quantities   = quantities
                    existing.notes        = notes
                else:
                    db.add(RFQItem(
                        message_id   = msg_id,
                        user_id      = user_id,
                        username     = username,
                        location     = location,
                        brands       = brands,
                        part_numbers = part_numbers,
                        quantities   = quantities,
                        notes        = notes,
                        sender       = parsed.get("sender"),
                        subject      = parsed.get("subject"),
                        email_date   = parsed.get("date_str"),
                    ))

                db.commit()
                stats["rfq_found"] += 1

                logger.info(
                    "  → saved | %s | brands: %s | parts: %s",
                    username or parsed.get("sender", ""),
                    brands[:40],
                    part_numbers[:60],
                )

            except HttpError as exc:
                db.rollback()
                status = exc.resp.status if exc.resp else "unknown"
                if status == 404:
                    logger.warning("Message %s not found, skipping", msg_id)
                elif status == 429:
                    logger.warning("Rate limited — retrying chunk")
                    raise
                else:
                    logger.error("HttpError %s on %s: %s", status, msg_id, exc)
                stats["failed"] += 1

            except Exception as exc:
                db.rollback()
                logger.error("Error on %s: %s\n%s", msg_id, exc, traceback.format_exc())
                stats["failed"] += 1

    finally:
        db.close()

    logger.info(
        "Chunk done | total=%d | raw=%d | L1_drop=%d | L2_drop=%d | rfq=%d | failed=%d",
        stats["total"], stats["stored_raw"],
        stats["layer1_dropped"], stats["layer2_dropped"],
        stats["rfq_found"], stats["failed"],
    )
    return stats


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="workers.tasks.poll_inbox",
    autoretry_for=(HttpError, ConnectionError, TimeoutError),
    max_retries=3,
    retry_backoff=60,
    retry_backoff_max=600,
    retry_jitter=True,
)
def poll_inbox(self, user_id: str) -> dict:
    """
    Incremental sync for one user.
    Fetches only emails that arrived since the stored historyId checkpoint.
    Called by poll_all_users (beat) or directly via /poll.
    """
    stored_id = get_latest_history_id(user_id)
    if not stored_id:
        logger.warning("poll_inbox | no historyId for %s — skipping (re-login to seed)", user_id)
        return {"status": "no_history_id", "user_id": user_id}

    try:
        service = get_gmail_service(user_id)
    except ValueError as exc:
        logger.error("poll_inbox | auth error for %s: %s", user_id, exc)
        return {"status": "auth_error", "detail": str(exc)}

    try:
        new_msgs, latest_id = fetch_new_message_ids_from_history(service, stored_id)
    except HistoryExpiredError as exc:
        logger.error("poll_inbox | historyId expired for %s: %s", user_id, exc)
        return {"status": "history_expired", "detail": str(exc)}

    if latest_id:
        save_latest_history_id(user_id, latest_id)

    if not new_msgs:
        logger.debug("poll_inbox | no new messages for %s", user_id)
        return {"status": "no_new_messages", "user_id": user_id}

    task_ids = []
    for chunk in chunk_messages(new_msgs):
        t = process_email_chunk.apply_async(args=[user_id, chunk], queue="emails")
        task_ids.append(t.id)

    logger.info(
        "poll_inbox | user=%s new=%d chunks=%d latest_id=%s",
        user_id, len(new_msgs), len(task_ids), latest_id,
    )
    return {
        "status":            "queued",
        "user_id":           user_id,
        "new_messages":      len(new_msgs),
        "chunks_queued":     len(task_ids),
        "latest_history_id": latest_id,
    }


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="workers.tasks.poll_all_users",
)
def poll_all_users(self) -> dict:
    """
    Beat entry point — runs every 60 s.
    Dispatches poll_inbox for every user that has a stored historyId.
    """
    user_ids = get_all_user_ids()
    if not user_ids:
        logger.debug("poll_all_users | no users registered yet")
        return {"status": "no_users"}

    dispatched = []
    for uid in user_ids:
        t = poll_inbox.apply_async(args=[uid], queue="emails")
        dispatched.append(t.id)
        logger.info("poll_all_users | dispatched poll for %s task=%s", uid, t.id)

    return {"status": "dispatched", "users": len(user_ids), "task_ids": dispatched}
