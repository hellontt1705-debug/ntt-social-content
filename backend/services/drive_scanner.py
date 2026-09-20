import re
import os
import json
import time
import asyncio
import urllib.parse
from typing import Dict, Any, List, Optional
import requests

from services.db import get_connection, get_setting

DRIVE_GAS_URL_KEY = "drive_gas_url"
DRIVE_API_CREDS_KEY = "drive_api_credentials_json"

_gas_session = requests.Session()
_gas_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SocialContentOS/2.0",
    "Accept": "application/json"
})

_DRIVE_SCAN_CACHE: Dict[str, Any] = {}
_CACHE_TTL = 45  # 45 giây cache cho các lần quét lặp lại siêu tốc

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    GOOGLE_API_AVAILABLE = True
except ImportError:
    GOOGLE_API_AVAILABLE = False


def extract_drive_id_and_type(url: str) -> Dict[str, Any]:
    """
    Phân tích URL Google Drive để lấy ID và loại (folder hay file)
    Hỗ trợ:
    - https://drive.google.com/drive/folders/1OMPdXaZ4Fh8ps6wQ-0PR9p9fz1IELn5S
    - https://drive.google.com/drive/u/0/folders/1OMPdXaZ4Fh8ps6wQ-0PR9p9fz1IELn5S
    - https://drive.google.com/file/d/1XyZ.../view
    - https://docs.google.com/document/d/1XyZ.../edit
    - https://drive.google.com/open?id=1OMPdXaZ...
    """
    clean_url = url.strip()
    
    # 1. Folder match
    folder_match = re.search(r'folders/([a-zA-Z0-9_-]+)', clean_url)
    if folder_match:
        return {
            "id": folder_match.group(1),
            "is_folder": True,
            "type": "folder",
            "clean_url": clean_url
        }

    # 2. File / Document match
    file_match = re.search(r'(?:file/d/|document/d/|spreadsheets/d/)([a-zA-Z0-9_-]+)', clean_url)
    if file_match:
        return {
            "id": file_match.group(1),
            "is_folder": False,
            "type": "file",
            "clean_url": clean_url
        }

    # 3. Query param id=
    parsed = urllib.parse.urlparse(clean_url)
    query_params = urllib.parse.parse_qs(parsed.query)
    if "id" in query_params:
        target_id = query_params["id"][0]
        is_folder = "folder" in clean_url.lower()
        return {
            "id": target_id,
            "is_folder": is_folder,
            "type": "folder" if is_folder else "file",
            "clean_url": clean_url
        }

    # 4. Fallback: Nếu người dùng nhập trực tiếp ID
    if re.match(r'^[a-zA-Z0-9_-]{20,}$', clean_url):
        return {
            "id": clean_url,
            "is_folder": True,
            "type": "folder",
            "clean_url": clean_url
        }

    return {
        "id": "",
        "is_folder": False,
        "type": "unknown",
        "clean_url": clean_url
    }


def extract_social_urls_from_text(text: str) -> List[str]:
    """
    Bóc tách toàn bộ URL video mạng xã hội từ văn bản (hỗ trợ TikTok, Douyin, YouTube, Reels, X, etc.)
    """
    if not text:
        return []
    
    # Tìm tất cả link http / https
    raw_urls = re.findall(r'https?://[^\s<>"\'\]\[\}]+', text)
    valid_urls = []
    
    for u in raw_urls:
        # Cắt bớt các ký tự dấu câu dính ở cuối URL
        clean_u = u.rstrip(".,;!?'\"):")
        if not clean_u:
            continue
            
        lower_u = clean_u.lower()
        # Nhận diện các nền tảng video mạng xã hội phổ biến
        is_social_video = any(platform in lower_u for platform in [
            "tiktok.com", "douyin.com", "youtube.com", "youtu.be",
            "instagram.com", "facebook.com", "fb.watch", "twitter.com",
            "x.com", "threads.net", "bilibili.com", "kuaishou.com",
            "drive.google.com/file", "drive.google.com/open"
        ])
        
        # Thêm vào nếu là link video mạng xã hội hoặc bất kỳ URL hợp lệ nào có tên miền
        if is_social_video or ("." in lower_u and not lower_u.endswith((".txt", ".csv", ".json", ".js", ".css"))):
            valid_urls.append(clean_u)

    # Loại bỏ trùng lặp giữ nguyên thứ tự
    return list(dict.fromkeys(valid_urls))


def normalize_url_for_dedup(url: str) -> str:
    """
    Chuẩn hóa URL để so sánh trùng lặp chính xác:
    - Bỏ query parameters theo dõi (tracking params: ?is_from_webapp=1, &sender_device=pc, ?utm_...)
    - Chuẩn hóa trailing slash
    """
    if not url:
        return ""
    try:
        parsed = urllib.parse.urlparse(url.strip())
        path = parsed.path.rstrip("/")
        
        # Với TikTok / Douyin: loại bỏ query tracking
        if "tiktok.com" in parsed.netloc or "douyin.com" in parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}{path}".lower()
            
        # Với YouTube: giữ lại tham số 'v'
        if "youtube.com" in parsed.netloc:
            query = urllib.parse.parse_qs(parsed.query)
            if "v" in query:
                return f"{parsed.scheme}://{parsed.netloc}{path}?v={query['v'][0]}".lower()
            return f"{parsed.scheme}://{parsed.netloc}{path}".lower()
            
        # Mặc định
        return f"{parsed.scheme}://{parsed.netloc}{path}".lower()
    except Exception:
        return url.strip().lower()


def deduplicate_against_db(raw_urls: List[str]) -> Dict[str, Any]:
    """
    So sánh danh sách link với Cơ sở dữ liệu SQLite trong kho:
    - Tách thành link mới và link đã tồn tại
    - Kèm thông tin video đã có trong kho
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    # Lấy toàn bộ video trong kho (kể cả trong thùng rác để tránh tải lại)
    cursor.execute("SELECT id, title, source_url, platform, created_at, drive_web_link FROM videos")
    existing_videos = cursor.fetchall()
    conn.close()

    # Tạo map tra cứu theo URL chuẩn hóa và URL gốc
    existing_lookup = {}
    for v in existing_videos:
        v_dict = dict(v)
        src = v_dict.get("source_url") or ""
        if src:
            existing_lookup[src.strip()] = v_dict
            existing_lookup[normalize_url_for_dedup(src)] = v_dict

    new_urls = []
    duplicate_items = []
    seen_in_batch = set()

    for u in raw_urls:
        clean_u = u.strip()
        if not clean_u:
            continue
            
        norm_u = normalize_url_for_dedup(clean_u)
        
        # Bỏ trùng lặp trong chính file nguồn
        if norm_u in seen_in_batch:
            continue
        seen_in_batch.add(norm_u)

        # Kiểm tra với Database
        matched_video = existing_lookup.get(clean_u) or existing_lookup.get(norm_u)
        if matched_video:
            duplicate_items.append({
                "url": clean_u,
                "existing_id": matched_video.get("id"),
                "existing_title": matched_video.get("title") or "Video đã lưu",
                "platform": matched_video.get("platform"),
                "saved_date": (matched_video.get("created_at") or "")[:10]
            })
        else:
            new_urls.append(clean_u)

    return {
        "total_scanned": len(seen_in_batch),
        "new_count": len(new_urls),
        "duplicate_count": len(duplicate_items),
        "new_urls": new_urls,
        "duplicate_items": duplicate_items
    }


def scan_drive_via_gas(gas_url: str, target_id: str, is_folder: bool) -> Optional[Dict[str, Any]]:
    """
    Quét Google Drive thông qua Google Apps Script Web App của người dùng
    """
    if not gas_url or not target_id:
        return None
    try:
        payload = {
            "action": "scan_drive",
            "target_id": target_id,
            "is_folder": is_folder
        }
        resp = _gas_session.post(gas_url.strip(), json=payload, timeout=25, allow_redirects=True)
        if resp.status_code == 200:
            try:
                data = resp.json()
            except Exception:
                return None
            if data.get("success") and "urls" in data:
                return data
            # Nếu GAS phiên bản cũ chưa có action scan_drive (gây lỗi đối số hoặc không có action)
            if not data.get("success"):
                return {"need_gas_update": True, "error": data.get("error", "")}
            if data.get("message") and "đang chạy bình thường" in data.get("message", ""):
                return {"need_gas_update": True}
    except Exception as e:
        print(f"Error calling GAS scan_drive: {e}")
    return None


def scan_drive_via_api(target_id: str, is_folder: bool) -> Optional[Dict[str, Any]]:
    """
    Quét Google Drive thông qua Service Account API
    """
    if not GOOGLE_API_AVAILABLE:
        return None
    creds_json = get_setting(DRIVE_API_CREDS_KEY, "")
    if not creds_json:
        return None
    try:
        creds_data = json.loads(creds_json)
        creds = service_account.Credentials.from_service_account_info(
            creds_data, scopes=['https://www.googleapis.com/auth/drive.readonly']
        )
        service = build('drive', 'v3', credentials=creds)
        
        all_urls = []
        files_scanned = []
        folder_name = "Google Drive"

        if is_folder:
            f_meta = service.files().get(fileId=target_id, fields="name", supportsAllDrives=True).execute()
            folder_name = f_meta.get("name", "Thư mục Drive")
            
            res = service.files().list(
                q=f"'{target_id}' in parents and trashed = false",
                fields="files(id, name, mimeType, size)",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True
            ).execute()
            
            for file in res.get("files", []):
                fid = file["id"]
                fname = file["name"]
                mime = file.get("mimeType", "")
                
                content = ""
                try:
                    if mime == "application/vnd.google-apps.document":
                        content = service.files().export(fileId=fid, mimeType="text/plain").execute().decode("utf-8")
                    elif "text" in mime or fname.endswith((".txt", ".csv")):
                        content = service.files().get_media(fileId=fid).execute().decode("utf-8", errors="ignore")
                except Exception:
                    pass

                urls = extract_social_urls_from_text(content) if content else []
                if urls:
                    all_urls.extend(urls)
                    files_scanned.append({
                        "id": fid,
                        "name": fname,
                        "urls_count": len(urls),
                        "sample_urls": urls[:3]
                    })
        else:
            file_meta = service.files().get(fileId=target_id, fields="name, mimeType", supportsAllDrives=True).execute()
            fname = file_meta.get("name", "Tập tin Drive")
            folder_name = fname
            mime = file_meta.get("mimeType", "")
            content = ""
            if mime == "application/vnd.google-apps.document":
                content = service.files().export(fileId=target_id, mimeType="text/plain").execute().decode("utf-8")
            else:
                content = service.files().get_media(fileId=target_id).execute().decode("utf-8", errors="ignore")
            urls = extract_social_urls_from_text(content) if content else []
            all_urls.extend(urls)
            files_scanned.append({"id": target_id, "name": fname, "urls_count": len(urls)})

        return {
            "success": True,
            "folder_name": folder_name,
            "files_scanned": files_scanned,
            "urls": list(dict.fromkeys(all_urls))
        }
    except Exception as e:
        print(f"Error scanning via Drive API: {e}")
    return None


def scan_drive_via_public_link(target_id: str, is_folder: bool) -> Optional[Dict[str, Any]]:
    """
    Thử tải và đọc file công khai bằng direct export hoặc uc download
    """
    if is_folder:
        return None
    try:
        # Thử đọc Google Doc công khai
        doc_url = f"https://docs.google.com/document/d/{target_id}/export?format=txt"
        resp = requests.get(doc_url, timeout=15)
        if resp.status_code == 200 and len(resp.text) > 0:
            urls = extract_social_urls_from_text(resp.text)
            return {
                "success": True,
                "folder_name": "Tài liệu Google Docs",
                "files_scanned": [{"id": target_id, "name": "Google Doc", "urls_count": len(urls)}],
                "urls": urls
            }
            
        # Thử đọc file .txt công khai trên Drive
        txt_url = f"https://drive.google.com/uc?export=download&id={target_id}"
        resp2 = requests.get(txt_url, timeout=15)
        if resp2.status_code == 200 and "html" not in resp2.headers.get("content-type", "").lower():
            urls = extract_social_urls_from_text(resp2.text)
            return {
                "success": True,
                "folder_name": "Tập tin Drive",
                "files_scanned": [{"id": target_id, "name": "Tập tin Text", "urls_count": len(urls)}],
                "urls": urls
            }
    except Exception:
        pass
    return None


async def scan_and_analyze_drive_source(drive_url: str) -> Dict[str, Any]:
    """
    Hàm tổng hợp: Phân tích đường dẫn Google Drive bất kỳ, bóc tách link trong các file và lọc trùng lặp
    """
    parsed = extract_drive_id_and_type(drive_url)
    target_id = parsed["id"]
    is_folder = parsed["is_folder"]

    if not target_id:
        raise ValueError("Đường dẫn Google Drive không hợp lệ hoặc không tìm thấy ID thư mục/tập tin.")

    # Kiểm tra bộ nhớ cache (nếu vừa quét trong vòng 45s, trả về tức thì chỉ trong 0.001s)
    now = time.time()
    cache_entry = _DRIVE_SCAN_CACHE.get(target_id)
    if cache_entry and (now - cache_entry.get("ts", 0) < _CACHE_TTL):
        raw_urls = cache_entry.get("urls", [])
        folder_name = cache_entry.get("folder_name", "Google Drive")
        files_scanned = cache_entry.get("files_scanned", [])
        dedup_result = deduplicate_against_db(raw_urls)
        return {
            "success": True,
            "is_drive_source": True,
            "target_id": target_id,
            "folder_name": folder_name,
            "files_scanned": files_scanned,
            "total_found": dedup_result["total_scanned"],
            "new_count": dedup_result["new_count"],
            "duplicate_count": dedup_result["duplicate_count"],
            "new_urls": dedup_result["new_urls"],
            "duplicate_items": dedup_result["duplicate_items"],
            "message": f"Đã quét thành công (Tối ưu siêu tốc): Tìm thấy {dedup_result['total_scanned']} link video trong {len(files_scanned)} tập tin. Lọc được {dedup_result['new_count']} link mới hợp lệ và {dedup_result['duplicate_count']} link đã có trong kho."
        }

    loop = asyncio.get_event_loop()
    gas_url = get_setting(DRIVE_GAS_URL_KEY, "")

    # 1. Thử qua Google Apps Script Web App
    scan_result = None
    if gas_url:
        scan_result = await loop.run_in_executor(None, scan_drive_via_gas, gas_url, target_id, is_folder)

    # Nếu Apps Script báo cần cập nhật
    if scan_result and scan_result.get("need_gas_update"):
        return {
            "success": False,
            "need_gas_update": True,
            "target_id": target_id,
            "is_folder": is_folder,
            "message": "Google Apps Script của bạn cần được cập nhật để đọc thư mục & file text. Vui lòng bấm 'Cập nhật mã Apps Script' để dán phiên bản mới."
        }

    # 2. Thử qua Service Account API
    if not scan_result or not scan_result.get("success"):
        api_result = await loop.run_in_executor(None, scan_drive_via_api, target_id, is_folder)
        if api_result and api_result.get("success"):
            scan_result = api_result

    # 3. Thử qua Public Direct Export
    if not scan_result or not scan_result.get("success"):
        public_result = await loop.run_in_executor(None, scan_drive_via_public_link, target_id, is_folder)
        if public_result and public_result.get("success"):
            scan_result = public_result

    if not scan_result or not scan_result.get("success"):
        raise RuntimeError(
            "Không thể đọc thư mục / tập tin Google Drive này.\n"
            "👉 Hãy đảm bảo:\n"
            "1. Google Apps Script Web App đang hoạt động (với quyền 'Bất kỳ ai / Anyone'); HOẶC\n"
            "2. Thư mục/file trên Google Drive đã được bật chia sẻ 'Bất kỳ ai có đường liên kết đều có thể xem'."
        )

    raw_urls = scan_result.get("urls", [])
    folder_name = scan_result.get("folder_name", "Google Drive")
    files_scanned = scan_result.get("files_scanned", [])

    # Lưu vào cache để tối ưu tốc độ cho các lần bấm tiếp theo
    _DRIVE_SCAN_CACHE[target_id] = {
        "ts": time.time(),
        "urls": raw_urls,
        "folder_name": folder_name,
        "files_scanned": files_scanned
    }

    # Thực hiện lọc trùng lặp với cơ sở dữ liệu SQLite
    dedup_result = deduplicate_against_db(raw_urls)

    return {
        "success": True,
        "is_drive_source": True,
        "target_id": target_id,
        "folder_name": folder_name,
        "files_scanned": files_scanned,
        "total_found": dedup_result["total_scanned"],
        "new_count": dedup_result["new_count"],
        "duplicate_count": dedup_result["duplicate_count"],
        "new_urls": dedup_result["new_urls"],
        "duplicate_items": dedup_result["duplicate_items"],
        "message": f"Đã quét thành công: Tìm thấy {dedup_result['total_scanned']} link video trong {len(files_scanned)} tập tin. Lọc được {dedup_result['new_count']} link mới hợp lệ và {dedup_result['duplicate_count']} link đã có trong kho."
    }
