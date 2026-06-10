import { pool, withTransaction } from "@/lib/db";
import { extractEmail, extractSenderName } from "@/lib/inquiry-normalizer";

let _remindersSchemaReady = false;
async function ensureRemindersSchema() {
  if (_remindersSchemaReady) return;
  await pool.query(
    "ALTER TABLE inquiry_reminders ADD COLUMN IF NOT EXISTS line_items JSONB"
  );
  _remindersSchemaReady = true;
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const { message_id, thread_id, sender, subject, llm_summary, email_date, line_items } = payload;

    if (!message_id) {
      return Response.json({ error: "message_id is required" }, { status: 400 });
    }

    await ensureRemindersSchema();

    const senderEmail = extractEmail(sender || "");
    const senderName  = extractSenderName(sender || "", "");
    const receivedAt  = email_date ? new Date(email_date) : new Date();
    const lineItemsJson = line_items && line_items.length > 0
      ? JSON.stringify(line_items)
      : null;

    const result = await withTransaction(async (client) => {
      let inquiryId = null;
      if (thread_id) {
        const match = await client.query(
          `SELECT i.id
           FROM inquiries i
           JOIN raw_email_items r ON r.id = i.raw_email_item_id
           WHERE r.thread_id = $1
           ORDER BY i.created_at ASC
           LIMIT 1`,
          [thread_id]
        );
        if (match.rows.length > 0) inquiryId = match.rows[0].id;
      }

      const res = await client.query(
        `INSERT INTO inquiry_reminders
           (inquiry_id, thread_id, message_id, sender_email, sender_name,
            subject, llm_summary, received_at, line_items)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (message_id) DO UPDATE SET
           llm_summary = EXCLUDED.llm_summary,
           line_items  = EXCLUDED.line_items,
           status      = inquiry_reminders.status
         RETURNING *`,
        [inquiryId, thread_id || null, message_id, senderEmail, senderName,
         subject || null, llm_summary || null, receivedAt, lineItemsJson]
      );

      return {
        reminderId     : res.rows[0].id,
        inquiryId,
        linkedToInquiry: inquiryId !== null,
      };
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to store reminder" },
      { status: 500 }
    );
  }
}
