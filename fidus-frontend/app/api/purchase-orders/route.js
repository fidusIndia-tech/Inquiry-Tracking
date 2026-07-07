import { pool, query } from "@/lib/db";

let _poSchemaReady = false;
async function ensurePoSchema() {
  if (_poSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id                   SERIAL PRIMARY KEY,
      po_number            TEXT UNIQUE NOT NULL,
      inquiry_unique_code  TEXT NOT NULL,
      quotation_id         INT REFERENCES quotations(id),
      vendor_name          TEXT,
      vendor_email         TEXT,
      vendor_phone         TEXT,
      vendor_address       TEXT,
      currency             TEXT NOT NULL DEFAULT 'INR',
      subtotal             NUMERIC NOT NULL DEFAULT 0,
      grand_total          NUMERIC NOT NULL DEFAULT 0,
      status               TEXT NOT NULL DEFAULT 'generated',
      notes                TEXT,
      created_by           TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      sent_at              TIMESTAMPTZ,
      cancelled_at         TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id                   SERIAL PRIMARY KEY,
      purchase_order_id    INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      part_number          TEXT,
      brand                TEXT,
      description          TEXT,
      quantity             TEXT,
      uom                  TEXT,
      unit_price           NUMERIC,
      currency             TEXT,
      lead_time            TEXT,
      availability         TEXT,
      amount               NUMERIC,
      vendor_quote_id      INT REFERENCES vendor_quotes(id) ON DELETE SET NULL,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS po_unique_code_idx ON purchase_orders(inquiry_unique_code)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS po_quotation_idx   ON purchase_orders(quotation_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS po_status_idx      ON purchase_orders(status)`);
  // GST fields added after initial schema
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS gst_type  TEXT    NOT NULL DEFAULT 'NONE'`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS gst_rate  NUMERIC NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sales_representative TEXT`);
  await pool.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS terms_text TEXT`);
  // Add converted_at to inquiries if missing (used by confirm endpoint)
  await pool.query(`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ`);
  _poSchemaReady = true;
}

/* ── GET /api/purchase-orders?unique_code= ── */
export async function GET(request) {
  try {
    await ensurePoSchema();
    const { searchParams } = new URL(request.url);
    const uniqueCode = searchParams.get("unique_code");
    if (!uniqueCode) return Response.json({ purchase_orders: [] });

    const result = await query(
      `SELECT po.*,
              (SELECT json_agg(poi ORDER BY poi.id)
               FROM purchase_order_items poi
               WHERE poi.purchase_order_id = po.id) AS items
       FROM purchase_orders po
       WHERE po.inquiry_unique_code = $1
       ORDER BY po.created_at ASC`,
      [uniqueCode]
    );
    return Response.json({ purchase_orders: result.rows });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

/* ── POST /api/purchase-orders  { inquiry_unique_code, quotation_id } ── */
export async function POST(request) {
  try {
    await ensurePoSchema();
    const { inquiry_unique_code, quotation_id, created_by, gst_type, gst_rate, sales_representative, terms_text } = await request.json();
    const resolvedGstType = (gst_type || "NONE").toUpperCase();
    const resolvedGstRate = Number(gst_rate) || 0;
    if (!inquiry_unique_code || !quotation_id) {
      return Response.json({ error: "inquiry_unique_code and quotation_id are required" }, { status: 400 });
    }

    // Fetch the confirmed quotation — also join inquiry status so that an
    // already-converted inquiry (status set externally) passes validation even
    // if the quotation row itself still reads 'sent'.
    const qtRes = await query(
      `SELECT q.id, q.status, q.lines, q.currency, i.status AS inquiry_status
       FROM quotations q
       LEFT JOIN inquiries i ON i.unique_code = q.inquiry_unique_code
       WHERE q.id = $1`,
      [quotation_id]
    );
    const qt = qtRes.rows[0];
    if (!qt) return Response.json({ error: "Quotation not found" }, { status: 404 });
    const isConfirmed = qt.status === "accepted"
                     || qt.status === "downloaded"
                     || qt.status === "sent"      // allow when inquiry is already converted
                        && qt.inquiry_status === "converted";
    if (!isConfirmed) {
      return Response.json({ error: "Quotation must be confirmed (accepted) before generating POs" }, { status: 400 });
    }

    const lines = Array.isArray(qt.lines) ? qt.lines : [];
    // Filter lines that have a selected vendor
    const vendorLines = lines.filter((l) => l.vendor_name || l.vendor_email);
    if (vendorLines.length === 0) {
      return Response.json({
        error: "No selected vendor prices found. Re-send the quotation after selecting vendor prices for each line item.",
      }, { status: 400 });
    }

    // Warn about lines missing vendor info
    const missingVendorLines = lines.filter((l) => !l.vendor_name && !l.vendor_email);

    // Check for existing POs for this quotation (prevent duplicates)
    const existingRes = await query(
      `SELECT id FROM purchase_orders WHERE quotation_id = $1 AND status != 'cancelled'`,
      [quotation_id]
    );
    if (existingRes.rows.length > 0) {
      return Response.json({
        error: "Purchase Orders already exist for this quotation. Cancel them first to regenerate.",
        existing_po_ids: existingRes.rows.map((r) => r.id),
      }, { status: 409 });
    }

    // Determine next PO sequence number for this inquiry
    const seqRes = await query(
      `SELECT COUNT(*) FROM purchase_orders WHERE inquiry_unique_code = $1`,
      [inquiry_unique_code]
    );
    let seqBase = Number(seqRes.rows[0].count);

    // Group lines by vendor (email preferred, name as fallback)
    const vendorGroups = new Map();
    for (const line of vendorLines) {
      const key = (line.vendor_email || "").toLowerCase().trim()
               || (line.vendor_name  || "").toLowerCase().trim()
               || "__unknown__";
      if (!vendorGroups.has(key)) {
        vendorGroups.set(key, {
          vendor_name:    line.vendor_name  || null,
          vendor_email:   line.vendor_email || null,
          vendor_currency: line.vendor_currency || qt.currency || "INR",
          lines:          [],
        });
      }
      vendorGroups.get(key).lines.push(line);
    }

    const createdPos = [];
    for (const [, group] of vendorGroups) {
      seqBase += 1;
      const poNumber = `${inquiry_unique_code}-PO-${String(seqBase).padStart(3, "0")}`;
      const currency = group.vendor_currency;

      const items = group.lines.map((l) => ({
        part_number:     l.part_number    || null,
        brand:           l.brand          || null,
        description:     l.description    || null,
        quantity:        l.quantity       || null,
        uom:             l.uom            || null,
        unit_price:      l.vendor_unit_price != null ? Number(l.vendor_unit_price) : null,
        currency,
        lead_time:       l.lead_time      || null,
        availability:    l.vendor_availability || null,
        amount:          l.vendor_unit_price != null && l.quantity
                         ? Number(l.vendor_unit_price) * Number(l.quantity)
                         : null,
        vendor_quote_id: l.vendor_quote_id || null,
      }));

      const subtotal   = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
      const taxAmount  = resolvedGstType !== "NONE" ? subtotal * resolvedGstRate / 100 : 0;
      const grandTotal = subtotal + taxAmount;

      const poRes = await query(
        `INSERT INTO purchase_orders
           (po_number, inquiry_unique_code, quotation_id, vendor_name, vendor_email,
            currency, subtotal, tax_amount, grand_total, gst_type, gst_rate, status, created_by,
            sales_representative, terms_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'generated', $12, $13, $14)
         RETURNING *`,
        [poNumber, inquiry_unique_code, quotation_id,
         group.vendor_name, group.vendor_email,
         currency, subtotal, taxAmount, grandTotal,
         resolvedGstType, resolvedGstRate, created_by || null,
         sales_representative || null, terms_text || null]
      );
      const po = poRes.rows[0];

      for (const item of items) {
        await query(
          `INSERT INTO purchase_order_items
             (purchase_order_id, part_number, brand, description, quantity, uom,
              unit_price, currency, lead_time, availability, amount, vendor_quote_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [po.id, item.part_number, item.brand, item.description, item.quantity, item.uom,
           item.unit_price, item.currency, item.lead_time, item.availability,
           item.amount, item.vendor_quote_id]
        );
      }

      // Fetch with items for response
      const fullRes = await query(
        `SELECT po.*,
                (SELECT json_agg(poi ORDER BY poi.id) FROM purchase_order_items poi
                 WHERE poi.purchase_order_id = po.id) AS items
         FROM purchase_orders po WHERE po.id = $1`,
        [po.id]
      );
      createdPos.push(fullRes.rows[0]);
    }

    return Response.json({
      purchase_orders:     createdPos,
      missing_vendor_lines: missingVendorLines.map((l) => l.part_number),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
