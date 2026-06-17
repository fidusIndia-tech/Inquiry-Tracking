"""
workers/celery_app.py  (flat-import edition)
"""

import platform
from celery import Celery
from config import get_settings

settings = get_settings()

celery_app = Celery(
    "gmail_processor",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["workers.tasks"],
)

celery_app.conf.update(
    # On Windows, prefork uses named semaphores that are blocked by the OS.
    # solo pool runs everything in the main process — fine for development.
    worker_pool="solo" if platform.system() == "Windows" else "prefork",
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_routes={
        "workers.tasks.process_email_message": {"queue": "emails"},
        "workers.tasks.process_email_chunk":   {"queue": "emails"},
        "workers.tasks.poll_inbox":            {"queue": "emails"},
        "workers.tasks.poll_all_users":        {"queue": "emails"},
        "workers.tasks.discover_vendors_task": {"queue": "emails"},
    },
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,
    result_expires=3600,
    timezone="UTC",
    enable_utc=True,
    # ── Beat scheduler ────────────────────────────────────────────────────────
    beat_schedule={
        "poll-gmail-every-minute": {
            "task":     "workers.tasks.poll_all_users",
            "schedule": 60.0,
        },
    },
)
