import { pool, withTransaction } from "@/lib/db";

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  // These columns did not exist in the original inquiries table — additive
  // only, never drops or renames anything the GPT pipeline depends on.
  await pool.query(`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS company_name TEXT`);
  await pool.query(`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS phone TEXT`);
  await pool.query(`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS pr_number TEXT`);
  await pool.query(`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS source TEXT`);
  _schemaReady = true;
}

export async function POST(request) {
  try {
    await ensureSchema();
    const payload = await request.json();
    const {
      client_name,
      company_name,
      location,
      sender_name,
      sender_email,
      phone,
      subject,
      pr_number,
      notes,
      assigned_to,
      items = [],
      reminder_id,
    } = payload;

    // Basic validation
    if (!client_name?.trim() && !company_name?.trim()) {
      return Response.json({ error: "Client name or company name is required" }, { status: 400 });
    }
    if (!items.filter((i) => i.brand || i.part_number || i.description).length) {
      return Response.json({ error: "At least one item with brand, part number, or description is required" }, { status: 400 });
    }
    if (sender_email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender_email.trim())) {
      return Response.json({ error: "Sender email is not valid" }, { status: 400 });
    }

    const result = await withTransaction(async (client) => {
      const validItems = items.filter((i) => i.brand || i.part_number || i.description);
      const brands      = validItems.map((i) => i.brand        || "").join(",");
      const partNumbers = validItems.map((i) => i.part_number  || "").join(",");
      const quantities  = validItems.map((i) => String(i.quantity || "")).join(",");
      const senderField = sender_email?.trim()
        ? `${sender_name || ""} <${sender_email.trim()}>`
        : sender_name || "";

      // raw_email_items.id is the canonical counter for FIAPL codes —
      // both GPT and manual inquiries use the same table/sequence so
      // they all share one contiguous number line.
      const rawResult = await client.query(
        `INSERT INTO raw_email_items (
           message_id, username, location,
           brands, part_numbers, quantities, notes,
           sender, subject, processing_status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual')
         RETURNING id`,
        [
          `MANUAL_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          client_name || company_name || sender_name || "",
          location    || "",
          brands, partNumbers, quantities,
          notes        || "",
          senderField,
          subject      || "",
        ]
      );

      const rawId      = rawResult.rows[0].id;
      const uniqueCode = `FIAPL${String(rawId).padStart(7, "0")}`;

      // Validate the FK before inserting — if the userId from localStorage is
      // stale (employee removed + re-added, getting a new id) the INSERT would
      // fail with a FK violation and show a cryptic error. Silently fall back
      // to unassigned instead, so the inquiry is still created.
      let assignedToId = assigned_to ? Number(assigned_to) : null;
      if (assignedToId) {
        const userCheck = await client.query(
          `SELECT id FROM users WHERE id = $1 AND is_active = TRUE LIMIT 1`,
          [assignedToId]
        );
        if (!userCheck.rows[0]) assignedToId = null;
      }

      const inquiryResult = await client.query(
        `INSERT INTO inquiries (
           unique_code, raw_email_item_id,
           client_name, company_name, location,
           sender_name, sender_email, phone,
           subject, pr_number, notes, source,
           assigned_to, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'manual', $12, 'new')
         RETURNING *`,
        [
          uniqueCode, rawId,
          client_name  || "",
          company_name || "",
          location     || "",
          sender_name  || "",
          sender_email || "",
          phone        || "",
          subject      || "",
          pr_number    || "",
          notes        || "",
          assignedToId,
        ]
      );

      const inquiry = inquiryResult.rows[0];

      for (const item of validItems) {
        await client.query(
          `INSERT INTO inquiry_items (inquiry_id, brand, part_number, quantity, uom, item_notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            inquiry.id,
            item.brand       || null,
            item.part_number || null,
            item.quantity    ? Number(item.quantity) : null,
            item.uom         || null,
            item.description || item.notes || null,
          ]
        );
      }

      if (reminder_id) {
        await client.query(
          `UPDATE inquiry_reminders SET status = 'actioned' WHERE id = $1`,
          [reminder_id]
        );
      }

      return { inquiryId: inquiry.id, uniqueCode };
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to create manual inquiry" },
      { status: 500 }
    );
  }
}
