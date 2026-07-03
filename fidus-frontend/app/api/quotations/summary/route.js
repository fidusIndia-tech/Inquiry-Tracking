import { pool, query } from "@/lib/db";

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  // quotations pre-existed this feature with only the original columns —
  // CREATE TABLE IF NOT EXISTS is a no-op against that, so the revision/
  // amendment/tax columns need their own ALTER ADD COLUMN IF NOT EXISTS,
  // same as in app/api/quotes/send-to-client/route.js (the write path).
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
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS revision_number INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS amendment_code TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS amendment_date DATE`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS is_revision BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS parent_quotation_id INT REFERENCES quotations(id)`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent'`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_name TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_email TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS currency TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tax_amount NUMERIC`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS grand_total NUMERIC`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS gst_type TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS gst_rate NUMERIC`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS custom_tax_name TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS custom_tax_rate NUMERIC`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`);
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
export async function GET(request) {
  try {
    await ensureSchema();

    const { searchParams } = new URL(request.url);
    const salesperson = searchParams.get("salesperson") || null;
    const spWhere = salesperson ? "WHERE q.salesperson = $1" : "";
    const spParam = salesperson ? [salesperson] : [];

    // Counts include all quotation rows (revisions + originals) — useful for history.
    // Values use only the LATEST quotation per inquiry so a revised quote doesn't
    // double-count the original in Total Quoted Value / This Month Value.
    const totals = await query(`
      WITH latest_per_inquiry AS (
        SELECT DISTINCT ON (inquiry_unique_code)
          inquiry_unique_code, grand_total, status, quoted_at, salesperson
        FROM quotations
        WHERE status != 'draft'
          ${salesperson ? "AND salesperson = $1" : ""}
        ORDER BY inquiry_unique_code, id DESC
      )
      SELECT
        (SELECT COUNT(*)                                                  FROM quotations q ${spWhere})  AS total,
        (SELECT COUNT(*) FILTER (WHERE q.status = 'draft')               FROM quotations q ${spWhere})  AS draft,
        (SELECT COUNT(*) FILTER (WHERE q.status IN ('sent','downloaded') AND NOT q.is_revision) FROM quotations q ${spWhere}) AS sent,
        (SELECT COUNT(*) FILTER (WHERE q.is_revision)                    FROM quotations q ${spWhere})  AS revised,
        (SELECT COUNT(DISTINCT q.inquiry_unique_code)
           FILTER (WHERE i.status = 'converted')
           FROM quotations q LEFT JOIN inquiries i ON i.unique_code = q.inquiry_unique_code ${spWhere}) AS converted,
        (SELECT COUNT(DISTINCT q.inquiry_unique_code)
           FILTER (WHERE i.status IN ('lost','dropped'))
           FROM quotations q LEFT JOIN inquiries i ON i.unique_code = q.inquiry_unique_code ${spWhere}) AS lost,
        COALESCE((SELECT SUM(grand_total) FROM latest_per_inquiry), 0)   AS total_value,
        COALESCE((SELECT SUM(grand_total) FROM latest_per_inquiry
                  WHERE quoted_at >= date_trunc('month', NOW())), 0)     AS monthly_value
    `, spParam);

    // Aliased as display_status, not "status" — GROUP BY status would be
    // ambiguous since both quotations.status and inquiries.status are in scope.
    const spWhere2 = salesperson ? "AND q.salesperson = $1" : "";

    const byStatus = await query(`
      SELECT
        CASE
          WHEN q.status = 'draft'              THEN 'draft'
          WHEN q.status = 'cancelled'          THEN 'cancelled'
          WHEN i.status = 'converted'          THEN 'accepted'
          WHEN i.status IN ('lost','dropped')  THEN 'lost'
          WHEN q.is_revision                   THEN 'revised'
          ELSE q.status
        END AS display_status,
        COUNT(*) AS count
      FROM quotations q
      LEFT JOIN inquiries i ON i.unique_code = q.inquiry_unique_code
      WHERE 1=1 ${spWhere2}
      GROUP BY display_status
      ORDER BY count DESC
    `, spParam);

    // Values in breakdown tables also use latest-per-inquiry to avoid
    // counting the original + revision of the same inquiry twice.
    const bySalesperson = salesperson ? [] : (await query(`
      SELECT COALESCE(salesperson, 'Unassigned') AS salesperson,
             COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS value
      FROM (
        SELECT DISTINCT ON (inquiry_unique_code)
          salesperson, grand_total
        FROM quotations
        WHERE status != 'draft'
        ORDER BY inquiry_unique_code, id DESC
      ) latest
      GROUP BY salesperson
      ORDER BY value DESC
      LIMIT 10
    `)).rows;

    const byMonth = await query(`
      SELECT to_char(quoted_at, 'YYYY-MM') AS month,
             COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS value
      FROM (
        SELECT DISTINCT ON (inquiry_unique_code)
          inquiry_unique_code, quoted_at, grand_total, salesperson
        FROM quotations
        WHERE status != 'draft'
          ${salesperson ? "AND salesperson = $1" : ""}
        ORDER BY inquiry_unique_code, id DESC
      ) latest
      GROUP BY month
      ORDER BY month
    `, spParam);

    const byClient = await query(`
      SELECT client_name, COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS value
      FROM (
        SELECT DISTINCT ON (inquiry_unique_code)
          inquiry_unique_code, client_name, grand_total, salesperson
        FROM quotations
        WHERE status != 'draft'
          AND client_name IS NOT NULL AND client_name != ''
          ${salesperson ? "AND salesperson = $1" : ""}
        ORDER BY inquiry_unique_code, id DESC
      ) latest
      GROUP BY client_name
      ORDER BY count DESC
      LIMIT 10
    `, spParam);

    const byBrand = await query(`
      SELECT line ->> 'brand' AS brand, COUNT(*) AS count
      FROM quotations, jsonb_array_elements(lines) AS line
      WHERE line ->> 'brand' IS NOT NULL AND line ->> 'brand' != ''
        ${salesperson ? "AND salesperson = $1" : ""}
      GROUP BY brand
      ORDER BY count DESC
      LIMIT 10
    `, spParam);

    const t = totals.rows[0];
    return Response.json({
      total: Number(t.total),
      draft: Number(t.draft),
      sent: Number(t.sent),
      revised: Number(t.revised),
      converted: Number(t.converted),
      lost: Number(t.lost),
      total_value: Number(t.total_value),
      monthly_value: Number(t.monthly_value),
      revision_count: Number(t.revised),
      by_status: byStatus.rows.map((r) => ({ status: r.display_status, count: Number(r.count) })),
      by_salesperson: (Array.isArray(bySalesperson) ? bySalesperson : bySalesperson.rows || []).map((r) => ({ salesperson: r.salesperson, count: Number(r.count), value: Number(r.value) })),
      by_month: byMonth.rows.map((r) => ({ month: r.month, count: Number(r.count), value: Number(r.value) })),
      by_client: byClient.rows.map((r) => ({ client_name: r.client_name, count: Number(r.count), value: Number(r.value) })),
      by_brand: byBrand.rows.map((r) => ({ brand: r.brand, count: Number(r.count) })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
