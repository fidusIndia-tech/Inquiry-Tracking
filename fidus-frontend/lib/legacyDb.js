import pg from "pg";
const { Pool } = pg;

const globalForPg = globalThis;

export const legacyPool =
  globalForPg.legacyPgPool ||
  new Pool({
    connectionString: process.env.LEGACY_VENDORS_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.legacyPgPool = legacyPool;
}

export async function legacyQuery(sql, values = []) {
  if (!process.env.LEGACY_VENDORS_DB_URL) return { rows: [] };
  return legacyPool.query(sql, values);
}
