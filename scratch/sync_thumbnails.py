import sqlite3
import os
import shutil

conn = sqlite3.connect('backend/social_content.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()
rows = c.execute("SELECT id, drive_file_id FROM videos WHERE drive_file_id IS NOT NULL AND drive_file_id != ''").fetchall()
td = os.path.abspath('backend/downloads/thumbnails')
os.makedirs(td, exist_ok=True)

copied = 0
for r in rows:
    vid = r['id']
    dfid = r['drive_file_id']
    vid_path = os.path.join(td, f"video_{vid}.jpg")
    drive_path = os.path.join(td, f"drive_{dfid}.jpg")
    
    if os.path.exists(vid_path) and os.path.getsize(vid_path) > 500:
        if not os.path.exists(drive_path) or os.path.getsize(drive_path) < 500:
            shutil.copyfile(vid_path, drive_path)
            copied += 1

print(f"Successfully copied/linked {copied} local video thumbnails to drive thumbnail cache!")
