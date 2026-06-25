import { query } from "@/lib/db";

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS vendor_prices (
    id               BIGSERIAL PRIMARY KEY,
    inquiry_id       BIGINT REFERENCES inquiries(id) ON DELETE CASCADE,
    fiapl_unique_code TEXT NOT NULL,
    vendor_name      TEXT,
    vendor_email     TEXT,
    price            TEXT,
    currency         TEXT DEFAULT 'INR',
    remarks          TEXT,
    source_email_id  TEXT,
    received_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_vendor_prices_inquiry_id
    ON vendor_prices(inquiry_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_prices_source_email
    ON vendor_prices(source_email_id)
    WHERE source_email_id IS NOT NULL;
`;

export async function GET(request) {
  try {
    await query(ENSURE_TABLE);
    const { searchParams } = new URL(request.url);
    const inquiryId = searchParams.get("inquiry_id");

    if (!inquiryId) {
      return Response.json({ error: "inquiry_id is required" }, { status: 400 });
    }

    const result = await query(
      `SELECT id, vendor_name, vendor_email, price, currency, remarks, received_at
       FROM vendor_prices
       WHERE inquiry_id = $1
       ORDER BY received_at ASC`,
      [inquiryId]
    );
    return Response.json({ vendor_prices: result.rows });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load vendor prices" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await query(ENSURE_TABLE);
    const { inquiry_id, fiapl_unique_code, vendor_name, vendor_email, price, currency, remarks, source_email_id } = await request.json();

    if (!inquiry_id || !fiapl_unique_code) {
      return Response.json({ error: "inquiry_id and fiapl_unique_code are required" }, { status: 400 });
    }

    const inqCheck = await query(`SELECT id FROM inquiries WHERE id = $1`, [inquiry_id]);
    if (!inqCheck.rows.length) {
      return Response.json({ error: "Inquiry not found" }, { status: 404 });
    }

    const result = await query(
      `INSERT INTO vendor_prices
         (inquiry_id, fiapl_unique_code, vendor_name, vendor_email, price, currency, remarks, source_email_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (source_email_id) WHERE source_email_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [
        inquiry_id,
        fiapl_unique_code.trim().toUpperCase(),
        vendor_name?.trim() || null,
        vendor_email?.trim().toLowerCase() || null,
        price?.trim() || null,
        currency?.trim() || "INR",
        remarks?.trim() || null,
        source_email_id?.trim() || null,
      ]
    );

    await query("SELECT pg_notify('inquiries_changed', '')");
    return Response.json({ vendor_price: result.rows[0] || null });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to save vendor price" }, { status: 500 });
  }
}
