import { pool, query } from "@/lib/db";

let _manualSchemaReady = false;

async function ensureManualSchema() {
  if (_manualSchemaReady) return;

  // Relax the NOT NULL on inquiry_unique_code so manual quotations (which have
  // no linked inquiry) can store their generated code without a matching row.
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE quotations ALTER COLUMN inquiry_unique_code DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL;
    END $$
  `);

  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS source         TEXT         DEFAULT 'system'`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_phone   TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS billing_address TEXT`);
  await pool.query(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ`);

  // Monotonically increasing sequence per calendar year for manual quote IDs.
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS manual_quotation_seq START 1`);

  // Internal log-note / discussion table for all quotations.
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

  _manualSchemaReady = true;
}

export async function POST(request) {
  try {
    await ensureManualSchema();

    const {
      client_name,
      client_phone,
      billing_address,
      salesperson,
      currency,
      lines,
      gst_type,
      gst_rate,
      taxable_amount,
      tax_amount,
      grand_total,
      custom_tax_name,
      custom_tax_rate,
      status = "draft",
    } = await request.json();

    if (!client_name?.trim()) {
      return Response.json({ error: "client_name is required" }, { status: 400 });
    }

    const year = new Date().getFullYear();
    const seqRes = await pool.query("SELECT nextval('manual_quotation_seq') AS seq");
    const seq = String(seqRes.rows[0].seq).padStart(4, "0");
    // e.g. MANUAL-2026-0001  (stored in inquiry_unique_code for display + join safety)
    const manualCode = `MANUAL-${year}-${seq}`;
    const quotationNumber = `${manualCode}-QTN-001`;

    const result = await query(
      `INSERT INTO quotations
         (quotation_number, inquiry_unique_code, source, salesperson,
          client_name, client_phone, billing_address, currency,
          lines, gst_type, gst_rate, taxable_amount, tax_amount, grand_total,
          custom_tax_name, custom_tax_rate, status, revision_number, is_revision,
          quoted_at, created_at)
       VALUES ($1,$2,'manual',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,FALSE,NOW(),NOW())
       RETURNING *`,
      [
        quotationNumber,
        manualCode,
        salesperson || null,
        client_name.trim(),
        client_phone || null,
        billing_address || null,
        (currency || "INR").toUpperCase(),
        JSON.stringify(lines || []),
        gst_type || "NONE",
        gst_rate != null ? Number(gst_rate) : null,
        Number(taxable_amount) || 0,
        Number(tax_amount)     || 0,
        Number(grand_total)    || 0,
        custom_tax_name || null,
        custom_tax_rate != null ? Number(custom_tax_rate) : null,
        status,
      ]
    );

    return Response.json({ quotation: result.rows[0] }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
