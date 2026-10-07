import os
import sys
import logging
from datetime import datetime
import requests
import mimetypes
from typing import Optional, Dict, Any, Union
from services.db import get_setting

IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload"
DEFAULT_IMGBB_KEY = "79c24f761bd82430601fb94fbdaa96da"

# Cấu hình thư mục lưu log lỗi riêng cho ImgBB
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGS_DIR = os.path.join(BACKEND_DIR, "logs")
os.makedirs(LOGS_DIR, exist_ok=True)
ERROR_LOG_FILE = os.path.join(LOGS_DIR, "imgbb_errors.log")

# Setup logger ImgBB với UTF-8 FileHandler
logger = logging.getLogger("imgbb")
logger.setLevel(logging.INFO)
if not logger.handlers:
    # Handler ghi file UTF-8 không bao giờ bị lỗi font tiếng Việt trên Windows
    file_handler = logging.FileHandler(ERROR_LOG_FILE, encoding="utf-8")
    file_handler.setLevel(logging.WARNING)
    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

def _safe_print_error(msg: str):
    """In thông báo lỗi ra console an toàn trên Windows không bị lỗi UnicodeEncodeError"""
    try:
        print(msg)
    except UnicodeEncodeError:
        try:
            print(msg.encode("ascii", "replace").decode("ascii"))
        except Exception:
            pass

def log_imgbb_error(action: str, target: str, error_detail: str, status_code: Optional[int] = None):
    """Ghi nhận lỗi ImgBB vào file log và in cảnh báo ra console ngay lập tức"""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status_str = f" [HTTP {status_code}]" if status_code else ""
    log_line = f"Action: {action} | Target: {target}{status_str} | Error: {error_detail}"
    
    # Ghi vào file log UTF-8
    logger.error(log_line)
    
    # Báo lỗi ra terminal ngay lập tức
    console_msg = f"[ImgBB][ERROR] ❌ {now_str} | {action} | {target}{status_str} -> {error_detail}"
    _safe_print_error(console_msg)

def get_imgbb_api_key() -> str:
    """Lấy API Key của ImgBB từ database settings hoặc mặc định"""
    key = get_setting("imgbb_api_key", "").strip()
    return key or DEFAULT_IMGBB_KEY

def is_imgbb_enabled() -> bool:
    """Kiểm tra dịch vụ ImgBB đã sẵn sàng hoạt động hay chưa"""
    return bool(get_imgbb_api_key())

def upload_to_imgbb(
    image_source: Union[str, bytes],
    name: Optional[str] = None,
    expiration: Optional[int] = None
) -> Optional[Dict[str, Any]]:
    """
    Tải ảnh lên ImgBB Cloud để lưu trữ vĩnh viễn và lấy link CDN trực tiếp (0 Byte ổ cứng).
    - image_source: Đường dẫn file local (str), chuỗi URL ngoài (str), hoặc dữ liệu nhị phân (bytes).
    - name: Tên ảnh (tùy chọn)
    - expiration: Thời gian hết hạn tính bằng giây (None = lưu vĩnh viễn không bao giờ hết hạn)
    """
    api_key = get_imgbb_api_key()
    if not api_key:
        log_imgbb_error("AUTH", name or "unknown", "Chưa cấu hình ImgBB API Key trong hệ thống.")
        return None

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        "Referer": "https://imgbb.com/"
    }

    data = {
        "key": api_key
    }
    if name:
        data["name"] = name
    if expiration:
        data["expiration"] = expiration

    source_desc = f"bytes({len(image_source)})" if isinstance(image_source, bytes) else str(image_source)

    try:
        # Trường hợp 1: image_source là URL trực tuyến
        if isinstance(image_source, str) and (image_source.startswith("http://") or image_source.startswith("https://")):
            data["image"] = image_source
            resp = requests.post(IMGBB_UPLOAD_URL, headers=headers, data=data, timeout=30)
        
        # Trường hợp 2: image_source là đường dẫn file cục bộ
        elif isinstance(image_source, str) and os.path.exists(image_source):
            filename = os.path.basename(image_source)
            mime_type = mimetypes.guess_type(image_source)[0] or "image/jpeg"
            with open(image_source, "rb") as f:
                files = {"image": (filename, f, mime_type)}
                resp = requests.post(IMGBB_UPLOAD_URL, headers=headers, data=data, files=files, timeout=45)

        # Trường hợp 3: image_source là bytes nhị phân
        elif isinstance(image_source, bytes):
            files = {"image": (f"{name or 'upload'}.jpg", image_source, "image/jpeg")}
            resp = requests.post(IMGBB_UPLOAD_URL, headers=headers, data=data, files=files, timeout=45)
        
        else:
            log_imgbb_error("VALIDATE", source_desc, "Nguồn ảnh không hợp lệ hoặc file không tồn tại.")
            return None

        if resp.status_code == 200:
            try:
                res_json = resp.json()
            except Exception as parse_err:
                log_imgbb_error("PARSE_JSON", source_desc, f"Không thể giải mã phản hồi JSON từ ImgBB: {parse_err}", resp.status_code)
                return None

            if res_json.get("success"):
                img_data = res_json.get("data", {})
                return {
                    "success": True,
                    "url": img_data.get("url"),                     # Link CDN ảnh gốc vĩnh viễn
                    "display_url": img_data.get("display_url"),     # Link hiển thị tốc độ cao
                    "thumb_url": img_data.get("thumb", {}).get("url") or img_data.get("display_url"),
                    "delete_url": img_data.get("delete_url"),
                    "id": img_data.get("id"),
                    "size": img_data.get("size")
                }
            else:
                err_msg = res_json.get("error", {}).get("message") or str(res_json)
                log_imgbb_error("API_REJECT", source_desc, f"ImgBB từ chối tải ảnh: {err_msg}", resp.status_code)
                return None
        else:
            err_detail = resp.text[:300].strip()
            try:
                err_json = resp.json()
                if "error" in err_json:
                    err_detail = err_json["error"].get("message", err_detail)
            except Exception:
                pass
            log_imgbb_error("HTTP_ERROR", source_desc, f"Lỗi phản hồi HTTP từ ImgBB: {err_detail}", resp.status_code)
            return None

    except requests.exceptions.Timeout:
        log_imgbb_error("TIMEOUT", source_desc, "Quá thời gian kết nối (Timeout) tới máy chủ ImgBB.")
        return None
    except requests.exceptions.ConnectionError as conn_err:
        log_imgbb_error("CONNECTION", source_desc, f"Không thể kết nối mạng tới ImgBB API: {conn_err}")
        return None
    except Exception as e:
        log_imgbb_error("EXCEPTION", source_desc, f"Ngoại lệ không xác định: {str(e)}")
        return None

def upload_video_thumbnail(
    video_id: str,
    local_thumb_path: Optional[str] = None,
    remote_thumb_url: Optional[str] = None
) -> Optional[str]:
    """
    Tải thumbnail video lên ImgBB Cloud, xóa file cục bộ để tiết kiệm ổ cứng (0 Byte),
    trả về link CDN vĩnh viễn (https://i.ibb.co/...).
    Ghi log lỗi ngay lập tức nếu không lưu được.
    """
    downloads_thumb = os.path.join(BACKEND_DIR, "downloads", "thumbnails", f"video_{video_id}.jpg")
    
    # 1. Thử tải từ file local nếu có
    target_local = None
    if local_thumb_path and os.path.exists(local_thumb_path) and os.path.getsize(local_thumb_path) > 300:
        target_local = local_thumb_path
    elif os.path.exists(downloads_thumb) and os.path.getsize(downloads_thumb) > 300:
        target_local = downloads_thumb

    if target_local:
        res = upload_to_imgbb(target_local, name=f"thumb_{video_id}")
        if res and res.get("success"):
            cdn_url = res.get("display_url") or res.get("url")
            # Tự động xóa file local để đảm bảo 0 Byte ổ cứng
            try:
                if os.path.exists(target_local):
                    os.remove(target_local)
                if os.path.exists(downloads_thumb) and downloads_thumb != target_local:
                    os.remove(downloads_thumb)
            except Exception:
                pass
            return cdn_url

    # 2. Nếu không có file local hoặc upload local lỗi, thử tải từ URL từ xa
    if remote_thumb_url and remote_thumb_url.startswith("http"):
        if "ibb.co" in remote_thumb_url:
            return remote_thumb_url  # Đã ở trên ImgBB rồi
        res = upload_to_imgbb(remote_thumb_url, name=f"thumb_{video_id}")
        if res and res.get("success"):
            cdn_url = res.get("display_url") or res.get("url")
            # Dọn sạch file local nếu còn sót
            try:
                if os.path.exists(downloads_thumb):
                    os.remove(downloads_thumb)
            except Exception:
                pass
            return cdn_url

    # Nếu tới đây mà không thành công, ghi log lỗi tổng quát
    log_imgbb_error(
        "THUMBNAIL_FAILED",
        f"video_{video_id}",
        f"Không thể tải thumbnail lên ImgBB từ cả nguồn local ({target_local}) và remote ({remote_thumb_url})"
    )
    return None
