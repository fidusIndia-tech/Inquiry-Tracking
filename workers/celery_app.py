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

    # Each queue below should be consumed by its own worker process in
    # production (`celery worker -Q emails`, `-Q vendors`, `-Q vendor_replies`,
    # `-Q reminders`). This is what stops a slow vendor-discovery scrape from
    # blocking Gmail polling — they used to share one queue/worker, so a single
    # long-running scrape would silently stall new-mail detection until the
    # worker was restarted.
    task_routes={
        # Client RFQ pipeline — must stay fast and uninterrupted.
        "workers.tasks.process_email_message":  {"queue": "emails"},
        "workers.tasks.process_email_chunk":    {"queue": "emails"},
        "workers.tasks.poll_inbox":             {"queue": "emails"},
        "workers.tasks.poll_all_users":         {"queue": "emails"},
        # Vendor discovery — slow, network-bound (SerpAPI + scraping).
        "workers.tasks.discover_vendors_task":  {"queue": "vendors"},
        # Vendor reply pipeline — single dedicated mailbox.
        "workers.tasks.poll_vendor_replies":    {"queue": "vendor_replies"},
        "workers.tasks.extract_vendor_quote":   {"queue": "vendor_replies"},
        # Reminder agent.
        "workers.tasks.send_vendor_reminders":  {"queue": "reminders"},
    },
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,
    result_expires=3600,
    timezone="UTC",
    enable_utc=True,

    # Safety net: a task that hangs (e.g. a network call with no timeout)
    # gets killed instead of permanently blocking its worker. Vendor discovery
    # overrides this with a longer limit on its own task decorator since it
    # can legitimately run for several minutes.
    task_time_limit=300,
    task_soft_time_limit=240,

    # ── Beat scheduler ────────────────────────────────────────────────────────
    beat_schedule={
        "poll-gmail-every-minute": {
            "task":     "workers.tasks.poll_all_users",
            "schedule": 60.0,
        },
        "poll-vendor-replies-every-minute": {
            "task":     "workers.tasks.poll_vendor_replies",
            "schedule": 60.0,
        },
        "send-vendor-reminders-hourly": {
            "task":     "workers.tasks.send_vendor_reminders",
            "schedule": 3600.0,
        },
    },
)
