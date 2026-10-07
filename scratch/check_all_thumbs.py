import os, sys, sqlite3
if sys.platform == "win32":
    try: sys.stdout.reconfigure(encoding='utf-8')
    except: pass

db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", "social_content.db")
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT id, title, platform, local_thumbnail, thumbnail_url, source_url, status FROM videos WHERE status != 'trashed'")
all_videos = cur.fetchall()

missing_local = 0
has_local_file = 0
for v in all_videos:
    lt = v["local_thumbnail"]
    if lt and os.path.exists(lt):
        has_local_file += 1
    else:
        missing_local += 1

print(f"Total active videos: {len(all_videos)}")
print(f"Videos with existing local thumbnail file: {has_local_file}")
print(f"Videos with missing/empty local thumbnail: {missing_local}")
