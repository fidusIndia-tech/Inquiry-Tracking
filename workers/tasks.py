"""
workers/tasks.py
----------------
Full pipeline — sends ONE parsed RFQ row per email to the Next.js backend.
"""

import traceback
from celery import Task
from googleapiclient.errors import HttpError

from workers.celery_app import celery_app
from gmail_auth import get_gmail_service_for_user
from gmail_service import (
    get_full_message,
    is_processable_inbox_message,
    fetch_new_message_ids_from_history,
    HistoryExpiredError,
)
from history_tracker import get_latest_history_id, save_latest_history_id, get_all_user_ids
from email_parser import parse_email
from rfq_filter import is_rfq_candidate, is_client_reminder
from attachment_handler import extract_attachment_text
from llm_extractor import is_rfq_email, extract_rfq_data, get_buyer_identity
from next_api_client import post_rfq_item, post_reminder_item
from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()


def _route_to_reminder(msg_id: str, parsed: dict, items: list) -> None:
    """Post an email to the Reminders panel with any extracted line items."""
    try:
        post_reminder_item({
            "message_id":  msg_id,
            "thread_id":   parsed.get("thread_id"),
            "sender":      parsed.get("sender"),
            "subject":     parsed.get("subject"),
            "llm_summary": None,
            "email_date":  parsed.get("date_str"),
            "line_items":  items or [],
        })
        logger.info(
            "Reminder routed | %s | %s | items=%d",
            parsed.get("sender", ""), parsed.get("subject", ""), len(items or []),
        )
    except Exception as exc:
        logger.error("Failed to post reminder %s: %s", msg_id, exc)


class BaseTask(Task):
    abstract = True
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error("Task %s [%s] FAILED: %s\n%s", self.name, task_id, exc, einfo)


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="workers.tasks.process_email_message",
    autoretry_for=(HttpError, ConnectionError, TimeoutError),
    max_retries=3,
    retry_backoff=60,
    retry_backoff_max=600,
    retry_jitter=True,
    rate_limit="30/s",
)
def process_email_message(self, user_id: str, message_id: str) -> dict:
    logger.info(
        "Task %s | user=%s | message=%s | attempt=%d",
        self.request.id, user_id, message_id, self.request.retries + 1,
    )

    try:
        service = get_gmail_service_for_user(user_id)
    except ValueError as exc:
        logger.error("Auth error for '%s': %s", user_id, exc)
        raise

    stats = {
        "total": 1,
        "parsed": 0,
        "layer1_dropped": 0,
        "layer2_dropped": 0,
        "rfq_exported": 0,
        "reminder_routed": 0,
        "failed": 0,
    }

    for msg_id in [message_id]:
        try:
            # 1. Fetch and flatten the full email from Gmail.
            raw = get_full_message(service, msg_id)
            if not is_processable_inbox_message(raw):
                logger.info(
                    "DROP non-inbox/outgoing Gmail message | %s | labels=%s",
                    msg_id,
                    raw.get("labelIds", []),
                )
                stats["layer1_dropped"] += 1
                continue

            parsed = parse_email(raw, user_id)
            stats["parsed"] += 1

            # 2. Layer 1: fast rule-based filter.
            if not is_rfq_candidate(parsed):
                if is_client_reminder(parsed):
                    # Extract attachments + run LLM extractor so the admin
                    # sees the items when reviewing in the Reminders panel.
                    att = ""
                    if parsed.get("has_attachment"):
                        try:
                            att = extract_attachment_text(
                                service, msg_id, raw.get("payload", {})
                            )
                        except Exception as e:
                            logger.warning("Attachment fetch failed for reminder %s: %s", msg_id, e)
                    try:
                        reminder_items = extract_rfq_data(parsed, att)
                    except Exception as e:
                        logger.warning("Item extraction failed for reminder %s: %s", msg_id, e)
                        reminder_items = []
                    _route_to_reminder(msg_id, parsed, reminder_items)
                    stats["reminder_routed"] += 1
                stats["layer1_dropped"] += 1
                continue

            # 3. Reminder interception — runs BEFORE Layer 2 so re: chains
            #    never auto-create an inquiry regardless of quoted RFQ content.
            #    Layer 1 already dropped logistics/spam/noise re: emails.
            if is_client_reminder(parsed):
                att = ""
                if parsed.get("has_attachment"):
                    try:
                        att = extract_attachment_text(
                            service, msg_id, raw.get("payload", {})
                        )
                    except Exception as e:
                        logger.warning("Attachment fetch failed for reminder %s: %s", msg_id, e)
                try:
                    reminder_items = extract_rfq_data(parsed, att)
                except Exception as e:
                    logger.warning("Item extraction failed for reminder %s: %s", msg_id, e)
                    reminder_items = []
                _route_to_reminder(msg_id, parsed, reminder_items)
                stats["reminder_routed"] += 1
                continue

            # 4. Extract text from attachments before LLM extraction.
            attachment_text = ""
            if parsed.get("has_attachment"):
                attachment_text = extract_attachment_text(
                    service, msg_id, raw.get("payload", {})
                )

            # 5. Layer 2: LLM yes/no classifier.
            if not is_rfq_email(parsed):
                if is_client_reminder(parsed):
                    try:
                        reminder_items = extract_rfq_data(parsed, attachment_text)
                    except Exception as e:
                        logger.warning("Item extraction failed for reminder %s: %s", msg_id, e)
                        reminder_items = []
                    _route_to_reminder(msg_id, parsed, reminder_items)
                    stats["reminder_routed"] += 1
                stats["layer2_dropped"] += 1
                logger.debug("L2 DROP | %s | %s", parsed["sender"], parsed["subject"])
                continue

            logger.info("RFQ | %s | %s", parsed.get("sender", ""), parsed.get("subject", ""))

            # 5. Layer 3: LLM structured extractor.
            line_items = extract_rfq_data(parsed, attachment_text)

            if not line_items:
                # Extractor found nothing — if this email looks like a reminder
                # (e.g. portal notification with a link but no inline items),
                # route to Reminders panel so the admin can act on it.
                if is_client_reminder(parsed):
                    _route_to_reminder(msg_id, parsed, [])
                    stats["reminder_routed"] += 1
                logger.warning("No items extracted for %s", msg_id)
                continue

            buyer_name, buyer_email = get_buyer_identity(parsed)

            # 6. Collapse all items into one parser row for the Next.js API.
            client_name = None
            username = None
            sender_email = None
            location = None
            for item in line_items:
                if isinstance(item, dict):
                    client_name = client_name or item.get("client_name")
                    username = username or item.get("username")
                    sender_email = sender_email or item.get("sender_email")
                    location = location or item.get("location")

            username = buyer_name or username
            sender_email = buyer_email or sender_email

            for item in line_items:
                if isinstance(item, dict):
                    if buyer_name:
                        item["username"] = buyer_name
                    if buyer_email:
                        item["sender_email"] = buyer_email

            brands = ", ".join(
                str(i.get("brand") or "") for i in line_items if isinstance(i, dict)
            )
            part_numbers = ", ".join(
                str(i.get("part_number") or "") for i in line_items if isinstance(i, dict)
            )
            quantities = ", ".join(
                str(i.get("quantity") or "") for i in line_items if isinstance(i, dict)
            )
            notes = ", ".join(
                str(i.get("notes") or "") for i in line_items if isinstance(i, dict)
            )

            result = post_rfq_item({
                "message_id": msg_id,
                "thread_id": parsed.get("thread_id"),
                "user_id": user_id,
                "client_name": client_name,
                "username": username,
                "sender_email": sender_email,
                "location": location,
                "brands": brands,
                "part_numbers": part_numbers,
                "quantities": quantities,
                "notes": notes,
                "line_items": line_items,
                "sender": parsed.get("sender"),
                "subject": parsed.get("subject"),
                "email_date": parsed.get("date_str"),
            })

            stats["rfq_exported"] += 1

            logger.info(
                "Exported RFQ | %s | %s | items=%s",
                result.get("uniqueCode"),
                username or parsed.get("sender", ""),
                result.get("itemCount"),
            )

        except HttpError as exc:
            status = exc.resp.status if exc.resp else "unknown"
            if status == 404:
                logger.warning("Message %s not found, skipping", msg_id)
            elif status == 429:
                logger.warning("Rate limited, retrying chunk")
                raise
            else:
                logger.error("HttpError %s on %s: %s", status, msg_id, exc)
            stats["failed"] += 1

        except Exception as exc:
            logger.error("Error on %s: %s\n%s", msg_id, exc, traceback.format_exc())
            stats["failed"] += 1

    logger.info(
        "Chunk done | total=%d | parsed=%d | L1_drop=%d | L2_drop=%d | exported=%d | reminders=%d | failed=%d",
        stats["total"], stats["parsed"],
        stats["layer1_dropped"], stats["layer2_dropped"],
        stats["rfq_exported"], stats["reminder_routed"], stats["failed"],
    )
    return stats


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="workers.tasks.process_email_chunk",
)
def process_email_chunk(self, user_id: str, messages: list[dict]) -> dict:
    """
    Backward-compatible wrapper for any old callers.
    New SaaS workflow queues process_email_message(user_id, message_id).
    """
    task_ids = []
    for msg in messages:
        msg_id = msg["id"] if isinstance(msg, dict) else str(msg)
        task = process_email_message.apply_async(args=[user_id, msg_id], queue="emails")
        task_ids.append(task.id)
    return {"status": "queued", "user_id": user_id, "messages_queued": len(task_ids), "task_ids": task_ids}


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
        service = get_gmail_service_for_user(user_id)
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
    for msg in new_msgs:
        t = process_email_message.apply_async(args=[user_id, msg["id"]], queue="emails")
        task_ids.append(t.id)

    logger.info(
        "poll_inbox | user=%s new=%d chunks=%d latest_id=%s",
        user_id, len(new_msgs), len(task_ids), latest_id,
    )
    return {
        "status":            "queued",
        "user_id":           user_id,
        "new_messages":      len(new_msgs),
        "messages_queued":   len(task_ids),
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
