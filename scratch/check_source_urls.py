import os, sys, sqlite3, json
if sys.platform == "win32":
    try: sys.stdout.reconfigure(encoding='utf-8')
    except: pass

db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", "social_content.db")
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT id, title, source_url, drive_file_id, drive_web_link, file_path, local_thumbnail FROM videos WHERE id IN ('349a8f14', '354a201f', '944b25f1', '6b960922')")
for r in cur.fetchall():
    print(dict(r))
