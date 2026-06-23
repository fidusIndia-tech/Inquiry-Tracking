import { query } from "@/lib/db";

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS blocked_clients (
    id            SERIAL  PRIMARY KEY,
    sender_email  TEXT    NOT NULL UNIQUE,
    client_name   TEXT,
    reason        TEXT,
    blocked_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )
`;

export async function GET() {
  try {
    await query(ENSURE_TABLE);
    const result = await query(`
      SELECT bc.id, bc.sender_email, bc.client_name, bc.reason, bc.created_at,
             u.name AS blocked_by_name
      FROM   blocked_clients bc
      LEFT   JOIN users u ON u.id = bc.blocked_by
      ORDER  BY bc.created_at DESC
    `);
    return Response.json({ blocked: result.rows });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await query(ENSURE_TABLE);
    const { sender_email, client_name, reason, blocked_by } = await request.json();
    const email = sender_email?.trim().toLowerCase();
    if (!email) {
      return Response.json({ error: "sender_email is required" }, { status: 400 });
    }
    const result = await query(
      `INSERT INTO blocked_clients (sender_email, client_name, reason, blocked_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sender_email) DO UPDATE
         SET client_name = EXCLUDED.client_name, reason = EXCLUDED.reason
       RETURNING id, sender_email, client_name, reason, created_at`,
      [email, client_name?.trim() || null, reason?.trim() || null, blocked_by || null]
    );
    return Response.json({ blocked: result.rows[0] || null });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to block client" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id, sender_email } = await request.json();
    if (!id && !sender_email) {
      return Response.json({ error: "id or sender_email is required" }, { status: 400 });
    }
    if (id) {
      await query("DELETE FROM blocked_clients WHERE id = $1", [id]);
    } else {
      await query("DELETE FROM blocked_clients WHERE sender_email = $1", [sender_email.trim().toLowerCase()]);
    }
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to unblock" }, { status: 500 });
  }
}
