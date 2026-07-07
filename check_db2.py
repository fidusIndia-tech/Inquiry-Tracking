import psycopg2, psycopg2.extras

DB = 'postgresql://postgres:OnuntlCtyuoeyEvJdNxfsGVqtSIMmEgT@acela.proxy.rlwy.net:37132/railway'
conn = psycopg2.connect(DB, connect_timeout=15)
cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# 1. Schema of extra tables not in schema.sql
for tbl in ('extracted_mail_items', 'gmail_users', 'rfq_items', 'employee_clients'):
    cur.execute("""
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = %s ORDER BY ordinal_position
    """, (tbl,))
    cols = cur.fetchall()
    print(f"\n--- {tbl} SCHEMA ---")
    for c in cols:
        print(f"  {c['column_name']:30} {c['data_type']}")
    cur.execute(f"SELECT COUNT(*) AS cnt FROM {tbl}")
    print(f"  ROW COUNT: {cur.fetchone()['cnt']}")

# 2. Sanjeev Kumar full history - the duplicate case
print("\n\n--- SANJEEV KUMAR FULL INQUIRY HISTORY ---")
cur.execute("""
    SELECT i.id, i.unique_code, i.subject, i.status, i.email_date, i.created_at,
           r.message_id
    FROM inquiries i
    JOIN raw_email_items r ON r.id = i.raw_email_item_id
    WHERE i.sender_email ILIKE '%shrirampistons%'
    ORDER BY i.id
""")
for r in cur.fetchall():
    print(f"  {r['unique_code']} | {r['subject'][:50]} | {r['status']} | msg_id: {r['message_id'][:20] if r['message_id'] else 'NULL'}")

# 3. Entries that look like reminders/RE:/Fwd: - all RE: and Fwd: entries
print("\n\n--- ALL RE:/FWD: ENTRIES IN INQUIRIES ---")
cur.execute("""
    SELECT i.id, i.unique_code, i.sender_email, i.subject, i.status, i.email_date
    FROM inquiries i
    WHERE i.subject ILIKE 're:%' OR i.subject ILIKE 'fwd:%' OR i.subject ILIKE 'fw:%'
    ORDER BY i.id
""")
for r in cur.fetchall():
    print(f"  {r['unique_code']} | {str(r['subject'])[:55]} | {r['sender_email'][:35]} | {r['status']}")

# 4. Check PR 11582330057 - looked like it had RE: FW: duplicates
print("\n\n--- PR 11582330057 entries ---")
cur.execute("""
    SELECT i.unique_code, i.sender_email, i.subject, r.message_id
    FROM inquiries i
    JOIN raw_email_items r ON r.id = i.raw_email_item_id
    WHERE i.subject ILIKE '%11582330057%'
    ORDER BY i.id
""")
for r in cur.fetchall():
    print(f"  {r['unique_code']} | {r['subject'][:55]} | {r['sender_email'][:35]} | {r['message_id'][:20] if r['message_id'] else ''}")

# 5. Delivery Reminder entry - clearly not a new RFQ
print("\n\n--- DELIVERY REMINDER entry (should NOT be an inquiry) ---")
cur.execute("""
    SELECT i.id, i.unique_code, i.sender_email, i.subject, i.notes, r.brands, r.part_numbers
    FROM inquiries i
    JOIN raw_email_items r ON r.id = i.raw_email_item_id
    WHERE i.subject ILIKE '%reminder%'
""")
for r in cur.fetchall():
    print(f"  {r['unique_code']} | {r['subject'][:60]}")
    print(f"  brands: {r['brands']}")
    print(f"  parts:  {r['part_numbers']}")
    print(f"  notes:  {str(r['notes'])[:120]}")

# 6. Same sender multiple inquiries (beyond the sanjeev duplicate)
print("\n\n--- SENDERS WITH MULTIPLE INQUIRIES ---")
cur.execute("""
    SELECT sender_email, COUNT(*) AS cnt, array_agg(unique_code ORDER BY id) AS codes
    FROM inquiries
    GROUP BY sender_email
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
""")
for r in cur.fetchall():
    print(f"  {r['cnt']}x | {r['sender_email']:40} | {r['codes']}")

cur.close()
conn.close()
print('\nDone.')
