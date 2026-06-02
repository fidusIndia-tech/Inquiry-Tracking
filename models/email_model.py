"""
models/email_model.py
---------------------
SQLAlchemy ORM model for storing extracted email data.
Uses SQLite for now (zero setup, single file).
Swap DATABASE_URL in .env to PostgreSQL for production:
  DATABASE_URL=postgresql://user:pass@localhost:5432/gmail_db
"""

from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean

from database import Base, SessionLocal, engine


class Email(Base):
    __tablename__ = "emails"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    message_id    = Column(String(32), unique=True, nullable=False, index=True)
    thread_id     = Column(String(32), nullable=True)
    user_id       = Column(String(255), nullable=False, index=True)   # owner's email

    # ── Headers ───────────────────────────────────────────────────────────
    subject       = Column(Text,    nullable=True)
    sender        = Column(String(500), nullable=True)
    recipient     = Column(Text,    nullable=True)
    date_str      = Column(String(100), nullable=True)   # raw Date header
    date_parsed   = Column(DateTime, nullable=True)      # parsed UTC datetime

    # ── Body ─────────────────────────────────────────────────────────────
    snippet       = Column(Text, nullable=True)          # Gmail's 100-char preview
    body_plain    = Column(Text, nullable=True)          # decoded text/plain
    body_html     = Column(Text, nullable=True)          # decoded text/html

    # ── Labels / Meta ─────────────────────────────────────────────────────
    label_ids     = Column(Text, nullable=True)          # comma-separated e.g. "INBOX,UNREAD"
    is_unread     = Column(Boolean, default=False)
    has_attachment = Column(Boolean, default=False)

    # ── Bookkeeping ───────────────────────────────────────────────────────
    created_at    = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Email id={self.message_id} from={self.sender} subject={self.subject[:40]!r}>"


# ── DB engine + session factory ───────────────────────────────────────────────

def init_db():
    """Create all tables. Call once at startup."""
    Base.metadata.create_all(bind=engine)
