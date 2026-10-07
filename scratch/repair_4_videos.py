import os, sys, asyncio, sqlite3, requests

if sys.platform == "win32":
    try: sys.stdout.reconfigure(encoding='utf-8')
    except: pass

BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BASE_DIR)

from services.downloader import scrape_video_metadata, THUMBNAILS_DIR
from services.db import get_connection, update_video

os.makedirs(THUMBNAILS_DIR, exist_ok=True)

async def repair_video_thumbnail(v):
    vid = v["id"]
    title = v["title"]
    source_url = v["source_url"]
    current_thumb = v["thumbnail_url"]
    
    print(f"\n[*] Processing [{vid}]: {title[:40]}...")
    target_path = os.path.join(THUMBNAILS_DIR, f"video_{vid}.jpg")
    
    # 1. Thử tải từ current_thumb trước
    if current_thumb:
        try:
            r = requests.get(current_thumb, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}, timeout=6)
            if r.status_code == 200 and len(r.content) > 1000:
                with open(target_path, "wb") as f:
                    f.write(r.content)
                update_video(vid, {"local_thumbnail": target_path})
                print(f"  [OK] Saved thumbnail directly from current URL ({len(r.content)} bytes)")
                return True
        except Exception as e:
            print(f"  [Direct failed]: {e}")
            
    # 2. Nếu current_thumb bị 403 hoặc hết hạn, re-scrape từ source_url
    if source_url:
        print(f"  [*] Re-scraping metadata from source: {source_url[:60]}...")
        try:
            meta = await scrape_video_metadata(source_url)
            new_thumb = meta.get("thumbnail_url")
            if new_thumb:
                r = requests.get(new_thumb, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}, timeout=8)
                if r.status_code == 200 and len(r.content) > 1000:
                    with open(target_path, "wb") as f:
                        f.write(r.content)
                    update_video(vid, {"thumbnail_url": new_thumb, "local_thumbnail": target_path})
                    print(f"  [OK] Successfully re-scraped and saved thumbnail ({len(r.content)} bytes)")
                    return True
                else:
                    print(f"  [Re-scrape download status]: {r.status_code}")
        except Exception as e:
            print(f"  [Re-scrape failed]: {e}")
            
    print(f"  [FAIL] Could not recover thumbnail for {vid}")
    return False

async def main():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, title, source_url, thumbnail_url, local_thumbnail FROM videos WHERE category_id = 'nh_c___cap_mukzahwg' AND status != 'trashed'")
    videos = [dict(r) for r in cur.fetchall()]
    print(f"Found {len(videos)} videos in Nhạc & Cap.")
    
    for v in videos:
        await repair_video_thumbnail(v)

asyncio.run(main())
