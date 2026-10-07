import os
import requests
import mimetypes
from typing import Optional, Dict, Any, Union
from services.db import get_setting

IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload"
DEFAULT_IMGBB_KEY = "79c24f761bd82430601fb94fbdaa96da"

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
        print("[ImgBB] Chưa cấu hình ImgBB API Key.")
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
            print(f"[ImgBB] Nguồn ảnh không hợp lệ: {image_source}")
            return None

        if resp.status_code == 200:
            res_json = resp.json()
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
                print(f"[ImgBB] API phản hồi lỗi: {res_json}")
                return None
        else:
            print(f"[ImgBB] Lỗi HTTP {resp.status_code}: {resp.text[:200]}")
            return None

    except Exception as e:
        print(f"[ImgBB] Ngoại lệ khi tải ảnh lên ImgBB: {e}")
        return None
