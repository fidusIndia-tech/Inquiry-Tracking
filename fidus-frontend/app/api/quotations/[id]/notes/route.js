import { pool, query } from "@/lib/db";

let _notesSchemaReady = false;
async function ensureNotesSchema() {
  if (_notesSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotation_notes (
      id              SERIAL      PRIMARY KEY,
      quotation_id    INT         NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      note_text       TEXT        NOT NULL,
      created_by      TEXT,
      created_by_role TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  _notesSchemaReady = true;
}

export async function GET(request, { params }) {
  try {
    await ensureNotesSchema();
    const { id } = await params;
    const result = await query(
      `SELECT * FROM quotation_notes WHERE quotation_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    return Response.json({ notes: result.rows });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    await ensureNotesSchema();
    const { id } = await params;
    const { note_text, created_by, created_by_role } = await request.json();

    if (!note_text?.trim()) {
      return Response.json({ error: "note_text is required" }, { status: 400 });
    }

    // Confirm the quotation exists before inserting
    const check = await query(`SELECT id FROM quotations WHERE id = $1`, [id]);
    if (!check.rows[0]) {
      return Response.json({ error: "Quotation not found" }, { status: 404 });
    }

    const result = await query(
      `INSERT INTO quotation_notes (quotation_id, note_text, created_by, created_by_role)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, note_text.trim(), created_by || "Admin", created_by_role || "admin"]
    );
    return Response.json({ note: result.rows[0] }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await ensureNotesSchema();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get("noteId");
    if (!noteId) {
      return Response.json({ error: "noteId query param required" }, { status: 400 });
    }
    await query(
      `DELETE FROM quotation_notes WHERE id = $1 AND quotation_id = $2`,
      [noteId, id]
    );
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
