import { withTransaction } from "@/lib/db";

export async function POST() {
  try {
    const result = await withTransaction(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS employee_clients (
          id          SERIAL  PRIMARY KEY,
          employee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          client_name TEXT    NOT NULL,
          created_at  TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE (employee_id, client_name)
        )
      `);

      const mappings = await client.query(`
        SELECT ec.employee_id, LOWER(TRIM(ec.client_name)) AS key
        FROM   employee_clients ec
        JOIN   users u ON u.id = ec.employee_id AND u.is_active = true
      `);

      if (mappings.rowCount === 0) {
        return { assigned: 0, unmatched: 0, no_mappings: true };
      }

      const clientMap = {};
      for (const row of mappings.rows) {
        clientMap[row.key] = row.employee_id;
      }

      const unassigned = await client.query(`
        SELECT id, client_name FROM inquiries
        WHERE  status = 'new' AND assigned_to IS NULL AND client_name IS NOT NULL
      `);

      let assigned = 0;
      let unmatched = 0;

      for (const inq of unassigned.rows) {
        const key   = (inq.client_name || "").toLowerCase().trim();
        const empId = clientMap[key];

        if (empId) {
          await client.query(
            `UPDATE inquiries
             SET assigned_to       = $1,
                 assigned_at       = NOW(),
                 assigned_ref_name = NULL,
                 status            = 'assigned',
                 updated_at        = NOW()
             WHERE id = $2`,
            [empId, inq.id]
          );
          assigned++;
        } else {
          unmatched++;
        }
      }

      await client.query("SELECT pg_notify('inquiries_changed', '')");
      return { assigned, unmatched };
    });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message || "Auto-assign failed" }, { status: 500 });
  }
}
