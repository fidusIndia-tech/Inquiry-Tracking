import { pool, query } from "@/lib/db";

let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS manual_vendors (
      id                  SERIAL PRIMARY KEY,
      inquiry_unique_code TEXT NOT NULL,
      name                TEXT NOT NULL,
      email               TEXT,
      phone               TEXT,
      brand               TEXT,
      notes               TEXT,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  _schemaReady = true;
}

export async function GET(request) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const uniqueCode = searchParams.get("unique_code");
    if (!uniqueCode) return Response.json({ vendors: [] });

    const result = await query(
      `SELECT * FROM manual_vendors WHERE inquiry_unique_code = $1 ORDER BY created_at ASC`,
      [uniqueCode]
    );
    return Response.json({ vendors: result.rows });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await ensureSchema();
    const { unique_code, name, email, phone, brand, notes } = await request.json();

    if (!unique_code || !name?.trim()) {
      return Response.json({ error: "unique_code and name are required" }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO manual_vendors (inquiry_unique_code, name, email, phone, brand, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [unique_code, name.trim(), email?.trim() || null, phone?.trim() || null, brand?.trim() || null, notes?.trim() || null]
    );

    return Response.json({ vendor: result.rows[0] }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    await ensureSchema();
    const { id } = await request.json();
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    await query(`DELETE FROM manual_vendors WHERE id = $1`, [id]);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
