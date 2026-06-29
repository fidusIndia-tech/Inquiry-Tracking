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
      part_number         TEXT,
      subject             TEXT NOT NULL,
      body                TEXT NOT NULL,
      status              TEXT DEFAULT 'draft',
      source              TEXT DEFAULT 'discovered',
      thread_id           TEXT,
      message_id          TEXT,
      rfc_message_id      TEXT,
      sent_at             TIMESTAMPTZ,
      reminded_at         TIMESTAMPTZ,
      replied_at          TIMESTAMPTZ,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Additive columns for installs created before these fields existed.
  await pool.query(`
    ALTER TABLE vendor_drafts
      ADD COLUMN IF NOT EXISTS part_number     TEXT,
      ADD COLUMN IF NOT EXISTS thread_id       TEXT,
      ADD COLUMN IF NOT EXISTS message_id      TEXT,
      ADD COLUMN IF NOT EXISTS rfc_message_id  TEXT,
      ADD COLUMN IF NOT EXISTS sent_at         TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reminded_at     TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS replied_at      TIMESTAMPTZ
  `);
  // Three-reminder tracking columns (24 h / 3 d / 7 d).
  await pool.query(`
    ALTER TABLE vendor_drafts
      ADD COLUMN IF NOT EXISTS reminder_count     INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS reminder_1_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reminder_2_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reminder_3_sent_at TIMESTAMPTZ
  `);
  // One-time migration: old records that already received the single reminder
  // via reminded_at should count as reminder_count = 1 so they are not
  // re-reminded and can still receive reminders 2 and 3 if still unanswered.
  await pool.query(`
    UPDATE vendor_drafts
    SET reminder_count = 1, reminder_1_sent_at = reminded_at
    WHERE reminded_at IS NOT NULL AND reminder_count = 0
  `);
  _draftsSchemaReady = true;
}

const CURRENCY_SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/**
 * Builds a clean, structured RFQ email: a real HTML table with explicit
 * "Your Unit Price / Currency / Lead Time / Remarks" columns left blank for
 * the vendor to fill in. The unique_code is embedded in the subject in
 * [CODE] form so the reply-matching pipeline can identify which inquiry a
 * vendor's reply belongs to, independent of Gmail thread_id.
 */
const SUPPORT_PHONE = "+91 8766360058";

function buildDraft(vendor, inquiryItems, uniqueCode, employee) {
  // vendor.brands is the list of brands this vendor is being contacted for —
  // a vendor covering multiple selected brands gets ONE combined draft instead
  // of one per brand, so the items table can mix rows from different brands.
  const vendorBrands = (vendor.brands?.length ? vendor.brands : [vendor.brand]).filter(Boolean);
  const brandSet = new Set(vendorBrands.map((b) => b.toLowerCase()));

  const brandItems = inquiryItems.filter((i) => brandSet.has((i.brand || "").toLowerCase()));
  const items = brandItems.length > 0 ? brandItems : inquiryItems;

  const partNumbers = items.map((i) => i.partNumber || i.part_no).filter(Boolean);
  const partNosForSubject = partNumbers.slice(0, 3).join(", ");
  const brandsForSubject = vendorBrands.join(", ") || "Parts";

  const subject = `RFQ [${uniqueCode}] – ${brandsForSubject} | ${partNosForSubject}`;

  const rows = items
    .map((item, idx) => {
      const realPartNumber = item.partNumber || item.part_no;
      // No formal SKU from the client — fall back to the item description so
      // the vendor always sees something identifiable in the Part Number
      // column, instead of leaving it blank while the description sits
      // hidden in the vendor's own Remarks column below.
      const partNumberCell = realPartNumber
        ? `<span style="font-weight:600;">${escapeHtml(realPartNumber)}</span>`
        : `<span style="font-style:italic;color:#64748B;">${escapeHtml(item.itemNotes || "—")}</span>`;

      // When a real part number exists, still surface the description (color,
      // rating, etc.) in its own column — it disambiguates near-identical SKUs.
      // When there's no part number, the description is already shown above
      // in the Part Number cell, so leave this blank to avoid repeating it.
      const descriptionCell = realPartNumber ? escapeHtml(item.itemNotes || "") : "";

      return `
      <tr>
        <td style="border:1px solid #D0DCF4;padding:10px;">${idx + 1}</td>
        <td style="border:1px solid #D0DCF4;padding:10px;">${partNumberCell}</td>
        <td style="border:1px solid #D0DCF4;padding:10px;">${escapeHtml(item.brand || "—")}</td>
        <td style="border:1px solid #D0DCF4;padding:10px;color:#475569;">${descriptionCell}</td>
        <td style="border:1px solid #D0DCF4;padding:10px;">${escapeHtml(item.quantity ?? "—")}</td>
        <td style="border:1px solid #D0DCF4;padding:10px;">${escapeHtml(item.uom || "—")}</td>
        <td style="border:1px solid #FDE68A;padding:10px;background:#FFFDF5;">&nbsp;</td>
        <td style="border:1px solid #FDE68A;padding:10px;background:#FFFDF5;">&nbsp;</td>
        <td style="border:1px solid #FDE68A;padding:10px;background:#FFFDF5;">&nbsp;</td>
        <td style="border:1px solid #FDE68A;padding:10px;background:#FFFDF5;">&nbsp;</td>
      </tr>`;
    })
    .join("");

  const headerCell = (label, fill) => `
    <th style="border:1px solid #D0DCF4;padding:10px;text-align:left;background:${fill ? "#FFFBEB" : "#EEF4FF"};color:${fill ? "#B45309" : "#4461A8"};font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">${label}</th>`;

  const p = (html) => `<p style="margin:0 0 16px 0;">${html}</p>`;

  const body = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.8;">
  ${p(`Dear ${escapeHtml(vendor.name || "")} Team,`)}
  ${p("Greetings from FIAPL!")}
  ${p(`We have a procurement requirement and request your best offer for the items below. Reference: <b>${escapeHtml(uniqueCode)}</b>`)}

  <table style="border-collapse:collapse;width:100%;margin:20px 0;font-size:13px;">
    <thead>
      <tr>
        ${headerCell("#")}
        ${headerCell("Part Number")}
        ${headerCell("Brand")}
        ${headerCell("Description")}
        ${headerCell("Qty")}
        ${headerCell("UOM")}
        ${headerCell("Your Unit Price", true)}
        ${headerCell("Currency", true)}
        ${headerCell("Lead Time", true)}
        ${headerCell("Remarks", true)}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  ${p("Kindly fill in the highlighted columns and reply with this same table.")}
  ${p(`For any queries, please feel free to call us at <b>${escapeHtml(employee?.phone || SUPPORT_PHONE)}</b>.`)}

  <p style="margin:0;">Warm regards,<br/>
  ${employee?.name ? `${escapeHtml(employee.name)}<br/>` : ""}FIAPL Procurement Team<br/>
  Fidus India Pvt. Ltd.</p>
</div>`.trim();

  return { subject, body, partNumbers: partNumbers.join(", "), brands: vendorBrands.join(", ") };
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
    const { unique_code, vendors, inquiry_items, employee_id } = await request.json();

    if (!unique_code || !vendors?.length) {
      return Response.json(
        { error: "unique_code and vendors are required" },
        { status: 400 }
      );
    }

    // Whoever's logged in generating these drafts — their own name/phone
    // replace the old hardcoded company number so vendors can reach the
    // actual person handling the inquiry. Falls back to the generic
    // company number/team sign-off if no employee_id was sent or the
    // employee hasn't set a phone yet.
    let employee = null;
    if (employee_id) {
      const empRes = await query(`SELECT name, phone FROM users WHERE id = $1`, [employee_id]);
      employee = empRes.rows[0] || null;
    }

    const created = [];
    for (const vendor of vendors) {
      const { subject, body, partNumbers, brands } = buildDraft(vendor, inquiry_items || [], unique_code, employee);
      const res = await query(
        `INSERT INTO vendor_drafts
           (inquiry_unique_code, vendor_name, vendor_email, brand, part_number, subject, body, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          unique_code,
          vendor.name,
          vendor.email,
          brands,
          partNumbers,
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

export async function DELETE(request) {
  try {
    const { draft_ids } = await request.json();
    if (!Array.isArray(draft_ids) || draft_ids.length === 0) {
      return Response.json({ error: "draft_ids array is required" }, { status: 400 });
    }
    await query(`DELETE FROM vendor_drafts WHERE id = ANY($1::int[])`, [draft_ids.map(Number)]);
    return Response.json({ success: true, deleted: draft_ids.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    await ensureDraftsSchema();
    const {
      id, subject, body, status, thread_id, message_id, rfc_message_id, sent_at, reminded_at, replied_at,
      reminder_count, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at,
    } = await request.json();
    if (!id) return Response.json({ error: "id required" }, { status: 400 });

    const fields = {
      subject, body, status, thread_id, message_id, rfc_message_id, sent_at, reminded_at, replied_at,
      reminder_count, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at,
    };
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) { setClauses.push(`${key} = $${idx++}`); values.push(value); }
    }
    if (setClauses.length === 0) {
      return Response.json({ error: "no fields to update" }, { status: 400 });
    }
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
