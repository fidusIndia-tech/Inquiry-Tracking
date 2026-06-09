import { withTransaction } from "@/lib/db";

export async function POST(request) {
  try {
    const payload = await request.json();
    const { client_name, location, sender_name, sender_email, subject, notes, items = [], reminder_id } = payload;

    const result = await withTransaction(async (client) => {
      const brands      = items.map((i) => i.brand        || "").join(",");
      const partNumbers = items.map((i) => i.part_number  || "").join(",");
      const quantities  = items.map((i) => String(i.quantity || "")).join(",");
      const senderField = sender_email
        ? `${sender_name || ""} <${sender_email}>`
        : sender_name || "";

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
          client_name || sender_name || "",
          location    || "",
          brands, partNumbers, quantities,
          notes        || "",
          senderField,
          subject      || "",
        ]
      );

      const rawId      = rawResult.rows[0].id;
      const uniqueCode = `FIAPL${String(rawId).padStart(7, "0")}`;

      const inquiryResult = await client.query(
        `INSERT INTO inquiries (
           unique_code, raw_email_item_id, client_name, location,
           sender_name, sender_email, subject, notes, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new')
         RETURNING *`,
        [uniqueCode, rawId, client_name || "", location || "",
         sender_name || "", sender_email || "", subject || "", notes || ""]
      );

      const inquiry = inquiryResult.rows[0];

      for (const item of items) {
        if (!item.brand && !item.part_number) continue;
        await client.query(
          `INSERT INTO inquiry_items (inquiry_id, brand, part_number, quantity, item_notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [inquiry.id, item.brand || null, item.part_number || null,
           item.quantity ? Number(item.quantity) : null, item.notes || null]
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
