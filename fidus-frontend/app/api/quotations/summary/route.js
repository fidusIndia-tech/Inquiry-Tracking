import { pool, query } from "@/lib/db";

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
      revision_number     INT NOT NULL DEFAULT 0,
      amendment_code      TEXT,
      amendment_date      DATE,
      is_revision         BOOLEAN NOT NULL DEFAULT FALSE,
      parent_quotation_id INT REFERENCES quotations(id),
      status              TEXT NOT NULL DEFAULT 'sent',
      client_name         TEXT,
      client_email        TEXT,
      currency            TEXT,
      taxable_amount      NUMERIC,
      tax_amount          NUMERIC,
      grand_total         NUMERIC,
      gst_type            TEXT,
      gst_rate            NUMERIC,
      custom_tax_name     TEXT,
      custom_tax_rate     NUMERIC,
      sent_at             TIMESTAMPTZ,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  _schemaReady = true;
}

/**
 * Odoo-style quotation summary for the admin panel. "Draft" is always 0 —
 * the current flow creates and emails a quotation in one atomic step, so
 * there's no draft-quotation stage to count. "Accepted"/"Lost" are derived
 * from the linked inquiry's status (converted / lost+dropped) rather than a
 * quotation-level field, since that's where this system actually tracks
 * outcome today.
 */
export async function GET() {
  try {
    await ensureSchema();

    const totals = await query(`
      SELECT
        COUNT(*)                                                        AS total,
        COUNT(*) FILTER (WHERE q.status = 'sent')                       AS sent,
        COUNT(*) FILTER (WHERE q.is_revision)                           AS revised,
        COUNT(DISTINCT q.inquiry_unique_code) FILTER (WHERE i.status = 'converted')        AS converted,
        COUNT(DISTINCT q.inquiry_unique_code) FILTER (WHERE i.status IN ('lost', 'dropped')) AS lost,
        COALESCE(SUM(q.grand_total), 0)                                 AS total_value,
        COALESCE(SUM(q.grand_total) FILTER (
          WHERE q.quoted_at >= date_trunc('month', NOW())
        ), 0)                                                           AS monthly_value
      FROM quotations q
      LEFT JOIN inquiries i ON i.unique_code = q.inquiry_unique_code
    `);

    const byStatus = await query(`
      SELECT
        CASE
          WHEN i.status = 'converted' THEN 'accepted'
          WHEN i.status IN ('lost', 'dropped') THEN 'lost'
          WHEN q.is_revision THEN 'revised'
          ELSE q.status
        END AS status,
        COUNT(*) AS count
      FROM quotations q
      LEFT JOIN inquiries i ON i.unique_code = q.inquiry_unique_code
      GROUP BY status
      ORDER BY count DESC
    `);

    const bySalesperson = await query(`
      SELECT COALESCE(salesperson, 'Unassigned') AS salesperson,
             COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS value
      FROM quotations
      GROUP BY salesperson
      ORDER BY count DESC
      LIMIT 10
    `);

    const byMonth = await query(`
      SELECT to_char(quoted_at, 'YYYY-MM') AS month,
             COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS value
      FROM quotations
      GROUP BY month
      ORDER BY month
    `);

    const byClient = await query(`
      SELECT client_name, COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS value
      FROM quotations
      WHERE client_name IS NOT NULL AND client_name != ''
      GROUP BY client_name
      ORDER BY count DESC
      LIMIT 10
    `);

    // "lines" is the JSONB array of quoted line items — each carries a
    // "brand" field (see lib/quotationPdf.jsx), so this reuses the actual
    // quoted data instead of needing a separate per-line table.
    const byBrand = await query(`
      SELECT line ->> 'brand' AS brand, COUNT(*) AS count
      FROM quotations, jsonb_array_elements(lines) AS line
      WHERE line ->> 'brand' IS NOT NULL AND line ->> 'brand' != ''
      GROUP BY brand
      ORDER BY count DESC
      LIMIT 10
    `);

    const t = totals.rows[0];
    return Response.json({
      total: Number(t.total),
      draft: 0,
      sent: Number(t.sent),
      revised: Number(t.revised),
      converted: Number(t.converted),
      lost: Number(t.lost),
      total_value: Number(t.total_value),
      monthly_value: Number(t.monthly_value),
      revision_count: Number(t.revised),
      by_status: byStatus.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
      by_salesperson: bySalesperson.rows.map((r) => ({ salesperson: r.salesperson, count: Number(r.count), value: Number(r.value) })),
      by_month: byMonth.rows.map((r) => ({ month: r.month, count: Number(r.count), value: Number(r.value) })),
      by_client: byClient.rows.map((r) => ({ client_name: r.client_name, count: Number(r.count), value: Number(r.value) })),
      by_brand: byBrand.rows.map((r) => ({ brand: r.brand, count: Number(r.count) })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
