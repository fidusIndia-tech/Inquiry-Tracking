import { pool, query } from "@/lib/db";

let _draftsSchemaReady = false;
async function ensureDraftsSchema() {
  if (_draftsSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_drafts (
      id                  SERIAL PRIMARY KEY,
      inquiry_unique_code TEXT NOT NULL,
      vendor_name         TEXT,
      vendor_email        TEXT,
      brand               TEXT,
      subject             TEXT NOT NULL,
      body                TEXT NOT NULL,
      status              TEXT DEFAULT 'draft',
      source              TEXT DEFAULT 'discovered',
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  _draftsSchemaReady = true;
}

function buildDraft(vendor, inquiryItems, clientName) {
  // Filter items matching this vendor's brand; fall back to all items
  const brandItems = inquiryItems.filter(
    (i) => (i.brand || "").toLowerCase() === (vendor.brand || "").toLowerCase()
  );
  const items = brandItems.length > 0 ? brandItems : inquiryItems;

  const itemLines = items
    .map((item, idx) => {
      const line = [`  ${idx + 1}. Part No: ${item.partNumber || item.part_no || "—"}`];
      if (item.quantity) line.push(`Qty: ${item.quantity}${item.uom ? " " + item.uom : ""}`);
      if (item.itemNotes) line.push(`Notes: ${item.itemNotes}`);
      return line.join("  |  ");
    })
    .join("\n");

  const partNos = items
    .map((i) => i.partNumber || i.part_no)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

  const subject = `RFQ – ${vendor.brand || "Parts"} | ${partNos}`;

  const body = `Dear ${vendor.name} Team,

Greetings from FIAPL (Fidus India Pvt. Ltd.)!

We have an urgent procurement requirement${clientName ? ` for our client ${clientName}` : ""} and request your best offer for the following:

${itemLines}

Kindly share the following at the earliest:
  • Unit Price (exclusive and inclusive of GST)
  • Availability / Stock Status
  • Delivery Timeline / Lead Time
  • Any applicable alternate part numbers

This is time-sensitive — your prompt response will be greatly appreciated.

Warm regards,
FIAPL Procurement Team
Fidus India Pvt. Ltd.
sales@fidusindia.com`;

  return { subject, body };
}

export async function GET(request) {
  try {
    await ensureDraftsSchema();
    const { searchParams } = new URL(request.url);
    const uniqueCode = searchParams.get("unique_code");
    if (!uniqueCode) return Response.json({ drafts: [] });

    const result = await query(
      `SELECT * FROM vendor_drafts WHERE inquiry_unique_code = $1 ORDER BY created_at ASC`,
      [uniqueCode]
    );
    return Response.json({ drafts: result.rows });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await ensureDraftsSchema();
    const { unique_code, client_name, vendors, inquiry_items } = await request.json();

    if (!unique_code || !vendors?.length) {
      return Response.json(
        { error: "unique_code and vendors are required" },
        { status: 400 }
      );
    }

    const created = [];
    for (const vendor of vendors) {
      const { subject, body } = buildDraft(vendor, inquiry_items || [], client_name);
      const res = await query(
        `INSERT INTO vendor_drafts
           (inquiry_unique_code, vendor_name, vendor_email, brand, subject, body, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          unique_code,
          vendor.name,
          vendor.email,
          vendor.brand,
          subject,
          body,
          vendor.source || "discovered",
        ]
      );
      if (res.rows[0]) created.push(res.rows[0]);
    }

    return Response.json({ drafts: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    await ensureDraftsSchema();
    const { id, subject, body, status } = await request.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const setClauses = [];
    const values = [];
    let idx = 1;
    if (subject !== undefined) { setClauses.push(`subject = $${idx++}`); values.push(subject); }
    if (body    !== undefined) { setClauses.push(`body = $${idx++}`);    values.push(body); }
    if (status  !== undefined) { setClauses.push(`status = $${idx++}`);  values.push(status); }
    setClauses.push("updated_at = NOW()");
    values.push(id);

    const result = await query(
      `UPDATE vendor_drafts SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    return Response.json({ draft: result.rows[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
