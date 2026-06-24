import crypto from "crypto";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/password";

// HS256 secret shared with the FidusSource portal (portal's SSO_SECRET).
const SSO_SECRET = process.env.SSO_SECRET || "";

function b64urlToBuffer(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

// Verify a portal-issued HS256 JWT without pulling in a JWT dependency.
function verifySsoToken(token) {
  if (!SSO_SECRET) throw new Error("SSO_SECRET is not configured");
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [header, payload, signature] = parts;

  const expected = crypto
    .createHmac("sha256", SSO_SECRET)
    .update(`${header}.${payload}`)
    .digest();
  const actual = b64urlToBuffer(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error("Bad signature");
  }

  const claims = JSON.parse(b64urlToBuffer(payload).toString("utf8"));
  if (claims.type !== "sso") throw new Error("Not an SSO token");
  if (claims.exp && Date.now() / 1000 > claims.exp) throw new Error("Token expired");
  return claims;
}

// GET handler for the FidusSource portal's redirect-mode bootstrap flow.
// portal route.ts sends the browser to /proxy/api/auth/sso?token=<portalJwt>;
// this redirects to the /sso page which completes the hand-off client-side.
export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return Response.json({ error: "Missing token" }, { status: 400 });
  // Redirect to root-relative /sso so the FidusSource proxy's Location rewriter
  // prepends the correct proxy prefix (avoiding double-basePath in the URL).
  return Response.redirect(
    new URL(`/sso?token=${encodeURIComponent(token)}`, request.url),
    302
  );
}

export async function POST(request) {
  try {
    const { token } = await request.json();

    let claims;
    try {
      claims = verifySsoToken(token);
    } catch {
      return Response.json({ error: "Invalid or expired SSO token" }, { status: 401 });
    }

    const email = String(claims.email || "").trim().toLowerCase();
    if (!email) {
      return Response.json({ error: "SSO token is missing an email" }, { status: 400 });
    }
    const name = claims.name || claims.sub || email.split("@")[0];
    const role = claims.role === "admin" ? "admin" : "employee";

    // Upsert by email (select-first so we don't depend on a unique constraint),
    // syncing the tier from the portal. Login happens at the portal, so the
    // local password is a throwaway.
    const existing = await query("SELECT id FROM users WHERE LOWER(email) = $1", [email]);
    let user;
    if (existing.rows[0]) {
      const updated = await query(
        "UPDATE users SET role = $1, is_active = TRUE WHERE id = $2 RETURNING id, name, email, role",
        [role, existing.rows[0].id]
      );
      user = updated.rows[0];
    } else {
      const inserted = await query(
        `INSERT INTO users (name, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id, name, email, role`,
        [name, email, hashPassword(crypto.randomBytes(24).toString("hex")), role]
      );
      user = inserted.rows[0];
    }

    return Response.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error("SSO failed", error);
    return Response.json({ error: "SSO failed" }, { status: 500 });
  }
}
