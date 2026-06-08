import { withTransaction } from "@/lib/db";
import { extractEmail, extractSenderName } from "@/lib/inquiry-normalizer";

export async function POST(request) {
  try {
    const payload = await request.json();
    const { message_id, thread_id, sender, subject, llm_summary, email_date } =
      payload;

    if (!message_id) {
      return Response.json({ error: "message_id is required" }, { status: 400 });
    }

    const senderEmail = extractEmail(sender || "");
    const senderName  = extractSenderName(sender || "", "");
    const receivedAt  = email_date ? new Date(email_date) : new Date();

    const result = await withTransaction(async (client) => {
      // Find the original inquiry by thread_id — look for a raw_email_item in
      // the same Gmail thread that already has an inquiry linked to it.
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
        if (match.rows.length > 0) {
          inquiryId = match.rows[0].id;
        }
      }

      // Upsert reminder — message_id is unique so re-processing is idempotent.
      const res = await client.query(
        `INSERT INTO inquiry_reminders
           (inquiry_id, thread_id, message_id, sender_email, sender_name,
            subject, llm_summary, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (message_id) DO UPDATE SET
           llm_summary = EXCLUDED.llm_summary,
           status      = inquiry_reminders.status
         RETURNING *`,
        [
          inquiryId,
          thread_id || null,
          message_id,
          senderEmail,
          senderName,
          subject || null,
          llm_summary || null,
          receivedAt,
        ]
      );

      return {
        reminderId: res.rows[0].id,
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
