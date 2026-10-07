import sqlite3
conn = sqlite3.connect('backend/social_content.db')
cur = conn.cursor()
cur.execute("SELECT platform, COUNT(*) FROM videos WHERE status != 'trashed' GROUP BY platform")
for r in cur.fetchall():
    print(r)
