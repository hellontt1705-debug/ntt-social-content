import sqlite3
conn = sqlite3.connect('backend/social_content.db')
cur = conn.cursor()
cur.execute("SELECT * FROM settings WHERE key LIKE '%drive%'")
for r in cur.fetchall():
    print(r)
