import sqlite3
import os
import json

conn = sqlite3.connect('backend/social_content.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()
rows = [dict(r) for r in c.execute('SELECT id, platform, file_path, local_thumbnail, thumbnail_url, drive_file_id FROM videos ORDER BY created_at DESC LIMIT 14').fetchall()]
td = os.path.abspath('backend/downloads/thumbnails')
dd = os.path.abspath('backend/downloads')

results = []
for r in rows:
    vid = r['id']
    dfid = r['drive_file_id']
    fp = r['file_path']
    lt = r['local_thumbnail']
    
    video_thumb_file = os.path.join(td, f"video_{vid}.jpg")
    drive_thumb_file = os.path.join(td, f"drive_{dfid}.jpg") if dfid else ""
    
    results.append({
        'id': vid,
        'has_drive_id': bool(dfid),
        'file_path_exists': os.path.exists(fp) if fp else False,
        'file_size': os.path.getsize(fp) if (fp and os.path.exists(fp)) else 0,
        'video_thumb_exists': os.path.exists(video_thumb_file),
        'video_thumb_size': os.path.getsize(video_thumb_file) if os.path.exists(video_thumb_file) else 0,
        'drive_thumb_exists': os.path.exists(drive_thumb_file) if drive_thumb_file else False,
        'drive_thumb_size': os.path.getsize(drive_thumb_file) if (drive_thumb_file and os.path.exists(drive_thumb_file)) else 0,
        'local_thumb_col': lt,
        'thumbnail_url': (r['thumbnail_url'] or '')[:60]
    })

print(json.dumps(results, indent=2))
