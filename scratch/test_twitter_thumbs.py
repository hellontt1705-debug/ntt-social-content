import sqlite3, requests

conn = sqlite3.connect('backend/social_content.db')
cur = conn.cursor()
cur.execute("SELECT id, thumbnail_url FROM videos WHERE platform = 'x' AND status != 'trashed' LIMIT 10")
rows = cur.fetchall()

success = 0
for vid, url in rows:
    if url:
        try:
            r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=4)
            if r.status_code == 200:
                success += 1
        except Exception:
            pass

print(f"Tested 10 Twitter thumbnails: {success}/10 succeeded!")
