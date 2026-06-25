import sanitizeHtml from "sanitize-html";
import { pool, query } from "@/lib/db";

let _quotesSchemaReady = false;
async function ensureQuotesSchema() {
  if (_quotesSchemaReady) return;
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
  await pool.query("ALTER TABLE vendor_quotes ADD COLUMN IF NOT EXISTS raw_reply_is_html BOOLEAN DEFAULT FALSE");
  _quotesSchemaReady = true;
}

// Vendor reply HTML is untrusted third-party content — strip scripts, event
// handlers, and anything else that isn't needed to render a quotation table.
function sanitizeVendorReply(html) {
  return sanitizeHtml(html, {
    allowedTags: [
      "table", "thead", "tbody", "tfoot", "tr", "th", "td",
      "p", "br", "div", "span", "b", "strong", "i", "em", "u", "ul", "ol", "li", "a",
    ],
    allowedAttributes: {
      a: ["href"],
      table: ["border", "cellpadding", "cellspacing"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

export async function GET(request) {
  try {
    await ensureQuotesSchema();
    const { searchParams } = new URL(request.url);
    const uniqueCode = searchParams.get("unique_code");
    if (!uniqueCode) return Response.json({ quotes: [] });

    const result = await query(
      `SELECT * FROM vendor_quotes WHERE inquiry_unique_code = $1 ORDER BY received_at DESC`,
      [uniqueCode]
    );
    return Response.json({ quotes: result.rows });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Called by the Python Quote Extraction Agent once it has parsed a vendor's
 * reply. One POST can carry multiple line-item quotes (a vendor may quote
 * several parts in a single reply table).
 */
export async function POST(request) {
  try {
    await ensureQuotesSchema();
    const { unique_code, draft_id, vendor_name, vendor_email, brand, raw_reply, raw_reply_is_html, quotes } = await request.json();

    if (!unique_code || !quotes?.length) {
      return Response.json({ error: "unique_code and quotes are required" }, { status: 400 });
    }

    const isHtml = Boolean(raw_reply_is_html && raw_reply);
    const cleanReply = isHtml ? sanitizeVendorReply(raw_reply) : raw_reply || null;

    const created = [];
    for (const q of quotes) {
      const res = await query(
        `INSERT INTO vendor_quotes
           (inquiry_unique_code, draft_id, vendor_name, vendor_email, brand, part_number,
            unit_price, currency, moq, lead_time, availability, remarks, raw_reply, raw_reply_is_html)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          unique_code,
          draft_id || null,
          vendor_name || null,
          vendor_email || null,
          brand || null,
          q.part_number || null,
          q.unit_price || null,
          q.currency || null,
          q.moq || null,
          q.lead_time || null,
          q.availability || null,
          q.remarks || null,
          cleanReply,
          isHtml,
        ]
      );
      if (res.rows[0]) created.push(res.rows[0]);
    }

    // Mark the originating draft as replied so reminders stop firing for it.
    if (draft_id) {
      await query(
        `UPDATE vendor_drafts SET replied_at = NOW(), status = 'replied' WHERE id = $1`,
        [draft_id]
      );
    }

    return Response.json({ quotes: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
