import sys
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

sys.path.insert(0, os.path.abspath('backend'))

from services.db import get_videos, update_video
from services.imgbb_service import upload_to_imgbb

td = os.path.abspath('backend/downloads/thumbnails')
videos = get_videos(category_id='*', status='all')

print(f"=== BẮT ĐẦU DI CHUYỂN TOÀN BỘ THUMBNAIL LÊN IMGBB (TỔNG {len(videos)} VIDEO) ===")

items_to_upload = []
for v in videos:
    vid = v['id']
    thumb_url = v.get('thumbnail_url') or ''
    if 'ibb.co' in thumb_url:
        continue
    
    dfid = v.get('drive_file_id')
    local_path = None
    if dfid and os.path.exists(os.path.join(td, f'drive_{dfid}.jpg')):
        local_path = os.path.join(td, f'drive_{dfid}.jpg')
    elif os.path.exists(os.path.join(td, f'video_{vid}.jpg')):
        local_path = os.path.join(td, f'video_{vid}.jpg')
    
    if local_path and os.path.getsize(local_path) > 300:
        items_to_upload.append((vid, local_path))

print(f"Tìm thấy {len(items_to_upload)} video có thumbnail cục bộ cần đẩy lên ImgBB.")

success_count = 0
failed_count = 0

def _upload_worker(item):
    vid, path = item
    try:
        res = upload_to_imgbb(path, name=f"thumb_{vid}")
        if res and res.get("success"):
            img_url = res.get("display_url") or res.get("url")
            update_video(vid, {
                "thumbnail_url": img_url,
                "local_thumbnail": ""
            })
            return (vid, True, img_url)
        return (vid, False, "ImgBB returned failure")
    except Exception as e:
        return (vid, False, str(e))

start_time = time.time()
with ThreadPoolExecutor(max_workers=8) as executor:
    futures = [executor.submit(_upload_worker, it) for it in items_to_upload]
    for i, fut in enumerate(as_completed(futures), 1):
        vid, ok, result = fut.result()
        if ok:
            success_count += 1
        else:
            failed_count += 1
        if i % 25 == 0 or i == len(items_to_upload):
            elapsed = round(time.time() - start_time, 1)
            print(f"[{i}/{len(items_to_upload)}] Thành công: {success_count}, Thất bại: {failed_count} (thời gian: {elapsed}s)")

print(f"\n=== HOÀN TẤT: {success_count} THUMBNAIL ĐÃ LÊN IMGBB THÀNH CÔNG! ===")

# Dọn dẹp toàn bộ file trong thư mục thumbnails/
if success_count > 0:
    print("\nTiến hành dọn dẹp toàn bộ file trong backend/downloads/thumbnails/...")
    deleted_files = 0
    for f in os.listdir(td):
        fp = os.path.join(td, f)
        if os.path.isfile(fp) and not f.startswith(".gitkeep"):
            try:
                os.remove(fp)
                deleted_files += 1
            except Exception:
                pass
    print(f"-> Đã xóa sạch {deleted_files} file thumbnail trong máy tính (0 Byte ổ cứng!).")
