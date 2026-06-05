import { query } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export async function GET() {
  try {
    const result = await query(`
      SELECT id, name, email, role, is_active, created_at
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
    const payload = await request.json();
    const name = String(payload.name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "").trim();
    const role = payload.role === "admin" ? "admin" : "employee";

    if (!name || !email || !password) {
      return Response.json({ error: "Name, email and password are required" }, { status: 400 });
    }

    const result = await query(
      `
        INSERT INTO users (name, email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        RETURNING id, name, email, role, is_active, created_at
      `,
      [name, email, hashPassword(password), role]
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
    const payload = await request.json();
    const id = Number(payload.id);

    if (!id) {
      return Response.json({ error: "User id is required" }, { status: 400 });
    }

    const name = payload.name === undefined ? null : String(payload.name || "").trim();
    const email = payload.email === undefined ? null : String(payload.email || "").trim().toLowerCase();
    const password = payload.password === undefined ? null : String(payload.password || "").trim();
    const isActive = payload.is_active;
    const role = payload.role === "admin" ? "admin" : payload.role === "employee" ? "employee" : null;

    const result = await query(
      `
        UPDATE users
        SET
          name = COALESCE(NULLIF($2, ''), name),
          email = COALESCE(NULLIF($3, ''), email),
          password_hash = CASE WHEN $4 = '' THEN password_hash ELSE $4 END,
          role = COALESCE($5, role),
          is_active = COALESCE($6, is_active)
        WHERE id = $1
        RETURNING id, name, email, role, is_active, created_at
      `,
      [id, name, email, password ? hashPassword(password) : "", role, typeof isActive === "boolean" ? isActive : null]
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
