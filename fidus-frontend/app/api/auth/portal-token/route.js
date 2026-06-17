import crypto from "crypto";
import { query } from "@/lib/db";

const SSO_SECRET = process.env.SSO_SECRET || "";
const PORTAL_URL = (process.env.NEXT_PUBLIC_PORTAL_URL || "https://fidussource.com").replace(/\/$/, "");

function createSsoToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SSO_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export async function GET(request) {
  if (!SSO_SECRET) {
    return Response.json({ error: "SSO not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return Response.json({ error: "userId required" }, { status: 400 });
  }

  const result = await query(
    "SELECT id, name, email, role FROM users WHERE id = $1 AND is_active = TRUE",
    [userId]
  );

  if (!result.rows[0]) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const user = result.rows[0];
  const now = Math.floor(Date.now() / 1000);

  const token = createSsoToken({
    sub: user.email,
    email: user.email,
    role: user.role,
    name: user.name,
    product: "portal",
    type: "sso",
    iss: "inquiry-tracker",
    iat: now,
    exp: now + 60,
  });

  return Response.json({ redirect_url: `${PORTAL_URL}/sso?token=${token}` });
}
