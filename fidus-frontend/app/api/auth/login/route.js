import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

const LEGACY_PASSWORDS = {
  "admin@fidus.com": "admin123",
  "deepak@fidus.com": "123456",
  "rahul@fidus.com": "123456",
  "aman@fidus.com": "123456",
};

export async function POST(request) {
  try {
    const { email, password, role } = await request.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPassword = String(password || "").trim();

    if (!normalizedEmail || !normalizedPassword || !role) {
      return Response.json({ error: "Email, password and role are required" }, { status: 400 });
    }

    const result = await query(
      `
        SELECT id, name, email, password_hash, role, is_active
        FROM users
        WHERE lower(email) = $1 AND role = $2
        LIMIT 1
      `,
      [normalizedEmail, role]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const matches =
      verifyPassword(normalizedPassword, user.password_hash) ||
      (!user.password_hash && LEGACY_PASSWORDS[normalizedEmail] === normalizedPassword);

    if (!matches) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    return Response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login failed", error);
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}
