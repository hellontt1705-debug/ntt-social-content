import os
import re
import time
import uuid
import shutil
import asyncio
import requests
import yt_dlp
from typing import Dict, Any, Optional, Callable

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
THUMBNAILS_DIR = os.path.join(DOWNLOADS_DIR, "thumbnails")

os.makedirs(DOWNLOADS_DIR, exist_ok=True)
os.makedirs(THUMBNAILS_DIR, exist_ok=True)

SM_SESSION_TOKEN = None
SM_SESSION_EXPIRES = 0

# Caches for instant retrieval
DOUYIN_URL_CACHE = {}      # raw_url -> resolved_video_url
DOUYIN_METADATA_CACHE = {} # url -> (timestamp, info_dict)

# Persistent HTTP session with connection pooling
DOUYIN_SESSION = requests.Session()
_adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20, max_retries=2)
DOUYIN_SESSION.mount("https://", _adapter)
DOUYIN_SESSION.mount("http://", _adapter)

def get_sm_session_token() -> Optional[str]:
    global SM_SESSION_TOKEN, SM_SESSION_EXPIRES
    now = time.time()
    if SM_SESSION_TOKEN and now < SM_SESSION_EXPIRES - 60:
        return SM_SESSION_TOKEN
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.smdownloader.com/platforms/douyin/douyin-video-downloader",
        "Origin": "https://www.smdownloader.com",
        "Accept": "application/json, text/plain, */*"
    }
    try:
        r = DOUYIN_SESSION.get("https://www.smdownloader.com/api/session", headers=headers, timeout=6)
        if r.status_code == 200:
            data = r.json()
            SM_SESSION_TOKEN = data.get("token")
            exp_ms = data.get("expiresAt") or ((now + 3600) * 1000)
            SM_SESSION_EXPIRES = exp_ms / 1000.0
            return SM_SESSION_TOKEN
    except Exception as e:
        print("Error getting SM session token:", e)
    return None

def resolve_douyin_video_url(url: str) -> str:
    """Chuẩn hóa link Douyin về dạng https://www.douyin.com/video/{aweme_id} siêu tốc"""
    if not url:
        return url

    # 1. Kiểm tra cache trước để trả lời trong 0.0001s
    if url in DOUYIN_URL_CACHE:
        return DOUYIN_URL_CACHE[url]

    # 2. Nếu đã có aweme_id dạng video/(\d+) hoặc modal_id=(\d+)
    m = re.search(r'douyin\.com/video/(\d+)', url) or re.search(r'modal_id=(\d+)', url)
    if m:
        res = f"https://www.douyin.com/video/{m.group(1)}"
        DOUYIN_URL_CACHE[url] = res
        return res
        
    if "v.douyin.com" in url or "douyin.com" in url or "iesdouyin.com" in url:
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
        }
        # Tối ưu siêu tốc: Dùng GET allow_redirects=False để lấy Location 302 trong ~0.8s mà không tải body HTML
        try:
            resp = DOUYIN_SESSION.get(url, headers=headers, allow_redirects=False, timeout=5)
            loc = resp.headers.get("Location") or resp.headers.get("location")
            if loc:
                m = re.search(r'video/(\d+)', loc) or re.search(r'modal_id=(\d+)', loc)
                if m:
                    res = f"https://www.douyin.com/video/{m.group(1)}"
                    DOUYIN_URL_CACHE[url] = res
                    return res
        except Exception as e:
            print("Fast 302 resolve error:", e)

    DOUYIN_URL_CACHE[url] = url
    return url

def scrape_via_douyin(raw_url: str) -> Optional[Dict[str, Any]]:
    """Phân tích link Douyin không cần đăng nhập / cookie qua backend giải mã video HD không watermark (kèm cache tức thì)"""
    now = time.time()
    # 1. Kiểm tra cache ngay lập tức bằng raw_url (0.0001s)
    if raw_url in DOUYIN_METADATA_CACHE:
        ts, cached_data = DOUYIN_METADATA_CACHE[raw_url]
        if now - ts < 600:
            return dict(cached_data)

    clean_url = resolve_douyin_video_url(raw_url)
    if clean_url in DOUYIN_METADATA_CACHE:
        ts, cached_data = DOUYIN_METADATA_CACHE[clean_url]
        if now - ts < 600:
            return dict(cached_data)

    try:
        token = get_sm_session_token()
        if not token:
            return None
            
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://www.smdownloader.com/platforms/douyin/douyin-video-downloader",
            "Origin": "https://www.smdownloader.com",
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "x-sd-session": token
        }
        
        r = DOUYIN_SESSION.post("https://www.smdownloader.com/api/extract", json={"url": clean_url}, headers=headers, timeout=12)
        if r.status_code == 200:
            res_json = r.json()
            if res_json.get("ok"):
                d = res_json.get("data", {})
                title = d.get("title") or "Video Douyin"
                author = d.get("author") or "Douyin Creator"
                media_list = d.get("media") or []
                video_url = None
                thumb_url = None
                width = 0
                height = 0
                
                for m in media_list:
                    if m.get("type") == "video" and not video_url:
                        video_url = m.get("url")
                        width = m.get("width", 0)
                        height = m.get("height", 0)
                        if m.get("thumbnail"):
                            thumb_url = m.get("thumbnail")
                    elif m.get("type") == "image" and not thumb_url:
                        thumb_url = m.get("url")
                        
                tags = extract_hashtags_from_text(title)
                vid_id_match = re.search(r'video/(\d+)', clean_url)
                vid_id = vid_id_match.group(1) if vid_id_match else str(int(time.time()))
                
                quality_str = f"{width}x{height} (Gốc / HD)" if width and height else "HD Không Logo (Douyin)"
                
                result = {
                    "id": vid_id,
                    "title": title,
                    "uploader": author,
                    "uploader_url": f"https://www.douyin.com/user/{author}",
                    "description": d.get("description") or title,
                    "duration": 0,
                    "hashtags": tags,
                    "thumbnail": thumb_url or "",
                    "quality": quality_str,
                    "width": width,
                    "height": height,
                    "platform": "douyin",
                    "source_url": raw_url,
                    "download_url": video_url
                }

                # Lưu vào cache để tải xuống ngay lập tức không cần phân tích lại
                DOUYIN_METADATA_CACHE[clean_url] = (now, result)
                DOUYIN_METADATA_CACHE[raw_url] = (now, result)
                return result
    except Exception as e:
        print(f"Scrape Douyin error: {e}")
    return None

def download_via_douyin(clean_url: str, out_filename_base: str, progress_callback=None) -> Optional[Dict[str, Any]]:
    """Tải trực tiếp video Douyin chất lượng cao không watermark siêu tốc (<2s)"""
    try:
        now = time.time()
        info = None
        # Kiểm tra cache trước để bỏ qua toàn bộ độ trễ gọi API
        for k in [clean_url, resolve_douyin_video_url(clean_url)]:
            if k in DOUYIN_METADATA_CACHE:
                ts, cached_info = DOUYIN_METADATA_CACHE[k]
                if now - ts < 600:
                    info = cached_info
                    break

        if not info:
            if progress_callback:
                progress_callback({
                    "percent": 15,
                    "status": "Đang kết nối luồng tải siêu tốc...",
                    "speed": "Ultra Fast",
                    "eta": "1s"
                })
            info = scrape_via_douyin(clean_url)

        if not info or not info.get("download_url"):
            return None
            
        video_url = info["download_url"]
        title = info["title"]
        author = info["uploader"]
        cover_url = info.get("thumbnail")
        width = info.get("width", 1080)
        height = info.get("height", 1920)
        vid_id = info["id"]
        
        if progress_callback:
            progress_callback({
                "percent": 25,
                "status": "Bắt đầu tải luồng 4K...",
                "speed": "Tối đa",
                "eta": "1s",
                "title": title[:35]
            })

        dest_video_path = os.path.join(DOWNLOADS_DIR, f"{out_filename_base}.mp4")
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://www.douyin.com/'
        }
        
        dl_resp = DOUYIN_SESSION.get(video_url, headers=headers, stream=True, timeout=60)
        if dl_resp.status_code != 200:
            return None
            
        total_len = int(dl_resp.headers.get('Content-Length', 0))
        downloaded = 0
        t_start = time.time()
        last_cb_time = 0
        
        # Tăng chunk_size lên 512KB để tối đa hoá băng thông
        with open(dest_video_path, 'wb') as vf:
            for chunk in dl_resp.iter_content(chunk_size=1024 * 512):
                if chunk:
                    vf.write(chunk)
                    downloaded += len(chunk)
                    now_time = time.time()
                    if progress_callback and (now_time - last_cb_time >= 0.12 or (total_len and downloaded >= total_len)):
                        last_cb_time = now_time
                        elapsed = max(0.01, now_time - t_start)
                        speed_mb = round((downloaded / elapsed) / (1024 * 1024), 2)
                        if total_len > 0:
                            pct = round((downloaded / total_len) * 100, 1)
                            scaled_pct = 25 + int(pct * 0.72)
                            eta = max(1, round((total_len - downloaded) / ((downloaded / elapsed) + 1)))
                            progress_callback({
                                "percent": min(97, scaled_pct),
                                "status": f"Đang tải {pct}%",
                                "speed": f"{speed_mb} MB/s",
                                "eta": f"{eta}s",
                                "title": title[:35]
                            })
                        else:
                            progress_callback({
                                "percent": 65,
                                "status": "Đang tải dữ liệu...",
                                "speed": f"{speed_mb} MB/s",
                                "eta": "",
                                "title": title[:35]
                            })
                            
        if progress_callback:
            progress_callback({"percent": 98, "status": "Đang lưu vào kho...", "speed": "", "eta": "", "title": title[:35]})
            
        dest_thumb_path = ""
        if cover_url:
            try:
                dest_thumb_path = os.path.join(THUMBNAILS_DIR, f"{out_filename_base}.jpg")
                t_resp = DOUYIN_SESSION.get(cover_url, headers=headers, timeout=8)
                if t_resp.status_code == 200:
                    with open(dest_thumb_path, 'wb') as tf:
                        tf.write(t_resp.content)
            except Exception:
                pass
                
        tags = info.get("hashtags") or extract_hashtags_from_text(title)
        
        return {
            "id": str(vid_id),
            "title": title,
            "uploader": author,
            "uploader_id": author,
            "uploader_url": info.get("uploader_url") or f"https://www.douyin.com/user/{author}",
            "description": info.get("description") or title,
            "duration": 0,
            "view_count": 0,
            "like_count": 0,
            "thumbnail": cover_url,
            "tags": tags,
            "hashtags": tags,
            "platform": "douyin",
            "source_url": clean_url,
            "height": height,
            "width": width,
            "actual_file_path": dest_video_path,
            "local_thumb_path": dest_thumb_path
        }
    except Exception as e:
        print(f"Douyin download error: {e}")
        return None

def scrape_via_tikwm(clean_url: str) -> Optional[Dict[str, Any]]:
    """Fallback phân tích link TikTok / Douyin qua TikWM API khi yt-dlp bị bot challenge"""
    try:
        resp = requests.post("https://www.tikwm.com/api/", data={"url": clean_url}, timeout=10)
        if resp.status_code == 200:
            res_json = resp.json()
            if res_json.get("code") == 0:
                data = res_json.get("data", {})
                title = data.get("title") or "Video TikTok"
                author = data.get("author", {}).get("nickname") or data.get("author", {}).get("unique_id") or "tiktok_user"
                tags = extract_hashtags_from_text(title)
                return {
                    "id": str(data.get("id") or ""),
                    "title": title,
                    "uploader": author,
                    "uploader_url": f"https://www.tiktok.com/@{data.get('author', {}).get('unique_id', '')}",
                    "description": title,
                    "duration": data.get("duration", 0),
                    "hashtags": tags,
                    "thumbnail": data.get("cover") or "",
                    "quality": "1080p (TikWM)",
                    "platform": "tiktok",
                    "source_url": clean_url
                }
    except Exception as e:
        print(f"TikWM scrape error: {e}")
    return None

def download_via_tikwm(clean_url: str, out_filename_base: str, progress_callback=None) -> Optional[Dict[str, Any]]:
    """Tải trực tiếp video HD không watermark qua TikWM API siêu tốc (<2s)"""
    import time
    try:
        if progress_callback:
            progress_callback({
                "percent": 15,
                "status": "Đang kết nối luồng tải siêu tốc...",
                "speed": "Fast",
                "eta": "1s"
            })

        resp = requests.post("https://www.tikwm.com/api/", data={"url": clean_url}, timeout=10)
        if resp.status_code != 200:
            return None
        res_json = resp.json()
        if res_json.get("code") != 0:
            return None
            
        data = res_json.get("data", {})
        play_url = data.get("play") or data.get("wmplay")
        if not play_url:
            return None
            
        title = data.get("title") or "Video TikTok"
        author = data.get("author", {}).get("nickname") or data.get("author", {}).get("unique_id") or "tiktok_user"
        video_id = data.get("id") or out_filename_base
        cover_url = data.get("cover")
        
        dest_video_path = os.path.join(DOWNLOADS_DIR, f"{out_filename_base}.mp4")
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://www.tiktok.com/'
        }
        
        dl_resp = requests.get(play_url, headers=headers, stream=True, timeout=60)
        if dl_resp.status_code != 200:
            return None
            
        total_len = int(dl_resp.headers.get('Content-Length', 0))
        downloaded = 0
        t_start = time.time()
        last_cb_time = 0
        
        with open(dest_video_path, 'wb') as vf:
            for chunk in dl_resp.iter_content(chunk_size=1024 * 128):
                if chunk:
                    vf.write(chunk)
                    downloaded += len(chunk)
                    now = time.time()
                    if progress_callback and (now - last_cb_time >= 0.15 or (total_len and downloaded >= total_len)):
                        last_cb_time = now
                        elapsed = max(0.01, now - t_start)
                        speed_mb = round((downloaded / elapsed) / (1024 * 1024), 2)
                        if total_len > 0:
                            pct = round((downloaded / total_len) * 100, 1)
                            scaled_pct = 20 + int(pct * 0.75)
                            eta = max(1, round((total_len - downloaded) / ((downloaded / elapsed) + 1)))
                            progress_callback({
                                "percent": scaled_pct,
                                "status": f"Đang tải {pct}%",
                                "speed": f"{speed_mb} MB/s",
                                "eta": f"{eta}s",
                                "title": title[:35]
                            })
                        else:
                            progress_callback({
                                "percent": 60,
                                "status": "Đang tải dữ liệu...",
                                "speed": f"{speed_mb} MB/s",
                                "eta": "",
                                "title": title[:35]
                            })
                        
        if progress_callback:
            progress_callback({"percent": 98, "status": "Đang hoàn tất xử lý...", "speed": "", "eta": ""})
            
        dest_thumb_path = ""
        if cover_url:
            try:
                dest_thumb_path = os.path.join(THUMBNAILS_DIR, f"{out_filename_base}.jpg")
                t_resp = requests.get(cover_url, headers=headers, timeout=10)
                if t_resp.status_code == 200:
                    with open(dest_thumb_path, 'wb') as tf:
                        tf.write(t_resp.content)
            except Exception:
                pass
                
        tags = extract_hashtags_from_text(title)
        
        return {
            "id": str(video_id),
            "title": title,
            "uploader": author,
            "uploader_id": data.get("author", {}).get("unique_id", ""),
            "uploader_url": f"https://www.tiktok.com/@{data.get('author', {}).get('unique_id', '')}",
            "description": title,
            "duration": data.get("duration", 0),
            "view_count": data.get("play_count", 0),
            "like_count": data.get("digg_count", 0),
            "thumbnail": cover_url,
            "tags": tags,
            "hashtags": tags,
            "platform": "tiktok",
            "source_url": clean_url,
            "height": 1920,
            "width": 1080,
            "actual_file_path": dest_video_path,
            "local_thumb_path": dest_thumb_path
        }
    except Exception as e:
        print(f"TikWM download error: {e}")
        return None

def clean_video_url(raw_url: str) -> str:
    """Tự động bóc tách link URL sạch từ văn bản người dùng copy trên mobile (Douyin, TikTok, ...)"""
    if not raw_url:
        return ""
    # 1. Trích xuất đường link http/https từ chuỗi văn bản bất kỳ (loại bỏ chữ tiếng Trung, emoji...)
    match = re.search(r'https?://[^\s<>"\'\u4e00-\u9fa5]+', raw_url.strip())
    clean = match.group(0).rstrip(".,;!?'\")\\]") if match else raw_url.strip()
    
    # 2. Chuẩn hóa link Douyin dạng web modal sang link video chuẩn:
    # https://www.douyin.com/jingxuan?modal_id=7668589584573386011 -> https://www.douyin.com/video/7668589584573386011
    douyin_modal = re.search(r'douyin\.com/.*?[?&]modal_id=(\d+)', clean, re.IGNORECASE)
    if douyin_modal:
        clean = f"https://www.douyin.com/video/{douyin_modal.group(1)}"
        
    return clean

def detect_platform(url: str) -> str:
    url_lower = url.lower()
    if "douyin.com" in url_lower or "iesdouyin.com" in url_lower:
        return "douyin"
    elif "tiktok.com" in url_lower:
        return "tiktok"
    elif "youtube.com" in url_lower or "youtu.be" in url_lower:
        return "youtube"
    elif "instagram.com" in url_lower:
        return "instagram"
    elif "twitter.com" in url_lower or "x.com" in url_lower:
        return "x"
    elif "facebook.com" in url_lower or "fb.watch" in url_lower:
        return "facebook"
    elif "threads.net" in url_lower:
        return "threads"
    elif "bilibili.com" in url_lower:
        return "bilibili"
    elif "drive.google.com" in url_lower or "docs.google.com" in url_lower:
        return "drive"
    return "other"

def extract_hashtags_from_text(text: str) -> list:
    if not text:
        return []
    # Match hashtags with unicode support (Vietnamese, Chinese Douyin, Latin)
    tags = re.findall(r'#([\w\u4e00-\u9fa5\u00C0-\u1EF9]+)', text)
    return list(dict.fromkeys(tags)) # Deduplicate preserving order

def get_ffmpeg_path() -> Optional[str]:
    return shutil.which("ffmpeg")

def get_cookie_file() -> Optional[str]:
    """Tìm file cookies.txt nếu có trong thư mục để tự động nạp vào yt-dlp cho các trang chặn bot như Douyin"""
    for cp in ["cookies.txt", "backend/cookies.txt", os.path.join(os.path.dirname(__file__), "..", "cookies.txt"), os.path.join(os.path.dirname(__file__), "cookies.txt")]:
        if os.path.exists(cp) and os.path.getsize(cp) > 0:
            return os.path.abspath(cp)
    return None

def get_ydl_base_opts() -> dict:
    opts = {
        'quiet': True,
        'no_warnings': True,
        'ignoreerrors': False,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }
    cookie_file = get_cookie_file()
    if cookie_file:
        opts['cookiefile'] = cookie_file

    ffmpeg_exe = get_ffmpeg_path()
    if ffmpeg_exe:
        opts['ffmpeg_location'] = ffmpeg_exe
    return opts

def is_direct_image_url(url: str) -> bool:
    if not url:
        return False
    clean = url.lower().split("?")[0]
    image_exts = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg', '.tiff')
    if any(clean.endswith(ext) for ext in image_exts):
        return True
    if "pbs.twimg.com/media/" in url.lower():
        return True
    return False

def is_social_photo_post(url: str) -> bool:
    if not url:
        return False
    u = url.lower()
    if ("twitter.com" in u or "x.com" in u) and ("/photo/" in u or "/status/" in u):
        return True
    if "instagram.com" in u:
        return True
    if is_direct_image_url(url):
        return True
    return False

def scrape_via_instagram(raw_url: str) -> Optional[Dict[str, Any]]:
    """Phân tích và lấy media (ảnh HD hoặc video) từ Instagram không cần đăng nhập"""
    clean_url = clean_video_url(raw_url)
    m = re.search(r'instagram\.com/(?:p|reel|reels)/([A-Za-z0-9_-]+)', clean_url)
    shortcode = m.group(1) if m else None
    api_target_url = f"https://www.instagram.com/p/{shortcode}/" if shortcode else clean_url

    try:
        token = get_sm_session_token()
        if not token:
            return None

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://www.smdownloader.com/platforms/instagram/instagram-photo-downloader",
            "Origin": "https://www.smdownloader.com",
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "x-sd-session": token
        }

        r = DOUYIN_SESSION.post("https://www.smdownloader.com/api/extract", json={"url": api_target_url}, headers=headers, timeout=12)
        if r.status_code == 200:
            res_json = r.json()
            if res_json.get("ok"):
                d = res_json.get("data", {})
                title = d.get("title") or "Ảnh / Video Instagram"
                raw_author = d.get("author") or "instagram_user"
                author = raw_author.lstrip("@")
                media_list = d.get("media") or []
                if not media_list:
                    return None

                video_url = None
                img_url = None
                thumb_url = None
                width = 0
                height = 0

                for item in media_list:
                    m_type = item.get("type")
                    if m_type == "video" and not video_url:
                        video_url = item.get("url")
                        thumb_url = item.get("thumbnail") or thumb_url
                        width = item.get("width") or 0
                        height = item.get("height") or 0
                    elif m_type == "image" and not img_url:
                        img_url = item.get("url")
                        thumb_url = img_url
                        width = item.get("width") or 0
                        height = item.get("height") or 0

                is_video = bool(video_url)
                target_url = video_url if is_video else img_url
                if not target_url and media_list:
                    target_url = media_list[0].get("url")
                    thumb_url = media_list[0].get("url")
                    is_video = media_list[0].get("type") == "video"

                if not target_url:
                    return None

                media_type = "video" if is_video else "image"
                quality_str = f"{width}x{height} (Gốc HD)" if width and height else ("HD (Instagram Video)" if is_video else "Gốc HD (Instagram)")
                tags = extract_hashtags_from_text(title)

                return {
                    "id": shortcode or str(int(time.time())),
                    "is_folder": False,
                    "folder_entries": [],
                    "title": title[:80].strip() or f"Instagram (@{author})",
                    "uploader": author,
                    "uploader_id": author,
                    "uploader_url": f"https://www.instagram.com/{author}/" if author else "https://www.instagram.com/",
                    "description": title,
                    "duration": 0,
                    "hashtags": tags,
                    "thumbnail_url": thumb_url or target_url,
                    "download_url": target_url,
                    "quality": quality_str,
                    "width": width,
                    "height": height,
                    "platform": "instagram",
                    "source_url": clean_url,
                    "media_type": media_type
                }
    except Exception as e:
        print(f"Scrape Instagram error: {e}")
    return None

def scrape_social_image_metadata(clean_url: str) -> Optional[Dict[str, Any]]:
    """Phân tích và lấy metadata ảnh chất lượng cao gốc từ X/Twitter, TikTok photo, Instagram hoặc direct image link"""
    platform = detect_platform(clean_url)
    
    # 1. Nền tảng X / TWITTER (hỗ trợ cả link tweet thường và link tweet /photo/X)
    if platform == "x":
        tweet_id_match = re.search(r'(?:status|statuses)/(\d+)', clean_url)
        tweet_id = tweet_id_match.group(1) if tweet_id_match else None
        if tweet_id:
            try:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "application/json"
                }
                fx_resp = requests.get(f"https://api.fxtwitter.com/status/{tweet_id}", headers=headers, timeout=10)
                if fx_resp.status_code == 200:
                    fx_json = fx_resp.json()
                    if fx_json.get("code") == 200:
                        tweet = fx_json.get("tweet", {})
                        media = tweet.get("media", {})
                        photos = media.get("photos", [])
                        videos = media.get("videos", [])
                        
                        # Nếu tweet có photos (và không có video, hoặc url chỉ định /photo/)
                        if photos and (not videos or "/photo/" in clean_url):
                            photo_idx_match = re.search(r'/photo/(\d+)', clean_url)
                            photo_idx = int(photo_idx_match.group(1)) - 1 if photo_idx_match else 0
                            photo_idx = max(0, min(photo_idx, len(photos) - 1))
                            selected_photo = photos[photo_idx]
                            
                            raw_photo_url = selected_photo.get("url") or ""
                            # Nâng cấp lên chất lượng gốc tối đa (?name=orig)
                            if "pbs.twimg.com/media/" in raw_photo_url:
                                base_img_url = raw_photo_url.split("?")[0]
                                high_res_url = f"{base_img_url}?name=orig"
                            else:
                                high_res_url = raw_photo_url
                                
                            author_name = tweet.get("author", {}).get("name") or tweet.get("author", {}).get("screen_name") or "X Creator"
                            author_handle = tweet.get("author", {}).get("screen_name") or ""
                            desc = tweet.get("text", "")
                            title = desc[:80].strip() or f"Ảnh X (@{author_handle})"
                            tags = extract_hashtags_from_text(desc)
                            w = selected_photo.get("width", 0)
                            h = selected_photo.get("height", 0)
                            quality_str = f"{w}x{h} (Gốc HD)" if w and h else "Gốc HD (Original)"
                            
                            return {
                                "id": tweet_id,
                                "is_folder": False,
                                "folder_entries": [],
                                "title": title,
                                "uploader": author_name,
                                "uploader_id": author_handle,
                                "uploader_url": f"https://x.com/{author_handle}" if author_handle else "",
                                "platform": "x",
                                "source_url": clean_url,
                                "description": desc,
                                "hashtags": tags,
                                "duration": 0,
                                "view_count": tweet.get("views", 0) or 0,
                                "like_count": tweet.get("likes", 0) or 0,
                                "thumbnail_url": high_res_url,
                                "download_url": high_res_url,
                                "quality": quality_str,
                                "media_type": "image",
                                "width": w,
                                "height": h
                            }
            except Exception as fx_err:
                print(f"FxTwitter scrape image error: {fx_err}")

    # 2. LINK ẢNH TRỰC TIẾP (direct image file hoặc pbs.twimg.com link)
    if is_direct_image_url(clean_url):
        img_url = clean_url
        if "pbs.twimg.com/media/" in img_url and "?name=" not in img_url:
            base = img_url.split("?")[0]
            img_url = f"{base}?name=orig"
            
        cand_name = clean_url.split("?")[0].split("/")[-1]
        title = cand_name or "Ảnh chất lượng cao"
        return {
            "id": str(uuid.uuid4())[:12],
            "is_folder": False,
            "folder_entries": [],
            "title": title,
            "uploader": "Mạng xã hội",
            "uploader_id": "",
            "uploader_url": "",
            "platform": platform if platform != "other" else "x" if "twimg" in clean_url else "other",
            "source_url": clean_url,
            "description": title,
            "hashtags": ["image", "hd"],
            "duration": 0,
            "view_count": 0,
            "like_count": 0,
            "thumbnail_url": img_url,
            "download_url": img_url,
            "quality": "Gốc HD (Original)",
            "media_type": "image",
            "width": 0,
            "height": 0
        }

    # 3. TIKTOK PHOTO MODE (album ảnh TikTok)
    if platform == "tiktok":
        try:
            resp = requests.post("https://www.tikwm.com/api/", data={"url": clean_url}, timeout=8)
            if resp.status_code == 200:
                res_json = resp.json()
                if res_json.get("code") == 0:
                    d = res_json.get("data", {})
                    images = d.get("images") or []
                    if images:
                        img_url = images[0]
                        title = d.get("title") or "Ảnh TikTok"
                        author = d.get("author", {}).get("nickname") or d.get("author", {}).get("unique_id") or "TikTok Creator"
                        tags = extract_hashtags_from_text(title)
                        return {
                            "id": str(d.get("id") or uuid.uuid4())[:12],
                            "is_folder": False,
                            "folder_entries": [],
                            "title": title,
                            "uploader": author,
                            "uploader_id": d.get("author", {}).get("unique_id", ""),
                            "uploader_url": f"https://www.tiktok.com/@{d.get('author', {}).get('unique_id', '')}",
                            "platform": "tiktok",
                            "source_url": clean_url,
                            "description": title,
                            "hashtags": tags,
                            "duration": 0,
                            "view_count": d.get("play_count", 0),
                            "like_count": d.get("digg_count", 0),
                            "thumbnail_url": img_url,
                            "download_url": img_url,
                            "quality": "HD Gốc (TikTok Photo)",
                            "media_type": "image",
                            "width": 0,
                            "height": 0
                        }
        except Exception as tt_err:
            print(f"TikTok image scrape error: {tt_err}")

    # 4. NỀN TẢNG: INSTAGRAM (hỗ trợ ảnh đơn, carousel ảnh, và post ảnh)
    if platform == "instagram":
        ig_res = scrape_via_instagram(clean_url)
        if ig_res and ig_res.get("media_type") == "image":
            return ig_res

    return None

def download_social_image(
    clean_url: str,
    video_id: str,
    category_id: str = "all",
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    meta_hint: Optional[Dict[str, Any]] = None
) -> Optional[Dict[str, Any]]:
    """Tải ảnh chất lượng cao gốc từ các nền tảng mạng xã hội hoặc direct link"""
    if progress_callback:
        progress_callback({
            "percent": 20,
            "status": "Đang kết nối tải ảnh HD gốc...",
            "speed": "Ultra Fast",
            "eta": "1s"
        })
        
    meta = meta_hint or scrape_social_image_metadata(clean_url)
    if not meta or not (meta.get("download_url") or meta.get("thumbnail_url")):
        if is_direct_image_url(clean_url):
            img_url = clean_url
        else:
            raise RuntimeError("Không thể bóc tách ảnh chất lượng cao từ liên kết này. Hãy đảm bảo bài viết ở chế độ công khai.")
    else:
        img_url = meta.get("download_url") or meta.get("thumbnail_url")

    if "pbs.twimg.com/media/" in img_url and "?name=" not in img_url:
        base = img_url.split("?")[0]
        img_url = f"{base}?name=orig"

    # Xác định đuôi mở rộng file (.jpg, .png, .webp...)
    ext = "jpg"
    cand_name = img_url.split("?")[0].split("/")[-1]
    if "." in cand_name:
        e = cand_name.split(".")[-1].lower()
        if e in ["jpg", "jpeg", "png", "webp", "gif", "svg"]:
            ext = "jpg" if e == "jpeg" else e

    dest_img_path = os.path.join(DOWNLOADS_DIR, f"video_{video_id}.{ext}")
    dest_thumb_path = os.path.join(THUMBNAILS_DIR, f"video_{video_id}.jpg")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }
    if "twitter.com" in clean_url or "x.com" in clean_url or "twimg.com" in img_url:
        headers["Referer"] = "https://x.com/"
    elif "instagram.com" in clean_url or "cdninstagram.com" in img_url:
        headers["Referer"] = "https://www.instagram.com/"

    resp = requests.get(img_url, headers=headers, stream=True, timeout=30)
    if resp.status_code != 200:
        if img_url != clean_url:
            resp = requests.get(clean_url, headers=headers, stream=True, timeout=30)
        if resp.status_code != 200:
            raise RuntimeError(f"Không thể tải ảnh: HTTP {resp.status_code}")

    downloaded = 0
    with open(dest_img_path, 'wb') as f:
        for chunk in resp.iter_content(chunk_size=64 * 1024):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)

    if progress_callback:
        progress_callback({
            "percent": 90,
            "status": "Đang xử lý ảnh chất lượng cao...",
            "speed": "Ultra Fast",
            "eta": "0s"
        })

    # Tạo file thumbnail tương ứng
    try:
        shutil.copy2(dest_img_path, dest_thumb_path)
    except Exception:
        pass

    file_size = os.path.getsize(dest_img_path) if os.path.exists(dest_img_path) else 0

    title = meta.get("title") if meta else (clean_url.split("/")[-1].split("?")[0] or "Ảnh tải về")
    uploader = meta.get("uploader") if meta else "Mạng xã hội"
    uploader_id = meta.get("uploader_id", "") if meta else ""
    uploader_url = meta.get("uploader_url", "") if meta else ""
    platform = meta.get("platform") if meta else detect_platform(clean_url)
    desc = meta.get("description", "") if meta else title
    tags = meta.get("hashtags", []) if meta else extract_hashtags_from_text(title)
    quality = meta.get("quality", "Gốc HD (Original)") if meta else "Gốc HD (Original)"

    if progress_callback:
        progress_callback({
            "percent": 100,
            "status": "Đã hoàn thành lưu ảnh!",
            "speed": "",
            "eta": ""
        })

    return {
        "id": video_id,
        "title": title,
        "uploader": uploader,
        "uploader_id": uploader_id,
        "uploader_url": uploader_url,
        "platform": platform,
        "source_url": clean_url,
        "description": desc,
        "hashtags": tags,
        "duration": 0,
        "view_count": meta.get("view_count", 0) if meta else 0,
        "like_count": meta.get("like_count", 0) if meta else 0,
        "category_id": category_id,
        "file_path": dest_img_path,
        "file_size": file_size,
        "thumbnail_url": img_url,
        "local_thumbnail": dest_thumb_path if os.path.exists(dest_thumb_path) else "",
        "quality": quality,
        "status": "saved",
        "media_type": "image"
    }

async def scrape_video_metadata(url: str) -> Dict[str, Any]:
    """Lấy thông tin chi tiết của video hoặc thư mục Drive hoặc ảnh mạng xã hội mà chưa cần tải file xuống"""
    clean_url = clean_video_url(url)
    loop = asyncio.get_event_loop()
    
    # 0. Kiểm tra nếu là ảnh mạng xã hội hoặc direct image link
    if is_direct_image_url(clean_url) or "/photo/" in clean_url.lower():
        img_meta = await loop.run_in_executor(None, scrape_social_image_metadata, clean_url)
        if img_meta:
            return img_meta
    
    platform = detect_platform(clean_url)
    if platform == "drive":
        from services.drive_scanner import scan_and_analyze_drive_source
        try:
            drive_analysis = await scan_and_analyze_drive_source(clean_url)
            if drive_analysis.get("need_gas_update"):
                return {
                    "id": drive_analysis.get("target_id", "drive_scan"),
                    "is_folder": True,
                    "is_drive_source": True,
                    "need_gas_update": True,
                    "folder_entries": [],
                    "title": "Cần cập nhật mã Google Apps Script",
                    "uploader": "Google Drive",
                    "platform": "drive",
                    "source_url": clean_url,
                    "description": drive_analysis.get("message", ""),
                    "drive_details": drive_analysis
                }
                
            folder_entries = []
            for u in drive_analysis.get("new_urls", []):
                folder_entries.append({
                    "id": u,
                    "title": u,
                    "url": u,
                    "duration": 0,
                    "uploader": "Link từ Drive"
                })
            
            return {
                "id": drive_analysis.get("target_id", "drive_scan"),
                "is_folder": True,
                "is_drive_source": True,
                "folder_entries": folder_entries,
                "title": f"Google Drive: {drive_analysis.get('folder_name', 'Thư mục Drive')}",
                "uploader": "Google Drive",
                "uploader_id": "",
                "uploader_url": clean_url,
                "platform": "drive",
                "source_url": clean_url,
                "description": drive_analysis.get("message", ""),
                "hashtags": ["drive", "social", "import"],
                "duration": 0,
                "view_count": 0,
                "like_count": 0,
                "thumbnail_url": "",
                "quality": "Gốc",
                "drive_details": drive_analysis
            }
        except Exception as drive_err:
            raise RuntimeError(str(drive_err))

    # Tối ưu siêu tốc cho Douyin: Phân tích trực tiếp chất lượng cao không cần cookie
    if platform == "douyin":
        douyin_res = await loop.run_in_executor(None, scrape_via_douyin, clean_url)
        if douyin_res:
            return {
                "id": douyin_res["id"],
                "is_folder": False,
                "folder_entries": [],
                "title": douyin_res["title"],
                "uploader": douyin_res["uploader"],
                "platform": "douyin",
                "source_url": clean_url,
                "description": douyin_res["description"],
                "hashtags": douyin_res["hashtags"],
                "duration": douyin_res["duration"],
                "thumbnail_url": douyin_res["thumbnail"],
                "quality": douyin_res["quality"],
                "drive_details": None
            }

    # Tối ưu siêu tốc cho TikTok: Thử TikWM trước (phản hồi trong 0.5s)
    if platform == "tiktok":
        tikwm_res = await loop.run_in_executor(None, scrape_via_tikwm, clean_url)
        if tikwm_res:
            return {
                "id": tikwm_res["id"],
                "is_folder": False,
                "folder_entries": [],
                "title": tikwm_res["title"],
                "uploader": tikwm_res["uploader"],
                "platform": "tiktok",
                "source_url": clean_url,
                "description": tikwm_res["description"],
                "hashtags": tikwm_res["hashtags"],
                "duration": tikwm_res["duration"],
                "thumbnail_url": tikwm_res["thumbnail"],
                "quality": "1080p",
                "drive_details": None
            }

    # Tối ưu siêu tốc cho Instagram (hỗ trợ cả ảnh và video không bị lỗi bot)
    if platform == "instagram":
        ig_res = await loop.run_in_executor(None, scrape_via_instagram, clean_url)
        if ig_res:
            return ig_res

    def _extract():
        opts = get_ydl_base_opts()
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(clean_url, download=False)
            
    try:
        info = await loop.run_in_executor(None, _extract)
    except Exception as e:
        err_str = str(e)
        # Thử fallback phân tích ảnh mạng xã hội nếu yt-dlp báo lỗi (ví dụ tweet ảnh không có video)
        try:
            img_meta = await loop.run_in_executor(None, scrape_social_image_metadata, clean_url)
            if img_meta:
                return img_meta
        except Exception:
            pass
        if "Fresh cookies" in err_str or "s_v_web_id" in err_str:
            raise RuntimeError("Nền tảng Douyin yêu cầu cookie xác thực từ trình duyệt (do cơ chế bảo mật của Douyin). Bạn hãy xuất file cookies.txt từ trình duyệt vào thư mục ứng dụng để tải video này.")
        raise RuntimeError(f"Không thể phân tích video / link Drive: {err_str}")

    if not info:
        raise RuntimeError("Không tìm thấy dữ liệu từ đường dẫn này.")

    # In case of playlist or Google Drive folder
    is_folder = False
    folder_entries = []
    if 'entries' in info and info['entries']:
        raw_entries = [e for e in info['entries'] if e]
        if len(raw_entries) > 1 or "folders/" in clean_url:
            is_folder = True
            for entry in raw_entries:
                folder_entries.append({
                    "id": entry.get("id", ""),
                    "title": entry.get("title") or entry.get("id") or "Video Drive",
                    "url": entry.get("webpage_url") or f"https://drive.google.com/file/d/{entry.get('id')}/view",
                    "duration": entry.get("duration", 0),
                    "uploader": entry.get("uploader", "Google Drive")
                })
        info = raw_entries[0] if raw_entries else info

    title = info.get('title') or ("Thư mục Google Drive" if is_folder else "Video không tiêu đề")
    description = info.get('description') or ""
    uploader = info.get('uploader') or info.get('channel') or info.get('creator') or ("Google Drive" if "drive.google.com" in clean_url else "Chưa rõ tác giả")
    uploader_id = info.get('uploader_id') or info.get('channel_id') or ""
    uploader_url = info.get('uploader_url') or info.get('channel_url') or ""
    
    # Extract tags from both ydl info and description/title text
    raw_tags = info.get('tags') or []
    desc_tags = extract_hashtags_from_text(description)
    title_tags = extract_hashtags_from_text(title)
    combined_tags = list(dict.fromkeys(desc_tags + title_tags + raw_tags))

    duration = info.get('duration') or 0
    view_count = info.get('view_count') or 0
    like_count = info.get('like_count') or 0
    thumbnail = info.get('thumbnail') or ""
    platform = detect_platform(clean_url)

    # Resolution detection
    resolution = "Gốc (Original)" if platform == "drive" else "Auto"
    if info.get('height'):
        resolution = f"{info.get('height')}p"
    elif info.get('resolution'):
        resolution = info.get('resolution')

    video_id = str(uuid.uuid4())[:12]

    return {
        "id": video_id,
        "is_folder": is_folder,
        "folder_entries": folder_entries,
        "title": title,
        "uploader": uploader,
        "uploader_id": uploader_id,
        "uploader_url": uploader_url,
        "platform": platform,
        "source_url": clean_url,
        "description": description,
        "hashtags": combined_tags,
        "duration": duration,
        "view_count": view_count,
        "like_count": like_count,
        "thumbnail_url": thumbnail,
        "quality": resolution,
        "media_type": "video"
    }

async def download_video(
    url: str,
    video_id: str,
    category_id: str = "all",
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None
) -> Dict[str, Any]:
    """Tải video hoặc ảnh ở chất lượng tốt nhất và lưu vào thư mục downloads"""
    clean_url = clean_video_url(url)
    platform = detect_platform(clean_url)
    loop = asyncio.get_event_loop()
    
    # 0. Kiểm tra nếu là ảnh hoặc photo post thì tải trực tiếp chất lượng gốc
    if is_direct_image_url(clean_url) or "/photo/" in clean_url.lower():
        img_res = await loop.run_in_executor(None, download_social_image, clean_url, video_id, category_id, progress_callback)
        if img_res:
            return img_res

    # Tối ưu cho Instagram: nếu là ảnh thì tải qua download_social_image
    if platform == "instagram":
        ig_meta = await loop.run_in_executor(None, scrape_via_instagram, clean_url)
        if ig_meta and ig_meta.get("media_type") == "image":
            return await loop.run_in_executor(None, download_social_image, clean_url, video_id, category_id, progress_callback, ig_meta)
            
    out_filename_base = f"video_{video_id}"
    out_path_template = os.path.join(DOWNLOADS_DIR, f"{out_filename_base}.%(ext)s")

    progress_data = {"percent": 0, "status": "starting", "speed": "", "eta": ""}

    def ydl_progress_hook(d):
        if d['status'] == 'downloading':
            total_bytes = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded_bytes = d.get('downloaded_bytes') or 0
            percent = 0
            if total_bytes > 0:
                percent = round((downloaded_bytes / total_bytes) * 100, 1)
            elif d.get('fragment_count'):
                percent = round((d.get('fragment_index', 0) / d['fragment_count']) * 100, 1)
            elif d.get('_percent_str'):
                try:
                    clean_p = re.sub(r'[^\d.]', '', d['_percent_str'])
                    if clean_p:
                        percent = float(clean_p)
                except Exception:
                    pass
            
            speed = d.get('speed')
            speed_str = f"{round(speed / (1024 * 1024), 2)} MB/s" if speed else (d.get('_speed_str') or "")
            eta = d.get('eta')
            eta_str = f"{eta}s" if eta else (d.get('_eta_str') or "")

            progress_data["percent"] = percent
            progress_data["status"] = "downloading"
            progress_data["speed"] = speed_str
            progress_data["eta"] = eta_str

            if progress_callback:
                try:
                    progress_callback(progress_data)
                except Exception:
                    pass
        elif d['status'] == 'finished':
            progress_data["percent"] = 100
            progress_data["status"] = "processing"
            if progress_callback:
                try:
                    progress_callback(progress_data)
                except Exception:
                    pass

    ffmpeg_exe = get_ffmpeg_path()
    cookie_file = get_cookie_file()
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best',
        'outtmpl': out_path_template,
        'writethumbnail': True,
        'merge_output_format': 'mp4',
        'progress_hooks': [ydl_progress_hook],
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'concurrent_fragment_downloads': 8,
        'buffersize': 1024 * 1024,
        'http_chunk_size': 10485760,
        'retries': 10,
        'fragment_retries': 10,
        'quiet': False,
        'no_warnings': True,
    }
    if cookie_file:
        ydl_opts['cookiefile'] = cookie_file
    if ffmpeg_exe:
        ydl_opts['ffmpeg_location'] = ffmpeg_exe

    def _execute_download():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(clean_url, download=True)

    info = None
    if platform == "douyin":
        douyin_dl = await loop.run_in_executor(None, download_via_douyin, clean_url, out_filename_base, progress_callback)
        if douyin_dl:
            info = douyin_dl
    elif platform == "tiktok":
        tikwm_dl = await loop.run_in_executor(None, download_via_tikwm, clean_url, out_filename_base, progress_callback)
        if tikwm_dl:
            info = tikwm_dl

    if not info:
        try:
            info = await loop.run_in_executor(None, _execute_download)
        except Exception as e:
            # Fallback if bestvideo+bestaudio merge fails
            def _execute_fallback():
                fallback_opts = {
                    'format': 'best',
                    'outtmpl': out_path_template,
                    'writethumbnail': True,
                    'progress_hooks': [ydl_progress_hook],
                    'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'concurrent_fragment_downloads': 8,
                    'buffersize': 1024 * 1024,
                    'http_chunk_size': 10485760,
                    'retries': 10,
                    'fragment_retries': 10,
                    'quiet': False,
                }
                if ffmpeg_exe:
                    fallback_opts['ffmpeg_location'] = ffmpeg_exe
                with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                    return ydl.extract_info(clean_url, download=True)
            try:
                info = await loop.run_in_executor(None, _execute_fallback)
            except Exception as e2:
                # Thử fallback tải ảnh chất lượng gốc nếu yt-dlp thất bại (ví dụ: tweet chỉ có ảnh)
                try:
                    img_res = await loop.run_in_executor(None, download_social_image, clean_url, video_id, category_id, progress_callback)
                    if img_res:
                        return img_res
                except Exception:
                    pass
                raise e2

    if 'entries' in info and info['entries']:
        info = info['entries'][0]

    # Find the downloaded file
    actual_file_path = info.get('actual_file_path') if isinstance(info, dict) else None
    if not actual_file_path and isinstance(info, dict):
        if 'requested_downloads' in info and info['requested_downloads']:
            req_dl = info['requested_downloads'][0]
            if req_dl.get('filepath') and os.path.exists(req_dl['filepath']):
                actual_file_path = req_dl['filepath']
        if not actual_file_path and info.get('_filename') and os.path.exists(info['_filename']):
            actual_file_path = info['_filename']

    if not actual_file_path:
        possible_exts = ['mp4', 'mkv', 'webm', 'mov', 'ts']
        for ext in possible_exts:
            test_path = os.path.join(DOWNLOADS_DIR, f"{out_filename_base}.{ext}")
            if os.path.exists(test_path):
                actual_file_path = test_path
                break

    file_size = os.path.getsize(actual_file_path) if actual_file_path and os.path.exists(actual_file_path) else 0

    # Find thumbnail
    local_thumb_path = info.get('local_thumb_path', "") if isinstance(info, dict) else ""
    if not local_thumb_path:
        for ext in ['webp', 'jpg', 'jpeg', 'png', 'image']:
            test_thumb = os.path.join(DOWNLOADS_DIR, f"{out_filename_base}.{ext}")
            if os.path.exists(test_thumb):
                dest_ext = "jpg" if ext == "image" else ext
                dest_thumb = os.path.join(THUMBNAILS_DIR, f"{out_filename_base}.{dest_ext}")
                try:
                    os.replace(test_thumb, dest_thumb)
                    local_thumb_path = dest_thumb
                except Exception:
                    local_thumb_path = test_thumb
                break

    # Clean up any leftover temporary files (.image, .part, .ytdl...)
    for item in os.listdir(DOWNLOADS_DIR):
        if out_filename_base in item and not item.endswith(('.mp4', '.mkv', '.webm', '.mov', '.ts')):
            try:
                os.remove(os.path.join(DOWNLOADS_DIR, item))
            except Exception:
                pass

    # If source has no image thumbnail (e.g. Google Drive, direct MP4), generate frame with ffmpeg
    if not local_thumb_path and actual_file_path and os.path.exists(actual_file_path):
        ffmpeg_exe = get_ffmpeg_path()
        if ffmpeg_exe:
            generated_thumb = os.path.join(THUMBNAILS_DIR, f"{out_filename_base}.jpg")
            try:
                import subprocess
                subprocess.run(
                    [ffmpeg_exe, "-y", "-ss", "00:00:01", "-i", actual_file_path, "-vframes", "1", "-q:v", "2", generated_thumb],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=15
                )
                if os.path.exists(generated_thumb):
                    local_thumb_path = generated_thumb
            except Exception as e:
                print(f"Failed to generate thumbnail via ffmpeg: {e}")

    # Build full video record
    title = info.get('title') or "Video không tiêu đề"
    description = info.get('description') or ""
    uploader = info.get('uploader') or info.get('channel') or info.get('creator') or "Chưa rõ tác giả"
    uploader_id = info.get('uploader_id') or info.get('channel_id') or ""
    uploader_url = info.get('uploader_url') or info.get('channel_url') or ""
    
    raw_tags = info.get('tags') or []
    desc_tags = extract_hashtags_from_text(description)
    title_tags = extract_hashtags_from_text(title)
    combined_tags = list(dict.fromkeys(desc_tags + title_tags + raw_tags))

    duration = info.get('duration') or 0
    view_count = info.get('view_count') or 0
    like_count = info.get('like_count') or 0
    thumbnail_url = info.get('thumbnail') or ""
    platform = detect_platform(clean_url)

    quality = "1080p"
    if info.get('height'):
        quality = f"{info.get('height')}p"
    elif info.get('resolution'):
        quality = info.get('resolution')

    return {
        "id": video_id,
        "title": title,
        "uploader": uploader,
        "uploader_id": uploader_id,
        "uploader_url": uploader_url,
        "platform": platform,
        "source_url": clean_url,
        "description": description,
        "hashtags": combined_tags,
        "duration": duration,
        "view_count": view_count,
        "like_count": like_count,
        "category_id": category_id,
        "file_path": actual_file_path or "",
        "file_size": file_size,
        "thumbnail_url": thumbnail_url,
        "local_thumbnail": local_thumb_path,
        "quality": quality,
        "status": "saved",
        "media_type": info.get("media_type", "video") if isinstance(info, dict) else "video"
    }

def compute_aspect_ratio_str(w: int, h: int) -> str:
    """Tính tỉ lệ khung hình chuẩn từ chiều rộng và chiều cao"""
    if not w or not h:
        return ""
    from math import gcd
    r = w / h
    if 0.54 <= r <= 0.59:
        return "9:16"
    if 1.74 <= r <= 1.81:
        return "16:9"
    if 0.97 <= r <= 1.03:
        return "1:1"
    if 0.78 <= r <= 0.83:
        return "4:5"
    if 0.73 <= r <= 0.77:
        return "3:4"
    if 1.31 <= r <= 1.36:
        return "4:3"
    g = gcd(int(w), int(h))
    return f"{w//g}:{h//g}" if g > 1 else f"{w}:{h}"

async def extract_media_from_social_url(url: str, download_to_prompts: bool = True) -> Dict[str, Any]:
    """
    Trích xuất trực tiếp video/ảnh chất lượng cao từ các nền tảng:
    YouTube (4K/Shorts), TikTok (No Watermark), Douyin (1080p Source),
    Instagram (Reels/Post), X/Twitter (Full HD), Google Drive, hoặc direct media link.
    Nếu download_to_prompts=True: tải trực tiếp file về thư mục prompts để phát vĩnh viễn,
    loại bỏ rủi ro link hết hạn (token CDN) và chặn CORS.
    """
    clean_url = clean_video_url(url)
    if not clean_url:
        raise ValueError("Đường dẫn không hợp lệ hoặc rỗng.")

    platform = detect_platform(clean_url)
    loop = asyncio.get_event_loop()

    prompts_dir = os.path.join(DOWNLOADS_DIR, "prompts")
    os.makedirs(prompts_dir, exist_ok=True)

    stream_url = None
    thumbnail_url = ""
    media_type = "video"
    title = ""
    prompt_text = ""
    author = ""
    width = 0
    height = 0
    tags = []

    # 1. NỀN TẢNG: X / TWITTER
    if platform == "x":
        tweet_id_match = re.search(r'(?:status|statuses)/(\d+)', clean_url)
        tweet_id = tweet_id_match.group(1) if tweet_id_match else None
        
        # Thử lấy qua fxtwitter API siêu nhanh và chính xác
        if tweet_id:
            try:
                def _fetch_fxtwitter():
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                        "Accept": "application/json"
                    }
                    return requests.get(f"https://api.fxtwitter.com/status/{tweet_id}", headers=headers, timeout=10)
                
                fx_resp = await loop.run_in_executor(None, _fetch_fxtwitter)
                if fx_resp.status_code == 200:
                    fx_json = fx_resp.json()
                    if fx_json.get("code") == 200:
                        tweet = fx_json.get("tweet", {})
                        prompt_text = tweet.get("text", "")
                        author = tweet.get("author", {}).get("name", "") or tweet.get("author", {}).get("screen_name", "")
                        title = f"X / Twitter (@{tweet.get('author', {}).get('screen_name', author)})"
                        
                        media = tweet.get("media", {})
                        videos = media.get("videos", [])
                        photos = media.get("photos", [])
                        
                        if videos:
                            # Sắp xếp lấy video có chất lượng/bitrate tốt nhất
                            v = videos[0]
                            stream_url = v.get("url")
                            thumbnail_url = v.get("thumbnail_url") or ""
                            media_type = "video"
                            width = v.get("width", 0)
                            height = v.get("height", 0)
                        elif photos:
                            p = photos[0]
                            stream_url = p.get("url")
                            thumbnail_url = p.get("url")
                            media_type = "image"
                            width = p.get("width", 0)
                            height = p.get("height", 0)
            except Exception as fx_err:
                print(f"FxTwitter fetch error: {fx_err}")

    # 2. NỀN TẢNG: DOUYIN (抖音)
    elif platform == "douyin":
        try:
            douyin_res = await loop.run_in_executor(None, scrape_via_douyin, clean_url)
            if douyin_res:
                stream_url = douyin_res.get("download_url")
                thumbnail_url = douyin_res.get("thumbnail") or ""
                media_type = "video"
                prompt_text = douyin_res.get("description") or douyin_res.get("title") or ""
                author = douyin_res.get("uploader") or "Douyin Creator"
                title = douyin_res.get("title") or "Video Douyin"
                width = douyin_res.get("width", 0)
                height = douyin_res.get("height", 0)
                tags = douyin_res.get("hashtags", [])
        except Exception as dy_err:
            print(f"Douyin scrape error: {dy_err}")

    # 3. NỀN TẢNG: TIKTOK
    elif platform == "tiktok":
        try:
            tikwm_res = await loop.run_in_executor(None, scrape_via_tikwm, clean_url)
            if tikwm_res:
                stream_url = tikwm_res.get("download_url")
                thumbnail_url = tikwm_res.get("thumbnail") or ""
                media_type = "video"
                prompt_text = tikwm_res.get("description") or tikwm_res.get("title") or ""
                author = tikwm_res.get("uploader") or "TikTok Creator"
                title = tikwm_res.get("title") or "Video TikTok"
                width = 1080
                height = 1920
                tags = tikwm_res.get("hashtags", [])
        except Exception as tt_err:
            print(f"TikWM scrape error: {tt_err}")

    # 4. NỀN TẢNG: GOOGLE DRIVE
    elif platform == "drive":
        drive_match = re.search(r'[-\w]{25,}', clean_url)
        if drive_match:
            file_id = drive_match.group(0)
            stream_url = f"https://drive.google.com/uc?export=download&id={file_id}"
            thumbnail_url = f"https://lh3.googleusercontent.com/d/{file_id}"
            media_type = "video"
            title = "Video Google Drive"
            author = "Google Drive"

    # 5. NỀN TẢNG: YOUTUBE, INSTAGRAM, HOẶC FALLBACK QUA YT-DLP
    if not stream_url:
        def _extract_via_ydl():
            opts = get_ydl_base_opts()
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(clean_url, download=False)
        
        try:
            info = await loop.run_in_executor(None, _extract_via_ydl)
            if info:
                title = info.get("title") or title or "Video"
                prompt_text = info.get("description") or prompt_text or title
                author = info.get("uploader") or info.get("channel") or author or ""
                thumbnail_url = info.get("thumbnail") or thumbnail_url
                width = info.get("width", 0) or width
                height = info.get("height", 0) or height
                media_type = "video"
                
                # Trích xuất video stream url tốt nhất
                if info.get("url"):
                    stream_url = info.get("url")
                elif info.get("formats"):
                    video_formats = [
                        f for f in info.get("formats", [])
                        if f.get("url") and (f.get("vcodec") != "none" or f.get("ext") in ["mp4", "webm", "mov"])
                    ]
                    if video_formats:
                        video_formats.sort(key=lambda x: (x.get("height") or 0, x.get("tbr") or 0), reverse=True)
                        stream_url = video_formats[0].get("url")
                        if not width and video_formats[0].get("width"):
                            width = video_formats[0].get("width")
                        if not height and video_formats[0].get("height"):
                            height = video_formats[0].get("height")
        except Exception as ydl_err:
            print(f"Yt-dlp fallback error: {ydl_err}")

    # 6. KIỂM TRA NẾU LÀ DIRECT MEDIA FILE (ví dụ file .mp4, .png, .jpg dán trực tiếp)
    if not stream_url:
        lower_url = clean_url.lower()
        if any(lower_url.endswith(ext) or ext in lower_url for ext in [".mp4", ".webm", ".mov", ".mkv"]):
            stream_url = clean_url
            thumbnail_url = thumbnail_url or clean_url
            media_type = "video"
        elif any(lower_url.endswith(ext) or ext in lower_url for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]):
            stream_url = clean_url
            thumbnail_url = clean_url
            media_type = "image"

    if not stream_url and not thumbnail_url:
        raise RuntimeError(f"Không thể trích xuất video hoặc ảnh từ liên kết {platform.upper()}. Hãy đảm bảo liên kết công khai hoặc thử tải file lên trực tiếp.")

    # 7. TỰ ĐỘNG TẢI VỀ THƯ MỤC PROMPTS ĐỂ BẢO ĐẢM KHÔNG BAO GIỜ HẾT HẠN (ZERO LINK EXPIRY)
    downloaded_file = None
    unique_name = f"{int(time.time() * 1000)}_{str(uuid.uuid4())[:8]}"
    ext = ".mp4" if media_type == "video" else ".jpg"
    target_path = os.path.join(prompts_dir, f"{unique_name}{ext}")

    if download_to_prompts:
        # Cách 1: Tải trực tiếp stream qua HTTP requests
        if stream_url:
            def _download_stream():
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                }
                if platform == "tiktok":
                    headers["Referer"] = "https://www.tiktok.com/"
                elif platform == "douyin":
                    headers["Referer"] = "https://www.douyin.com/"
                elif platform == "x":
                    headers["Referer"] = "https://x.com/"
                
                try:
                    resp = requests.get(stream_url, headers=headers, stream=True, timeout=90)
                    if resp.status_code == 200:
                        with open(target_path, "wb") as f_out:
                            for chunk in resp.iter_content(chunk_size=128 * 1024):
                                if chunk:
                                    f_out.write(chunk)
                        if os.path.exists(target_path) and os.path.getsize(target_path) > 1024:
                            return target_path
                except Exception as dl_e:
                    print(f"Direct stream download failed: {dl_e}")
                return None

            downloaded_file = await loop.run_in_executor(None, _download_stream)

        # Cách 2: Nếu tải stream thất bại hoặc YouTube cần merge audio+video: Dùng yt-dlp tải
        if not downloaded_file:
            def _download_via_ydl():
                outtmpl = os.path.join(prompts_dir, f"{unique_name}.%(ext)s")
                opts = {
                    'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                    'outtmpl': outtmpl,
                    'merge_output_format': 'mp4',
                    'quiet': True,
                    'no_warnings': True,
                    'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                }
                ffmpeg_exe = get_ffmpeg_path()
                if ffmpeg_exe:
                    opts['ffmpeg_location'] = ffmpeg_exe
                try:
                    with yt_dlp.YoutubeDL(opts) as ydl:
                        ydl.extract_info(clean_url, download=True)
                    for cand_ext in ['mp4', 'mkv', 'webm', 'mov', 'jpg', 'png']:
                        cand_p = os.path.join(prompts_dir, f"{unique_name}.{cand_ext}")
                        if os.path.exists(cand_p) and os.path.getsize(cand_p) > 1024:
                            return cand_p
                except Exception as dl_err:
                    print(f"Yt-dlp download failed: {dl_err}")
                return None

            downloaded_file = await loop.run_in_executor(None, _download_via_ydl)

    # Tải và lưu ảnh thumbnail cục bộ nếu có
    local_thumb_url = ""
    if thumbnail_url and thumbnail_url.startswith("http"):
        def _save_thumb():
            thumb_path = os.path.join(prompts_dir, f"{unique_name}_thumb.jpg")
            try:
                t_resp = requests.get(thumbnail_url, timeout=15)
                if t_resp.status_code == 200 and len(t_resp.content) > 500:
                    with open(thumb_path, "wb") as tf:
                        tf.write(t_resp.content)
                    return f"/media/downloads/prompts/{unique_name}_thumb.jpg"
            except Exception:
                pass
            return ""
        local_thumb_url = await loop.run_in_executor(None, _save_thumb)

    final_media_url = f"/media/downloads/prompts/{os.path.basename(downloaded_file)}" if downloaded_file else (stream_url or clean_url)
    final_thumbnail_url = local_thumb_url or thumbnail_url or final_media_url
    ratio_str = compute_aspect_ratio_str(width, height)

    if not tags and prompt_text:
        tags = extract_hashtags_from_text(prompt_text)

    return {
        "success": True,
        "platform": platform,
        "media_type": media_type,
        "media_url": final_media_url,
        "stream_url": stream_url,
        "thumbnail_url": final_thumbnail_url,
        "local_path": downloaded_file or "",
        "title": title or "Prompt Media",
        "prompt_text": prompt_text.strip(),
        "width": width,
        "height": height,
        "ratioStr": ratio_str,
        "author": author,
        "tags": tags,
        "source_url": clean_url
    }

