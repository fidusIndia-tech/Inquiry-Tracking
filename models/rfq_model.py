"""
rfq_model.py
------------
One row per email (message_id).
Multiple brands/parts/quantities are comma-joined into single text cells.

Example row:
  message_id   : abc123
  username     : HRD Co., Ltd
  location     : Japan
  brands       : OMRON, OMRON, OMRON, OMRON
  part_numbers : CK3W-PD048, CK3M-CPU111, CK3W-AX1515AP, CK3W-AD2100
  quantities   : 1, 1, 1, 1
  email_date   : Mon, 5 Aug 2024 10:41:43 +0900
"""

import json
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String, Text, inspect, text
from models.email_model import Base, engine


class RFQItem(Base):
    __tablename__ = "rfq_items"

    id           = Column(Integer,      primary_key=True, autoincrement=True)
    message_id   = Column(String(32),   nullable=False, unique=True, index=True)
    user_id      = Column(String(255),  nullable=False, index=True)

    # ── One value per email ───────────────────────────────────────────────
    username     = Column(String(500),  nullable=True)
    location     = Column(String(500),  nullable=True)

    # ── Comma-joined — all parts from one email in one cell ───────────────
    brands       = Column(Text, nullable=True)    # "OMRON, OMRON, Siemens"
    part_numbers = Column(Text, nullable=True)    # "CK3W-PD048, CK3M-CPU111"
    quantities   = Column(Text, nullable=True)    # "1, 2, 1"
    notes        = Column(Text, nullable=True)    # "urgent, , FOB"

    # ── Source email metadata ─────────────────────────────────────────────
    sender       = Column(String(500),  nullable=True)
    subject      = Column(Text,         nullable=True)
    email_date   = Column(String(100),  nullable=True)

    created_at   = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<RFQItem id={self.id} message_id={self.message_id} parts={self.part_numbers!r}>"


def init_rfq_db():
    """
    Create rfq_items table.
    Auto-detects and migrates from two old schemas:
      - old JSON schema     → had a 'line_items' JSON column
      - old per-row schema  → had separate 'brand' / 'part_number' columns
    """
    inspector = inspect(engine)

    if inspector.has_table("rfq_items"):
        existing_cols = {c["name"] for c in inspector.get_columns("rfq_items")}

        if "line_items" in existing_cols:
            print("[rfq_model] Old JSON schema detected — migrating...")
            _migrate_from_json_schema()
            return

        if "brand" in existing_cols and "brands" not in existing_cols:
            print("[rfq_model] Old per-row schema detected — migrating...")
            _migrate_from_per_row_schema()
            return

        # Already on new schema
        print("[rfq_model] rfq_items table already up to date.")
        return

    Base.metadata.create_all(bind=engine)
    print("[rfq_model] rfq_items table created.")


# ── Migration 1: JSON line_items column → comma-joined columns ────────────────

def _migrate_from_json_schema() -> None:
    backup = "rfq_items_backup"

    with engine.begin() as conn:
        conn.execute(text(f"DROP TABLE IF EXISTS {backup}"))
        conn.execute(text(f"ALTER TABLE rfq_items RENAME TO {backup}"))
        conn.execute(text("DROP INDEX IF EXISTS ix_rfq_items_message_id"))
        conn.execute(text("DROP INDEX IF EXISTS ix_rfq_items_user_id"))

    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        rows = conn.execute(
            text(f"SELECT * FROM {backup}")
        ).mappings().all()

        count = 0
        for row in rows:
            try:
                items = json.loads(row["line_items"] or "[]")
            except (TypeError, json.JSONDecodeError):
                items = []

            if not isinstance(items, list):
                items = []

            brands       = ", ".join(str(i.get("brand")       or "") for i in items)
            part_numbers = ", ".join(str(i.get("part_number") or "") for i in items)
            quantities   = ", ".join(str(i.get("quantity")    or "") for i in items)
            notes        = ", ".join(str(i.get("notes")       or "") for i in items)

            conn.execute(text("""
                INSERT INTO rfq_items
                    (message_id, user_id, username, location,
                     brands, part_numbers, quantities, notes,
                     sender, subject, email_date, created_at)
                VALUES
                    (:message_id, :user_id, :username, :location,
                     :brands, :part_numbers, :quantities, :notes,
                     :sender, :subject, :email_date, :created_at)
            """), {
                "message_id":   row["message_id"],
                "user_id":      row["user_id"],
                "username":     row.get("username"),
                "location":     row.get("location"),
                "brands":       brands,
                "part_numbers": part_numbers,
                "quantities":   quantities,
                "notes":        notes,
                "sender":       row.get("sender"),
                "subject":      row.get("subject"),
                "email_date":   row.get("email_date"),
                "created_at":   row.get("created_at"),
            })
            count += 1

        conn.execute(text(f"DROP TABLE {backup}"))

    print(f"[rfq_model] JSON migration complete — {count} rows migrated.")


# ── Migration 2: per-row (brand/part_number) → comma-joined ──────────────────

def _migrate_from_per_row_schema() -> None:
    """
    Old schema: one row per part number, same message_id repeated.
    New schema: one row per email, parts comma-joined.
    """
    backup = "rfq_items_backup"

    with engine.begin() as conn:
        conn.execute(text(f"DROP TABLE IF EXISTS {backup}"))
        conn.execute(text(f"ALTER TABLE rfq_items RENAME TO {backup}"))
        conn.execute(text("DROP INDEX IF EXISTS ix_rfq_items_message_id"))
        conn.execute(text("DROP INDEX IF EXISTS ix_rfq_items_user_id"))

    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        message_ids = conn.execute(
            text(f"SELECT DISTINCT message_id FROM {backup}")
        ).scalars().all()

        count = 0
        for mid in message_ids:
            rows = conn.execute(
                text(f"SELECT * FROM {backup} WHERE message_id = :mid"),
                {"mid": mid}
            ).mappings().all()

            if not rows:
                continue

            first        = rows[0]
            brands       = ", ".join(r.get("brand",       "") or "" for r in rows)
            part_numbers = ", ".join(r.get("part_number", "") or "" for r in rows)
            quantities   = ", ".join(str(r.get("quantity", "") or "") for r in rows)
            notes        = ", ".join(r.get("notes",        "") or "" for r in rows)

            conn.execute(text("""
                INSERT INTO rfq_items
                    (message_id, user_id, username, location,
                     brands, part_numbers, quantities, notes,
                     sender, subject, email_date, created_at)
                VALUES
                    (:message_id, :user_id, :username, :location,
                     :brands, :part_numbers, :quantities, :notes,
                     :sender, :subject, :email_date, :created_at)
            """), {
                "message_id":   mid,
                "user_id":      first.get("user_id"),
                "username":     first.get("username"),
                "location":     first.get("location"),
                "brands":       brands,
                "part_numbers": part_numbers,
                "quantities":   quantities,
                "notes":        notes,
                "sender":       first.get("sender"),
                "subject":      first.get("subject"),
                "email_date":   first.get("email_date"),
                "created_at":   first.get("created_at"),
            })
            count += 1

        conn.execute(text(f"DROP TABLE {backup}"))

    print(f"[rfq_model] Per-row migration complete — {count} emails collapsed.")
