import psycopg2

DB = 'postgresql://postgres:OnuntlCtyuoeyEvJdNxfsGVqtSIMmEgT@acela.proxy.rlwy.net:37132/railway'
conn = psycopg2.connect(DB, connect_timeout=15)
conn.autocommit = True
cur = conn.cursor()

migration = """
-- 1. thread_id on raw_email_items
ALTER TABLE raw_email_items
  ADD COLUMN IF NOT EXISTS thread_id TEXT;

-- 2. source_fingerprint on raw_email_items (unique, nullable)
ALTER TABLE raw_email_items
  ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS raw_email_items_fingerprint_idx
  ON raw_email_items (source_fingerprint)
  WHERE source_fingerprint IS NOT NULL;

-- 3. inquiry_reminders table
CREATE TABLE IF NOT EXISTS inquiry_reminders (
  id              BIGSERIAL PRIMARY KEY,
  inquiry_id      BIGINT REFERENCES inquiries(id) ON DELETE SET NULL,
  thread_id       TEXT,
  message_id      TEXT UNIQUE,
  sender_email    TEXT,
  sender_name     TEXT,
  subject         TEXT,
  llm_summary     TEXT,
  received_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'unread'
    CHECK (status IN ('unread', 'seen', 'actioned')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inquiry_reminders_inquiry_id_idx
  ON inquiry_reminders (inquiry_id);
CREATE INDEX IF NOT EXISTS inquiry_reminders_thread_id_idx
  ON inquiry_reminders (thread_id);
CREATE INDEX IF NOT EXISTS inquiry_reminders_status_idx
  ON inquiry_reminders (status);
"""

cur.execute(migration)
print("Migration complete.")

# Verify
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='raw_email_items' AND column_name IN ('thread_id','source_fingerprint')")
print("raw_email_items new cols:", [r[0] for r in cur.fetchall()])

cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name='inquiry_reminders'")
print("inquiry_reminders table exists:", bool(cur.fetchone()))

cur.close()
conn.close()
