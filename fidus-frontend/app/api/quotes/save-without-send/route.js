import { pool, query } from "@/lib/db";

/**
 * Saves a quotation record without sending any email.
 * Used for portal-based clients (e.g. Ceat Tyre) who have no email address —
 * the employee downloads the PDF manually and submits it through the client's
 * portal. The quotation is still recorded with status = 'downloaded' so it
 * appears in Quotation Summary and revision numbering works correctly.
 *
 * Accepts the same body as /api/quotes/send-to-client except sender_email
 * may be absent.
 */

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotations (
      id                  SERIAL PRIMARY KEY,
      quotation_number    TEXT UNIQUE,
      inquiry_unique_code TEXT NOT NULL,
      salesperson         TEXT,
      quoted_at           TIMESTAMPTZ DEFAULT NOW(),
      expiration_date     DATE,
      lines               JSONB,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  const cols = [
    `revision_number INT NOT NULL DEFAULT 0`,
    `amendment_code TEXT`,
    `amendment_date DATE`,
    `is_revision BOOLEAN NOT NULL DEFAULT FALSE`,
    `parent_quotation_id INT REFERENCES quotations(id)`,
    `status TEXT NOT NULL DEFAULT 'sent'`,
    `client_name TEXT`,
    `client_email TEXT`,
    `currency TEXT`,
    `taxable_amount NUMERIC`,
    `tax_amount NUMERIC`,
    `grand_total NUMERIC`,
    `gst_type TEXT`,
    `gst_rate NUMERIC`,
    `custom_tax_name TEXT`,
    `custom_tax_rate NUMERIC`,
    `sent_at TIMESTAMPTZ`,
    `terms_and_conditions TEXT`,
    `sender_name TEXT`,
    `billing_address TEXT`,
    `client_note TEXT`,
  ];
  for (const col of cols) {
    await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS ${col}`);
  }
  _schemaReady = true;
}

function computeGstData(lines, gstOpt, customTax) {
  const taxable = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 1) * (Number(l.selling_price) || 0),
    0
  );
  const type = gstOpt?.type || "NONE";
  const rate = Number(gstOpt?.rate) || 0;
  let cgst = 0, sgst = 0, igst = 0, customAmount = 0;
  let customName = "", customRate = 0;
  if (type === "CGST_SGST") { cgst = sgst = taxable * (rate / 2) / 100; }
  if (type === "IGST")      { igst = taxable * rate / 100; }
  if (type === "CUSTOM") {
    customName = String(customTax?.name || "").trim() || "Custom Tax";
    customRate = Math.max(0, Number(customTax?.rate) || 0);
    customAmount = taxable * customRate / 100;
  }
  const totalGst = cgst + sgst + igst + customAmount;
  return { type, rate, taxable, cgst, sgst, igst, customName, customRate, customAmount, totalGst, grandTotal: taxable + totalGst };
}

export async function POST(request) {
  try {
    await ensureSchema();
    const { unique_code, lines, salesperson, gstOption, customTax, quote_currency, terms_text, client_note } = await request.json();
    if (!unique_code || !lines?.length) {
      return Response.json({ error: "unique_code and lines are required" }, { status: 400 });
    }

    const currency = (quote_currency || "INR").toUpperCase();
    const gstData  = computeGstData(lines, gstOption, customTax);

    const inquiryRes = await query(
      `SELECT i.client_name, i.sender_name, i.location, i.sender_email
       FROM inquiries i WHERE i.unique_code = $1 LIMIT 1`,
      [unique_code]
    );
    const inquiry = inquiryRes.rows[0];
    if (!inquiry) return Response.json({ error: "Inquiry not found" }, { status: 404 });

    const quotedAt = new Date();
    const expirationDate = new Date(quotedAt);
    expirationDate.setDate(expirationDate.getDate() + 21);

    const priorRes = await query(
      `SELECT id FROM quotations WHERE inquiry_unique_code = $1 AND status IN ('sent','downloaded') ORDER BY id ASC`,
      [unique_code]
    );
    const revisionNumber = priorRes.rows.length;
    const isRevision     = revisionNumber > 0;
    const baseNumber     = `${unique_code}-QTN-001`;
    const quotationNumber = isRevision ? `${baseNumber}-R${revisionNumber}` : baseNumber;
    const amendmentCode  = isRevision ? `R${revisionNumber}` : null;
    const amendmentDate  = isRevision ? quotedAt.toISOString().slice(0, 10) : null;
    const parentId       = isRevision ? priorRes.rows[0].id : null;

    const res = await query(
      `INSERT INTO quotations
         (quotation_number, inquiry_unique_code, salesperson, quoted_at, expiration_date, lines,
          revision_number, amendment_code, amendment_date, is_revision, parent_quotation_id,
          status, client_name, sender_name, client_email, currency,
          taxable_amount, tax_amount, grand_total, gst_type, gst_rate, custom_tax_name, custom_tax_rate,
          terms_and_conditions, client_note, sent_at, billing_address)
       VALUES ($1,$2,$3,$4,$5,$6, $7,$8,$9,$10,$11, $12,$13,$14,$15,$16, $17,$18,$19,$20,$21,$22,$23, $24,$25, NOW(), $26)
       RETURNING id`,
      [
        quotationNumber, unique_code, salesperson || null, quotedAt,
        expirationDate.toISOString().slice(0, 10), JSON.stringify(lines),
        revisionNumber, amendmentCode, amendmentDate, isRevision, parentId,
        "downloaded",
        inquiry.client_name || null, inquiry.sender_name || null,
        inquiry.sender_email || null, currency,
        gstData.taxable, gstData.totalGst, gstData.grandTotal,
        gstData.type, gstData.rate,
        gstData.customName || null, gstData.customRate || null,
        terms_text || null, client_note || null,
        inquiry.location || null,
      ]
    );

    await query(
      `UPDATE inquiries SET status = 'quoted', quoted_at = NOW() WHERE unique_code = $1`,
      [unique_code]
    );

    return Response.json({
      status:            "saved",
      quotation_id:      res.rows[0].id,
      quotation_number:  quotationNumber,
      revision_number:   revisionNumber,
      amendment_code:    amendmentCode,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
