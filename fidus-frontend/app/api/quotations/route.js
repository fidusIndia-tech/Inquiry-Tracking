import { pool, query } from "@/lib/db";

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  // quotations pre-existed this feature with only the original columns
  // (id, quotation_number, inquiry_unique_code, salesperson, quoted_at,
  // expiration_date, lines, created_at) — CREATE TABLE IF NOT EXISTS is a
  // no-op against that, so the revision/amendment/tax columns below need
  // their own ALTER ADD COLUMN IF NOT EXISTS, same as in
  // app/api/quotes/send-to-client/route.js (the actual write path).
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
  // Manual quotation columns (idempotent — safe to run on every cold start)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE quotations ALTER COLUMN inquiry_unique_code DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL;
    END $$
  `);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS source          TEXT         DEFAULT 'system'`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_phone    TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS billing_address TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ`);
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS manual_quotation_seq START 1`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotation_notes (
      id              SERIAL      PRIMARY KEY,
      quotation_id    INT         NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      note_text       TEXT        NOT NULL,
      created_by      TEXT,
      created_by_role TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  _schemaReady = true;
}

// Status derivation rules:
//   Manual quotations drive status from q.status (draft / sent / cancelled).
//   System quotations (from inquiry flow) derive accepted/lost from the
//   linked inquiry, since that's where outcome is tracked.
const DISPLAY_STATUS_CASE = `
  CASE
    WHEN q.status = 'draft'                  THEN 'draft'
    WHEN q.status = 'cancelled'              THEN 'cancelled'
    WHEN i.status = 'converted'              THEN 'accepted'
    WHEN i.status IN ('lost', 'dropped')     THEN 'lost'
    WHEN q.is_revision                       THEN 'revised'
    ELSE q.status
  END
`;

export async function GET(request) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);

    const id = searchParams.get("id");
    if (id) {
      const single = await query(
        `SELECT q.*, (${DISPLAY_STATUS_CASE}) AS display_status
         FROM quotations q
         LEFT JOIN inquiries i ON i.unique_code = q.inquiry_unique_code
         WHERE q.id = $1`,
        [id]
      );
      if (!single.rows[0]) return Response.json({ error: "Quotation not found" }, { status: 404 });
      return Response.json({ quotation: single.rows[0] });
    }

    const uniqueCode  = searchParams.get("unique_code");
    const search      = searchParams.get("search");
    const status      = searchParams.get("status");       // draft|sent|revised|accepted|lost|cancelled
    const salesperson = searchParams.get("salesperson");
    const dateFrom    = searchParams.get("date_from");
    const dateTo      = searchParams.get("date_to");
    const revision    = searchParams.get("revision");      // all|original|revised
    const limit       = Math.min(Math.max(parseInt(searchParams.get("limit"), 10) || 200, 1), 1000);

    const where = [];
    const params = [];
    // Appends `clause` with each `?` replaced by a new positional
    // placeholder, in order, for however many `values` are passed.
    const add = (clause, ...values) => {
      let sql = clause;
      for (const v of values) {
        params.push(v);
        sql = sql.replace("?", `$${params.length}`);
      }
      where.push(sql);
    };

    if (uniqueCode)  add("q.inquiry_unique_code = ?", uniqueCode);
    if (search)      add(
      "(q.quotation_number ILIKE ? OR q.client_name ILIKE ? OR q.inquiry_unique_code ILIKE ?)",
      `%${search}%`, `%${search}%`, `%${search}%`
    );
    if (salesperson) add("q.salesperson = ?", salesperson);
    if (dateFrom)    add("q.quoted_at >= ?", dateFrom);
    if (dateTo)      add("q.quoted_at < (?::date + interval '1 day')", dateTo);
    if (revision === "original") where.push("q.is_revision = FALSE");
    if (revision === "revised")  where.push("q.is_revision = TRUE");
    if (status)      add(`(${DISPLAY_STATUS_CASE}) = ?`, status);

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const result = await query(
      `SELECT
         q.id, q.quotation_number, q.inquiry_unique_code, q.salesperson,
         q.quoted_at, q.expiration_date, q.revision_number, q.amendment_code,
         q.amendment_date, q.is_revision, q.parent_quotation_id, q.status,
         q.client_name, q.client_email, q.currency, q.taxable_amount,
         q.tax_amount, q.grand_total, q.gst_type, q.gst_rate,
         q.custom_tax_name, q.custom_tax_rate, q.sent_at,
         (${DISPLAY_STATUS_CASE}) AS display_status
       FROM quotations q
       LEFT JOIN inquiries i ON i.unique_code = q.inquiry_unique_code
       ${whereSql}
       ORDER BY q.id DESC
       LIMIT ${limit}`,
      params
    );

    return Response.json({ quotations: result.rows });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
