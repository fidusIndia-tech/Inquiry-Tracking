CREATE SCHEMA IF NOT EXISTS inquiry AUTHORIZATION inquiry_user;
SET search_path TO inquiry, public;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
  team_id BIGINT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_email_items (
  id BIGSERIAL PRIMARY KEY,
  parser_row_id TEXT,
  message_id TEXT,
  source_user_id TEXT,
  username TEXT,
  location TEXT,
  brands TEXT,
  part_numbers TEXT,
  quantities TEXT,
  notes TEXT,
  sender TEXT,
  subject TEXT,
  email_date TIMESTAMPTZ,
  parser_created_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_status TEXT NOT NULL DEFAULT 'pending',
  processing_error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS raw_email_items_message_id_idx
  ON raw_email_items (message_id)
  WHERE message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS inquiries (
  id BIGSERIAL PRIMARY KEY,
  unique_code TEXT UNIQUE NOT NULL,
  raw_email_item_id BIGINT REFERENCES raw_email_items(id),
  client_name TEXT,
  location TEXT,
  sender_name TEXT,
  sender_email TEXT,
  subject TEXT,
  notes TEXT,
  email_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'assigned', 'in_progress', 'quoted', 'converted', 'lost', 'dropped')),
  assigned_to BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inquiry_items (
  id BIGSERIAL PRIMARY KEY,
  inquiry_id BIGINT NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  brand TEXT,
  part_number TEXT,
  quantity NUMERIC,
  uom TEXT,
  vendor TEXT,
  item_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inquiry_status_history (
  id BIGSERIAL PRIMARY KEY,
  inquiry_id BIGINT NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by BIGINT REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inquiries_status_idx ON inquiries (status);
CREATE INDEX IF NOT EXISTS inquiries_email_date_idx ON inquiries (email_date);
CREATE INDEX IF NOT EXISTS inquiry_items_inquiry_id_idx ON inquiry_items (inquiry_id);

INSERT INTO teams (code, name)
VALUES
  ('TM', 'TM'),
  ('BS', 'BS'),
  ('SY', 'SY')
ON CONFLICT (code) DO NOTHING;
