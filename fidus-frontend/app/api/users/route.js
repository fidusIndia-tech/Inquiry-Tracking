import { pool, query } from "@/lib/db";
import { hashPassword } from "@/lib/password";

let _schemaReady = false;
async function ensureUsersSchema() {
  if (_schemaReady) return;
  // users pre-existed this column — vendor drafts and client quotation
  // emails need each employee's own phone number (previously a single
  // hardcoded company number on every draft, no matter who sent it).
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`);
  _schemaReady = true;
}

export async function GET() {
  try {
    await ensureUsersSchema();
    const result = await query(`
      SELECT id, name, email, phone, role, is_active, created_at
      FROM users
      ORDER BY role, name
    `);

    return Response.json({ users: result.rows });
  } catch (error) {
    console.error("Failed to load users", error);
    return Response.json({ error: "Failed to load users" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await ensureUsersSchema();
    const payload = await request.json();
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const phone = String(payload.phone || "").trim();
    const password = String(payload.password || "").trim();
    const role = payload.role === "admin" ? "admin" : "employee";

    if (!name || !email || !password) {
      return Response.json({ error: "Name, email and password are required" }, { status: 400 });
    }

    const result = await query(
      `
        INSERT INTO users (name, email, phone, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4, $5, TRUE)
        RETURNING id, name, email, phone, role, is_active, created_at
      `,
      [name, email, phone || null, hashPassword(password), role]
    );

    return Response.json({ user: result.rows[0] }, { status: 201 });
  } catch (error) {
    if (error.code === "23505") {
      return Response.json({ error: "Email already exists" }, { status: 409 });
    }
    console.error("Failed to create user", error);
    return Response.json({ error: "Failed to create user" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    await ensureUsersSchema();
    const payload = await request.json();
    const id = Number(payload.id);

    if (!id) {
      return Response.json({ error: "User id is required" }, { status: 400 });
    }

    const name = payload.name === undefined ? null : String(payload.name || "").trim();
    const email = payload.email === undefined ? null : String(payload.email || "").trim().toLowerCase();
    const phone = payload.phone === undefined ? null : String(payload.phone || "").trim();
    const password = payload.password === undefined ? null : String(payload.password || "").trim();
    const isActive = payload.is_active;
    const role = payload.role === "admin" ? "admin" : payload.role === "employee" ? "employee" : null;

    const result = await query(
      `
        UPDATE users
        SET
          name = COALESCE(NULLIF($2, ''), name),
          email = COALESCE(NULLIF($3, ''), email),
          phone = COALESCE(NULLIF($4, ''), phone),
          password_hash = CASE WHEN $5 = '' THEN password_hash ELSE $5 END,
          role = COALESCE($6, role),
          is_active = COALESCE($7, is_active)
        WHERE id = $1
        RETURNING id, name, email, phone, role, is_active, created_at
      `,
      [id, name, email, phone, password ? hashPassword(password) : "", role, typeof isActive === "boolean" ? isActive : null]
    );

    if (!result.rows[0]) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    return Response.json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return Response.json({ error: "Email already exists" }, { status: 409 });
    }
    console.error("Failed to update user", error);
    return Response.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id } = await request.json();
    const userId = Number(id);

    if (!userId) {
      return Response.json({ error: "User id is required" }, { status: 400 });
    }

    await query("UPDATE inquiries SET assigned_to = NULL, assigned_at = NULL, status = 'new' WHERE assigned_to = $1", [userId]);

    const result = await query(
      `
        UPDATE users
        SET is_active = FALSE
        WHERE id = $1 AND role = 'employee'
        RETURNING id
      `,
      [userId]
    );

    if (!result.rows[0]) {
      return Response.json({ error: "Employee not found" }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove employee", error);
    return Response.json({ error: "Failed to remove employee" }, { status: 500 });
  }
}
