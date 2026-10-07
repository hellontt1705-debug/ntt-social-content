import sys
import os
import sqlite3

# Add backend to path
sys.path.insert(0, os.path.abspath('backend'))

from services.db import get_connection, update_video, get_video_by_id, get_videos
from services.drive_service import sync_video_to_drive
from main import _remove_local_media_files, DOWNLOADS_DIR, THUMBNAILS_DIR

print("=== BẮT ĐẦU ĐỒNG BỘ 100% THUẦN CLOUD VÀ DỌN DẸP Ổ CỨNG ===")

# 1. Cập nhật video 7c74d731 đã upload thành công trước đó
print("\n1. Cập nhật video 7c74d731 (đã tải lên Drive)...")
v_7c = get_video_by_id('7c74d731')
if v_7c and not v_7c.get('drive_file_id'):
    update_video('7c74d731', {
        'drive_file_id': '1xl7-3wYw3ljGaXh14j2aytfmHNUArsvy',
        'drive_web_link': 'https://drive.google.com/file/d/1xl7-3wYw3ljGaXh14j2aytfmHNUArsvy/view?usp=drivesdk',
        'drive_synced': 1,
        'file_path': ''
    })
    _remove_local_media_files(v_7c, keep_thumbnails=True)
    print("   -> Đã cập nhật 7c74d731 thành công!")

# 2. Xử lý video rác 0-byte c202e403
print("\n2. Xử lý video rác c202e403 (0 bytes)...")
zero_byte_file = os.path.join(DOWNLOADS_DIR, "video_c202e403.mp4")
if os.path.exists(zero_byte_file) and os.path.getsize(zero_byte_file) == 0:
    os.remove(zero_byte_file)
    update_video('c202e403', {'file_path': ''})
    print("   -> Đã xóa file 0-byte video_c202e403.mp4.")

# 3. Đồng bộ 5 video còn lại lên Google Drive
unsynced_ids = ['198678c3', '682d2579', 'aab36675', 'aed4ab23', '03c4abeb']
print(f"\n3. Đồng bộ {len(unsynced_ids)} video chưa lên Drive...")
for vid in unsynced_ids:
    v = get_video_by_id(vid)
    if not v:
        continue
    fp = v.get('file_path')
    if not fp or not os.path.exists(fp):
        # Kiểm tra file trong downloads
        for ext in ['.mp4', '.jpg', '.webm']:
            chk = os.path.join(DOWNLOADS_DIR, f"video_{vid}{ext}")
            if os.path.exists(chk) and os.path.getsize(chk) > 0:
                fp = chk
                v['file_path'] = chk
                break
    
    if not fp or not os.path.exists(fp):
        print(f"   [Bỏ qua] Video {vid}: Không tìm thấy file cục bộ.")
        continue

    print(f"   -> Đang tải video {vid} lên Google Drive...")
    try:
        res = sync_video_to_drive(v)
        if res.get('success') and res.get('drive_file_id'):
            drive_fid = res.get('drive_file_id')
            _remove_local_media_files(v, keep_thumbnails=True)
            update_video(vid, {
                'drive_file_id': drive_fid,
                'drive_web_link': res.get('drive_web_link', f"https://drive.google.com/file/d/{drive_fid}/view?usp=drivesdk"),
                'drive_synced': 1,
                'file_path': '',
                'thumbnail_url': f"/api/drive/thumbnail/{drive_fid}" if not v.get('media_type') == 'image' else f"https://lh3.googleusercontent.com/d/{drive_fid}"
            })
            print(f"   [OK] Video {vid} -> Drive ID: {drive_fid}")
        else:
            print(f"   [Lỗi] Video {vid}: {res.get('message')}")
    except Exception as e:
        print(f"   [Thất bại] Video {vid}: {e}")

# 4. Xóa toàn bộ file local của các video đã đồng bộ lên Drive
print("\n4. Dọn dẹp file local của các video đã có trên Drive...")
all_videos = get_videos(category_id="*", status="all")
cleaned = 0
for v in all_videos:
    if v.get('drive_synced') == 1 and v.get('drive_file_id'):
        sz = _remove_local_media_files(v, keep_thumbnails=True)
        if sz > 0 or v.get('file_path'):
            update_video(v['id'], {'file_path': ''})
            cleaned += 1

print(f"   -> Đã dọn dẹp và làm sạch DB cho {cleaned} video đã có trên Drive.")

# 5. Quét sạch thư mục downloads/ (xóa mọi file mp4, jpg, webm thừa)
print("\n5. Quét sạch thư mục backend/downloads/...")
leftover_files = [f for f in os.listdir(DOWNLOADS_DIR) if os.path.isfile(os.path.join(DOWNLOADS_DIR, f))]
for f in leftover_files:
    fp = os.path.join(DOWNLOADS_DIR, f)
    try:
        os.remove(fp)
        print(f"   -> Đã xóa file thừa: {f}")
    except Exception as e:
        print(f"   -> Không xóa được {f}: {e}")

print("\n=== HOÀN TẤT ĐỒNG BỘ VÀ LÀM SẠCH 100% THUẦN CLOUD ===")
