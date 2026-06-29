import { query } from "@/lib/db";

/**
 * Called by the Python Reminder Agent (beat task). Returns sent drafts that
 * are due for their next reminder (1st at 24 h, 2nd at 72 h, 3rd at 168 h
 * — all measured from the original sent_at) and have not yet replied.
 * Each reminder slot is independently idempotent: reminder_N_sent_at being
 * NULL is the only guard that prevents a duplicate send.
 */
export async function GET(request) {
  try {
    const result = await query(
      `SELECT * FROM vendor_drafts
       WHERE status = 'sent'
         AND sent_at IS NOT NULL
         AND replied_at IS NULL
         AND reminder_count < 3
         AND (
           (reminder_count = 0 AND sent_at < NOW() - INTERVAL '24 hours')
           OR (reminder_count = 1 AND sent_at < NOW() - INTERVAL '72 hours')
           OR (reminder_count = 2 AND sent_at < NOW() - INTERVAL '168 hours')
         )
       ORDER BY sent_at ASC`
    );
    return Response.json({ drafts: result.rows });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
