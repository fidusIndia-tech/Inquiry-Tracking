"""
api/routes.py
"""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse

from googleapiclient.discovery import build
from sqlalchemy import func

from gmail_auth import build_oauth_flow, get_authorization_url, get_gmail_service
from gmail_service import (
    fetch_message_ids,
    chunk_messages,
    fetch_new_message_ids_from_history,
    HistoryExpiredError,
)
from history_tracker import get_latest_history_id, save_latest_history_id
from token_store import save_token, delete_token
from workers.tasks import process_email_chunk
from models.email_model import Email, SessionLocal, init_db
from models.rfq_model import RFQItem, init_rfq_db
from config import get_settings
from logging_setup import get_logger

logger = get_logger(__name__)
settings = get_settings()
router = APIRouter()

init_db()
init_rfq_db()


@router.get("/")
def home():
    return {"status": "ok", "service": "gmail-rfq-processor"}


@router.get("/login")
def login(request: Request):
    flow = build_oauth_flow()
    authorization_url, state = get_authorization_url(flow)
    request.session["oauth_state"] = state
    request.session["oauth_code_verifier"] = flow.code_verifier
    return RedirectResponse(authorization_url)


@router.get("/auth/google/callback")
def oauth_callback(request: Request):
    session_state = request.session.get("oauth_state")
    if not session_state or session_state != request.query_params.get("state"):
        raise HTTPException(status_code=400, detail="Invalid OAuth state.")

    flow = build_oauth_flow(state=session_state)
    flow.code_verifier = request.session.get("oauth_code_verifier")

    try:
        flow.fetch_token(authorization_response=str(request.url))
        credentials = flow.credentials
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {exc}")

    try:
        svc = build("oauth2", "v2", credentials=credentials, cache_discovery=False)
        user_info = svc.userinfo().get().execute()
        user_id = user_info["email"]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not get user info: {exc}")

    save_token(user_id, credentials)

    # Capture initial historyId — becomes the incremental sync checkpoint
    try:
        gmail_svc = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        profile = gmail_svc.users().getProfile(userId="me").execute()
        history_id = profile.get("historyId")
        if history_id:
            save_latest_history_id(user_id, history_id)
            logger.info("Initial historyId captured | user=%s historyId=%s", user_id, history_id)
    except Exception as exc:
        logger.warning("Could not capture historyId for %s: %s", user_id, exc)

    request.session["user_id"] = user_id
    request.session.pop("oauth_state", None)
    request.session.pop("oauth_code_verifier", None)
    return RedirectResponse("/start-fetch")


@router.get("/start-fetch")
def start_fetch(request: Request, reseed: bool = False):
    """
    Incremental fetch using Gmail History API.

    Normal call  → returns only emails that arrived since the last checkpoint.
    ?reseed=true → full mailbox scan + captures a fresh historyId checkpoint.
                   Use this on first run or when the checkpoint has expired.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    try:
        service = get_gmail_service(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Auth error: {exc}")

    stored_id = get_latest_history_id(user_id)

    # ── Reseed: full scan + capture fresh checkpoint ──────────────────────
    if reseed or not stored_id:
        try:
            profile = service.users().getProfile(userId="me").execute()
            history_id = profile.get("historyId")
            if history_id:
                save_latest_history_id(user_id, history_id)
        except Exception as exc:
            logger.warning("Could not capture historyId during reseed: %s", exc)

        try:
            messages = fetch_message_ids(service)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Gmail API error: {exc}")

        if not messages:
            return JSONResponse({"status": "no_messages"})

        task_ids = []
        for chunk in chunk_messages(messages):
            task = process_email_chunk.apply_async(args=[user_id, chunk], queue="emails")
            task_ids.append(task.id)

        return JSONResponse({
            "status":         "full_fetch_queued",
            "total_messages": len(messages),
            "chunks_queued":  len(task_ids),
            "note":           "Seed complete. Future calls will use incremental History API.",
        })

    # ── Incremental fetch via History API ─────────────────────────────────
    try:
        new_msgs, latest_id = fetch_new_message_ids_from_history(service, stored_id)
    except HistoryExpiredError as exc:
        raise HTTPException(
            status_code=409,
            detail=f"{exc}",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gmail History API error: {exc}")

    if latest_id:
        save_latest_history_id(user_id, latest_id)

    if not new_msgs:
        return JSONResponse({"status": "no_new_messages", "latest_history_id": latest_id})

    task_ids = []
    for chunk in chunk_messages(new_msgs):
        task = process_email_chunk.apply_async(args=[user_id, chunk], queue="emails")
        task_ids.append(task.id)

    return JSONResponse({
        "status":             "queued",
        "new_messages":       len(new_msgs),
        "chunks_queued":      len(task_ids),
        "latest_history_id":  latest_id,
    })


@router.get("/poll")
def poll(request: Request):
    """
    Lightweight endpoint for the scheduler — dispatches a Celery poll_inbox task.
    The task calls the History API and queues only new emails.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    from workers.tasks import poll_inbox
    task = poll_inbox.apply_async(args=[user_id], queue="emails")
    return JSONResponse({"status": "poll_queued", "task_id": task.id})


# ── RFQ endpoints ─────────────────────────────────────────────────────────────

@router.get("/rfq")
def list_rfq(
    request: Request,
    page: int = 1,
    per_page: int = 50,
    brand: str = None,
    location: str = None,
    username: str = None,
):
    """
    List extracted RFQ emails.
    Each row = one email with all its parts comma-joined.

    Optional filters:
      ?brand=Siemens        → emails containing 'Siemens' in brands column
      ?location=India       → emails from India
      ?username=Polycab     → emails from Polycab
    """
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    db = SessionLocal()
    try:
        q = db.query(RFQItem).filter(RFQItem.user_id == user_id)

        if brand:
            q = q.filter(RFQItem.brands.ilike(f"%{brand}%"))
        if location:
            q = q.filter(RFQItem.location.ilike(f"%{location}%"))
        if username:
            q = q.filter(RFQItem.username.ilike(f"%{username}%"))

        total = q.count()
        items = (
            q.order_by(RFQItem.created_at.desc())
             .offset((page - 1) * per_page)
             .limit(per_page)
             .all()
        )

        return {
            "total":    total,
            "page":     page,
            "per_page": per_page,
            "rfq_items": [
                {
                    "id":           i.id,
                    "message_id":   i.message_id,
                    "email_date":   i.email_date,
                    "username":     i.username,
                    "location":     i.location,
                    "brands":       i.brands,
                    "part_numbers": i.part_numbers,
                    "quantities":   i.quantities,
                    "notes":        i.notes,
                    "sender":       i.sender,
                    "subject":      i.subject,
                }
                for i in items
            ],
        }
    finally:
        db.close()


@router.get("/rfq/export")
def export_rfq_csv(request: Request):
    """
    Download all RFQ data as a CSV file.
    Columns: date, username, location, brands, part_numbers, quantities, notes, sender, subject
    """
    import csv
    import io
    from fastapi.responses import StreamingResponse

    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    db = SessionLocal()
    try:
        items = (
            db.query(RFQItem)
            .filter(RFQItem.user_id == user_id)
            .order_by(RFQItem.email_date.desc())
            .all()
        )

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "date", "username", "location",
            "brands", "part_numbers", "quantities", "notes",
            "sender", "subject", "message_id"
        ])
        for i in items:
            writer.writerow([
                i.email_date, i.username, i.location,
                i.brands, i.part_numbers, i.quantities, i.notes,
                i.sender, i.subject, i.message_id
            ])

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=rfq_export.csv"}
        )
    finally:
        db.close()


@router.get("/stats")
def stats(request: Request):
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    db = SessionLocal()
    try:
        total_emails = db.query(func.count(Email.id)).filter(Email.user_id == user_id).scalar()
        total_rfqs   = db.query(func.count(RFQItem.id)).filter(RFQItem.user_id == user_id).scalar()

        return {
            "user_id":          user_id,
            "total_emails":     total_emails,
            "rfq_emails_found": total_rfqs,
        }
    finally:
        db.close()


@router.get("/logout")
def logout(request: Request):
    user_id = request.session.get("user_id")
    if user_id:
        delete_token(user_id)
        request.session.clear()
    return {"status": "logged_out"}
