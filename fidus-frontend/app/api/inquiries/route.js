import { pool, query, withTransaction } from "@/lib/db";

let _inquiriesSchemaReady = false;
async function ensureInquiriesSchema() {
  if (_inquiriesSchemaReady) return;
  await pool.query("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS assigned_ref_name TEXT");
  await pool.query("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS remark TEXT");
  await pool.query("ALTER TABLE inquiry_items ADD COLUMN IF NOT EXISTS brand_source TEXT");
  // Ensure vendor_drafts and vendor_quotes exist so the price-count JOIN never fails.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_drafts (
      id                  SERIAL PRIMARY KEY,
      inquiry_unique_code TEXT NOT NULL,
      vendor_name         TEXT,
      vendor_email        TEXT,
      brand               TEXT,
      part_number         TEXT,
      subject             TEXT NOT NULL DEFAULT '',
      body                TEXT NOT NULL DEFAULT '',
      status              TEXT DEFAULT 'draft',
      source              TEXT DEFAULT 'discovered',
      thread_id           TEXT,
      message_id          TEXT,
      rfc_message_id      TEXT,
      sent_at             TIMESTAMPTZ,
      reminded_at         TIMESTAMPTZ,
      replied_at          TIMESTAMPTZ,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_quotes (
      id                  SERIAL PRIMARY KEY,
      inquiry_unique_code TEXT NOT NULL,
      draft_id            INT REFERENCES vendor_drafts(id) ON DELETE CASCADE,
      vendor_name         TEXT,
      vendor_email        TEXT,
      brand               TEXT,
      part_number         TEXT,
      unit_price          NUMERIC,
      currency            TEXT,
      moq                 TEXT,
      lead_time           TEXT,
      availability        TEXT,
      remarks             TEXT,
      raw_reply           TEXT,
      raw_reply_is_html   BOOLEAN DEFAULT FALSE,
      received_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Per-user read tracking: when a user last viewed vendor prices for each inquiry.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inquiry_price_views (
      inquiry_unique_code TEXT    NOT NULL,
      user_id             INTEGER NOT NULL,
      last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (inquiry_unique_code, user_id)
    )
  `);
  // Must exist before the blocked-client backup filter below ever runs —
  // same table the /api/blocked-clients route owns; idempotent, never drops data.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_clients (
      id            SERIAL  PRIMARY KEY,
      sender_email  TEXT    NOT NULL UNIQUE,
      client_name   TEXT,
      reason        TEXT,
      blocked_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  _inquiriesSchemaReady = true;
}

export async function GET(request) {
  try {
    await ensureInquiriesSchema();

    const { searchParams } = new URL(request.url);
    const rawUserId = searchParams.get("userId");
    const userIdParam = rawUserId ? (parseInt(rawUserId, 10) || null) : null;

    const result = await query(`
      SELECT
        i.id,
        i.unique_code,
        i.client_name,
        i.location,
        i.sender_name,
        i.sender_email,
        i.subject,
        i.notes,
        i.email_date,
        i.status,
        i.assigned_to,
        i.assigned_at,
        i.assigned_ref_name,
        i.in_progress_at,
        i.quoted_at,
        i.remark,
        u.name AS assigned_to_name,
        i.created_at,
        r.message_id,
        r.thread_id,
        COALESCE(items_agg.items, '[]'::json)       AS items,
        COALESCE(vq_agg.vendor_price_count, 0)       AS vendor_price_count,
        vq_agg.latest_price_received_at,
        ipv.last_seen_at AS last_price_seen_at,
        CASE
          WHEN $1::INTEGER IS NOT NULL
            AND COALESCE(vq_agg.vendor_price_count, 0) > 0
            AND (ipv.last_seen_at IS NULL OR vq_agg.latest_price_received_at > ipv.last_seen_at)
          THEN true
          ELSE false
        END AS has_unseen_prices
      FROM inquiries i
      LEFT JOIN raw_email_items r ON r.id = i.raw_email_item_id
      LEFT JOIN users          u  ON u.id = i.assigned_to
      -- Pre-aggregated in its own subquery — joining inquiry_items and
      -- vendor_quotes directly in one query (each a separate one-to-many
      -- relation off the same inquiry) produces a Cartesian product before
      -- GROUP BY collapses it, so json_agg(items) silently duplicates every
      -- item once per vendor quote as soon as ANY prices arrive. Isolating
      -- each aggregation in its own LATERAL subquery means neither one can
      -- fan out the other.
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', ii.id,
            'brand', ii.brand,
            'brandSource', ii.brand_source,
            'partNumber', ii.part_number,
            'quantity', ii.quantity,
            'uom', ii.uom,
            'vendor', ii.vendor,
            'itemNotes', ii.item_notes
          )
        ) AS items
        FROM inquiry_items ii
        WHERE ii.inquiry_id = i.id
      ) items_agg ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS vendor_price_count, MAX(received_at) AS latest_price_received_at
        FROM vendor_quotes vq
        WHERE LOWER(vq.inquiry_unique_code) = LOWER(i.unique_code)
      ) vq_agg ON true
      LEFT JOIN inquiry_price_views ipv
        ON ipv.inquiry_unique_code = i.unique_code
        AND ($1::INTEGER IS NOT NULL AND ipv.user_id = $1::INTEGER)
      WHERE NOT EXISTS (
        SELECT 1 FROM blocked_clients bc
        WHERE LOWER(TRIM(bc.sender_email)) = LOWER(TRIM(i.sender_email))
      )
      ORDER BY i.email_date DESC NULLS LAST, i.created_at DESC
    `, [userIdParam]);

    return Response.json({ inquiries: result.rows });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to load inquiries" },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const payload = await request.json();
    const uniqueCode = payload.unique_code || payload.uniqueCode;

    if (!uniqueCode) {
      return Response.json({ error: "unique_code is required" }, { status: 400 });
    }

    const result = await query(
      `
        UPDATE inquiries
        SET
          client_name = $1,
          location = $2,
          sender_name = $3,
          sender_email = $4,
          subject = $5,
          notes = $6,
          updated_at = NOW()
        WHERE unique_code = $7
        RETURNING
          unique_code,
          client_name,
          location,
          sender_name,
          sender_email,
          subject,
          notes
      `,
      [
        payload.client_name || null,
        payload.location || null,
        payload.sender_name || null,
        payload.sender_email || null,
        payload.subject || null,
        payload.notes || null,
        uniqueCode,
      ]
    );

    if (result.rowCount === 0) {
      return Response.json({ error: "Inquiry not found" }, { status: 404 });
    }

    await query("SELECT pg_notify('inquiries_changed', '')");
    return Response.json({ inquiry: result.rows[0] });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to update inquiry" },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { unique_code, sender_email } = await request.json();

    if (!unique_code && !sender_email) {
      return Response.json({ error: "unique_code or sender_email is required" }, { status: 400 });
    }

    let deletedCount = 0;

    await withTransaction(async (client) => {
      const inqResult = sender_email
        ? await client.query(
            `SELECT id FROM inquiries WHERE LOWER(sender_email) = LOWER($1)`,
            [sender_email.trim()]
          )
        : await client.query(
            `SELECT id FROM inquiries WHERE unique_code = $1`,
            [unique_code]
          );

      if (!inqResult.rows.length) {
        if (!sender_email) throw new Error("Inquiry not found");
        return;
      }

      const inquiryIds = inqResult.rows.map((r) => r.id);
      await client.query(`DELETE FROM inquiry_items WHERE inquiry_id = ANY($1)`, [inquiryIds]);
      await client.query(`DELETE FROM inquiries    WHERE id = ANY($1)`,          [inquiryIds]);
      await client.query("SELECT pg_notify('inquiries_changed', '')");
      deletedCount = inquiryIds.length;
    });

    return Response.json({ success: true, deleted: deletedCount });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to delete inquiry" },
      { status: 500 }
    );
  }
}
