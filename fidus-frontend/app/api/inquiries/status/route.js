import { withTransaction } from "@/lib/db";

const VALID_STATUSES = new Set([
  "new",
  "assigned",
  "in_progress",
  "quoted",
  "converted",
  "lost",
  "dropped",
]);

export async function PATCH(request) {
  try {
    const payload = await request.json();
    const uniqueCode = payload.unique_code || payload.uniqueCode;
    const nextStatus = payload.status;
    const changedBy = payload.changed_by || payload.changedBy || null;

    if (!uniqueCode) {
      return Response.json({ error: "unique_code is required" }, { status: 400 });
    }

    if (!VALID_STATUSES.has(nextStatus)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    const result = await withTransaction(async (client) => {
      const current = await client.query(
        "SELECT id, unique_code, status FROM inquiries WHERE unique_code = $1",
        [uniqueCode]
      );

      if (current.rowCount === 0) {
        return null;
      }

      const inquiry = current.rows[0];
      const updated = await client.query(
        `
          UPDATE inquiries
          SET status = $1, updated_at = NOW()
          WHERE unique_code = $2
          RETURNING id, unique_code, status
        `,
        [nextStatus, uniqueCode]
      );

      if (inquiry.status !== nextStatus) {
        await client.query(
          `
            INSERT INTO inquiry_status_history (
              inquiry_id,
              old_status,
              new_status,
              changed_by
            )
            VALUES ($1, $2, $3, $4)
          `,
          [inquiry.id, inquiry.status, nextStatus, changedBy]
        );
      }

      await client.query("SELECT pg_notify('inquiries_changed', '')");
      return updated.rows[0];
    });

    if (!result) {
      return Response.json({ error: "Inquiry not found" }, { status: 404 });
    }

    return Response.json({ inquiry: result });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to update inquiry status" },
      { status: 500 }
    );
  }
}
