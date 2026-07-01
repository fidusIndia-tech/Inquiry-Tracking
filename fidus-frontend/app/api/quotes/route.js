import sanitizeHtml from "sanitize-html";
import { pool, query } from "@/lib/db";
import { legacyQuery } from "@/lib/legacyDb";

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
  // Dedup: same vendor quoting the same part for the same inquiry is an upsert, not a duplicate row.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_quotes_dedup_idx
    ON vendor_quotes(inquiry_unique_code, LOWER(COALESCE(vendor_email,'')), LOWER(COALESCE(part_number,'')))
  `);
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
    const { unique_code, draft_id, vendor_name, vendor_email, source_email, brand, raw_reply, raw_reply_is_html, quotes } = await request.json();

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
         ON CONFLICT (inquiry_unique_code, LOWER(COALESCE(vendor_email,'')), LOWER(COALESCE(part_number,'')))
         DO UPDATE SET
           unit_price        = EXCLUDED.unit_price,
           currency          = EXCLUDED.currency,
           moq               = EXCLUDED.moq,
           lead_time         = EXCLUDED.lead_time,
           availability      = EXCLUDED.availability,
           remarks           = EXCLUDED.remarks,
           raw_reply         = EXCLUDED.raw_reply,
           raw_reply_is_html = EXCLUDED.raw_reply_is_html,
           received_at       = NOW()
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

    // Mirror each quoted line into the legacy parts_table so this vendor
    // automatically appears in "Company History" for future inquiries with
    // the same brand. Non-fatal — a legacy DB hiccup must not block saving.
    if (vendor_email && created.length > 0) {
      try {
        for (const q of created) {
          await legacyQuery(
            `INSERT INTO parts_table (supplier, email_from, brand, part_no, price, currency, delivery_time, source_email)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              vendor_name || null,
              vendor_email,
              q.brand || null,
              q.part_number || null,
              q.unit_price != null ? String(q.unit_price) : null,
              q.currency || null,
              q.lead_time || null,
              source_email || null,
            ]
          );
        }
        console.log(`[quotes] Mirrored ${created.length} line(s) to legacy parts_table | ${vendor_email}`);
      } catch (legacyErr) {
        console.error("[quotes] Legacy parts_table mirror failed (non-fatal):", legacyErr.message);
      }
    }

    // Mark the originating draft as replied so reminders stop for that vendor.
    if (draft_id) {
      await query(
        `UPDATE vendor_drafts SET replied_at = NOW(), status = 'replied' WHERE id = $1`,
        [draft_id]
      );
    } else if (vendor_email) {
      // draft_id was null (vendor replied from a different thread / email address
      // so the extract task couldn't match by thread_id or vendor_email exactly).
      // Fall back to matching by unique_code + vendor_email (case-insensitive) so
      // the reminder worker stops firing for this vendor even without a direct id.
      const fallback = await query(
        `UPDATE vendor_drafts
         SET replied_at = NOW(), status = 'replied'
         WHERE inquiry_unique_code = $1
           AND LOWER(TRIM(vendor_email)) = LOWER(TRIM($2))
           AND status = 'sent'
         RETURNING id`,
        [unique_code, vendor_email]
      );
      if (fallback.rowCount > 0) {
        console.log(
          `[quotes] Marked draft replied via email fallback | ${unique_code} | ${vendor_email} | rows=${fallback.rowCount}`
        );
      }
    }

    return Response.json({ quotes: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
