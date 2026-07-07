/**
 * One-time cleanup: removes all rows from the `quotations` table.
 *
 * Usage (Railway console or local terminal):
 *   DATABASE_URL="postgres://..." CONFIRM_CLEAR_QUOTES=true node scripts/clear-demo-quotations.js
 *
 * Without CONFIRM_CLEAR_QUOTES=true it runs in dry-run mode — it prints what
 * would be deleted but does not touch the database.
 *
 * Safety:
 *  - Only touches the `quotations` table.
 *  - Does NOT delete inquiries, clients, vendors, drafts, or any other table.
 *  - The table has no external FK dependents (only a self-referential
 *    parent_quotation_id within the same table), so TRUNCATE is safe.
 *  - RESTART IDENTITY resets the PK sequence; quotation numbers are derived
 *    from inquiry_unique_code + sent-count, not from the PK, so this is safe.
 *  - Future quotation sends are unaffected: revision_number will start at 0
 *    again for each inquiry (first send → QTN-001, next → QTN-001-R1, …).
 */

"use strict";

const { Client } = require("pg");

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  const isDryRun = process.env.CONFIRM_CLEAR_QUOTES !== "true";

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to database.\n");

  // Show current state
  const countRes = await client.query("SELECT COUNT(*) AS cnt FROM quotations");
  const totalBefore = Number(countRes.rows[0].cnt);
  console.log(`Records in quotations table: ${totalBefore}`);

  if (totalBefore === 0) {
    console.log("Table is already empty. Nothing to do.");
    await client.end();
    return;
  }

  const listRes = await client.query(
    `SELECT id, quotation_number, inquiry_unique_code, salesperson,
            is_revision, status, grand_total, quoted_at
     FROM quotations
     ORDER BY id ASC`
  );

  console.log("\nRecords that will be deleted:\n");
  console.table(
    listRes.rows.map((r) => ({
      id: r.id,
      quotation_number: r.quotation_number,
      inquiry_unique_code: r.inquiry_unique_code,
      salesperson: r.salesperson || "—",
      is_revision: r.is_revision,
      status: r.status,
      grand_total: r.grand_total,
      quoted_at: r.quoted_at ? String(r.quoted_at).slice(0, 19) : "—",
    }))
  );

  if (isDryRun) {
    console.log(
      "\n[DRY RUN] No changes made.\n" +
        "To actually delete these records, re-run with:\n" +
        "  CONFIRM_CLEAR_QUOTES=true DATABASE_URL=... node scripts/clear-demo-quotations.js"
    );
    await client.end();
    return;
  }

  console.log("\nCONFIRM_CLEAR_QUOTES=true — proceeding with deletion...");
  await client.query("TRUNCATE TABLE quotations RESTART IDENTITY");

  const afterRes = await client.query("SELECT COUNT(*) AS cnt FROM quotations");
  const totalAfter = Number(afterRes.rows[0].cnt);
  console.log(`\nDone. Records remaining: ${totalAfter}`);

  if (totalAfter === 0) {
    console.log("All demo/test quotation records have been cleared.");
  } else {
    console.error(`WARNING: Expected 0 records but found ${totalAfter}. Check manually.`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
