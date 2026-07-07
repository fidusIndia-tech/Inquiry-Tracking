import psycopg2, psycopg2.extras

DB = 'postgresql://postgres:OnuntlCtyuoeyEvJdNxfsGVqtSIMmEgT@acela.proxy.rlwy.net:37132/railway'
conn = psycopg2.connect(DB, connect_timeout=15)
cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# 1. Tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_name")
print('TABLES:', [r['table_name'] for r in cur.fetchall()])

# 2. raw_email_items
cur.execute("SELECT COUNT(*) AS cnt FROM raw_email_items")
print('\nraw_email_items count:', cur.fetchone()['cnt'])

cur.execute("SELECT id, message_id, sender, subject, processing_status, imported_at FROM raw_email_items ORDER BY id DESC LIMIT 20")
for r in cur.fetchall():
    print(f"  RAW {r['id']} | {str(r['subject'])[:55]} | {str(r['sender'])[:35]} | {r['processing_status']}")

# 3. inquiries
cur.execute("SELECT COUNT(*) AS cnt FROM inquiries")
print('\ninquiries count:', cur.fetchone()['cnt'])

cur.execute("SELECT id, unique_code, client_name, sender_email, subject, status, email_date FROM inquiries ORDER BY id DESC LIMIT 20")
for r in cur.fetchall():
    print(f"  INQ {r['id']} | {r['unique_code']} | {str(r['subject'])[:45]} | {str(r['sender_email'])[:30]}")

# 4. Duplicates by sender + cleaned subject
cur.execute("""
    SELECT sender_email,
           regexp_replace(lower(subject), '^(re:|fwd:|fw:)\s*', '', 'gi') AS clean_subj,
           COUNT(*) AS cnt,
           array_agg(unique_code ORDER BY id) AS codes
    FROM inquiries
    GROUP BY sender_email, clean_subj
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 10
""")
dups = cur.fetchall()
print('\nDUPLICATE GROUPS:', len(dups))
for d in dups:
    print(f"  {d['cnt']}x | {d['sender_email']} | {str(d['clean_subj'])[:50]} | {d['codes']}")

# 5. inquiry_items count
cur.execute("SELECT COUNT(*) AS cnt FROM inquiry_items")
print('\ninquiry_items count:', cur.fetchone()['cnt'])

# 6. Show items for duplicate inquiry groups (first dup group)
if dups:
    top = dups[0]
    codes = top['codes'][:5]
    cur.execute("SELECT i.unique_code, ii.brand, ii.part_number, ii.quantity FROM inquiries i JOIN inquiry_items ii ON ii.inquiry_id = i.id WHERE i.unique_code = ANY(%s) ORDER BY i.id", (codes,))
    print(f"\nItems inside top duplicate group ({top['cnt']}x same RFQ):")
    for r in cur.fetchall():
        print(f"  {r['unique_code']} | {r['brand']} | {r['part_number']} | qty {r['quantity']}")

cur.close()
conn.close()
print('\nDone.')
