import { withTransaction } from "@/lib/db";

export async function PATCH(request) {
  try {
    await withTransaction(async (client) => {
      await client.query("ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ");
    });

    const payload = await request.json();
    const uniqueCode = payload.unique_code || payload.uniqueCode;
    const assignedTo = payload.assigned_to || payload.assignedTo || null;
    const refName    = payload.ref_name    || null;

    if (!uniqueCode) {
      return Response.json({ error: "unique_code is required" }, { status: 400 });
    }

    const result = await withTransaction(async (client) => {
      const updated = await client.query(
        `
          UPDATE inquiries
          SET
            assigned_to      = $1,
            assigned_ref_name = $3,
            assigned_at = CASE
              WHEN $1::BIGINT IS NULL THEN NULL
              WHEN assigned_to IS DISTINCT FROM $1::BIGINT THEN NOW()
              WHEN assigned_at IS NULL THEN NOW()
              ELSE assigned_at
            END,
            status = CASE
              WHEN $1::BIGINT IS NULL THEN 'new'
              WHEN status = 'new' THEN 'assigned'
              ELSE status
            END,
            updated_at = NOW()
          WHERE unique_code = $2
          RETURNING id, unique_code, assigned_to, assigned_at, assigned_ref_name, status
        `,
        [assignedTo, uniqueCode, refName]
      );

      if (updated.rowCount === 0) {
        return null;
      }

      const inquiry = updated.rows[0];
      const userResult = inquiry.assigned_to
        ? await client.query(
            "SELECT id, name, email FROM users WHERE id = $1",
            [inquiry.assigned_to]
          )
        : { rows: [] };

      await client.query("SELECT pg_notify('inquiries_changed', '')");

      return {
        ...inquiry,
        assigned_to_name: userResult.rows[0]?.name || null,
      };
    });

    if (!result) {
      return Response.json({ error: "Inquiry not found" }, { status: 404 });
    }

    return Response.json({ inquiry: result });
  } catch (error) {
    return Response.json(
      { error: error.message || "Failed to assign inquiry" },
      { status: 500 }
    );
  }
}
