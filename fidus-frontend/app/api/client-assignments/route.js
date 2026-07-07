import { query } from "@/lib/db";

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS employee_clients (
    id          SERIAL  PRIMARY KEY,
    employee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    client_name TEXT    NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (employee_id, client_name)
  )
`;

export async function GET() {
  try {
    await query(ENSURE_TABLE);
    const [assignments, clientNames] = await Promise.all([
      query(`
        SELECT ec.id, ec.employee_id, ec.client_name, u.name AS employee_name
        FROM   employee_clients ec
        JOIN   users u ON u.id = ec.employee_id
        ORDER  BY u.name, ec.client_name
      `),
      query(`
        SELECT DISTINCT TRIM(client_name) AS client_name
        FROM   inquiries
        WHERE  client_name IS NOT NULL AND TRIM(client_name) <> ''
        ORDER  BY 1
      `),
    ]);
    return Response.json({
      assignments: assignments.rows,
      clientNames: clientNames.rows.map((r) => r.client_name),
    });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await query(ENSURE_TABLE);
    const { employee_id, client_name } = await request.json();
    if (!employee_id || !client_name?.trim()) {
      return Response.json({ error: "employee_id and client_name are required" }, { status: 400 });
    }
    const result = await query(
      `INSERT INTO employee_clients (employee_id, client_name)
       VALUES ($1, $2)
       ON CONFLICT (employee_id, client_name) DO NOTHING
       RETURNING id, employee_id, client_name`,
      [employee_id, client_name.trim()]
    );
    return Response.json({ assignment: result.rows[0] || null });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to add" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id } = await request.json();
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    await query("DELETE FROM employee_clients WHERE id = $1", [id]);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to delete" }, { status: 500 });
  }
}
