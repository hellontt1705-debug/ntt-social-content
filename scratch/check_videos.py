import os
import sys
import sqlite3
import json

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", "social_content.db")
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT id, name FROM categories WHERE name LIKE '%Nhạc%'")
cats = [dict(r) for r in cur.fetchall()]
print("Categories:", cats)

cat_ids = [c["id"] for c in cats]
if cat_ids:
    placeholders = ",".join(["?"] * len(cat_ids))
    cur.execute(f"SELECT id, title, uploader, platform, category_id, thumbnail_url, local_thumbnail, file_path, media_type, drive_file_id FROM videos WHERE category_id IN ({placeholders}) AND status != 'trashed'", cat_ids)
    rows = [dict(r) for r in cur.fetchall()]
    print("Videos in category:")
    print(json.dumps(rows, indent=2, ensure_ascii=False))
