import re
import json
import requests
from typing import Dict, Any, Optional
import yt_dlp
from bs4 import BeautifulSoup

# Mobile headers for platforms that serve full metadata or SSR data to mobile (TikTok, Instagram)
MOBILE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
}

# Desktop headers for platforms like YouTube
DESKTOP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
}

def parse_metric_number(val: Any) -> int:
    """Chuyển đổi số liệu dạng text như '334 N', ', 561', '1.5K', '2.3M', '14' sang số nguyên"""
    if val is None:
        return 0
    if isinstance(val, (int, float)):
        return int(val)
    
    s = str(val).strip()
    s = re.sub(r'^[^\d]+', '', s)
    m = re.search(r'([\d\.,]+)\s*([a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]*)', s)
    if not m:
        return 0
    num_str = m.group(1).replace(' ', '')
    if ',' in num_str and '.' not in num_str:
        parts = num_str.split(',')
        if len(parts) == 2 and len(parts[1]) <= 2:
            num_str = num_str.replace(',', '.')
        else:
            num_str = num_str.replace(',', '')
    else:
        num_str = num_str.replace(',', '')
        
    try:
        num = float(num_str)
    except Exception:
        return 0
    
    unit = m.group(2).lower().strip()
    if unit in ['k', 'n', 'nghìn', 'ngàn']:
        return int(num * 1000)
    elif unit in ['m', 'tr', 'triệu']:
        return int(num * 1000000)
    elif unit in ['b', 'tỷ', 'tỉ']:
        return int(num * 1000000000)
    return int(num)

def detect_platform(url: str) -> str:
    """Phát hiện nền tảng từ URL"""
    u = (url or "").lower()
    if "douyin.com" in u or "iesdouyin.com" in u:
        return "douyin"
    elif "youtube.com" in u or "youtu.be" in u:
        return "youtube"
    elif "tiktok.com" in u or ("@" in u and "instagram" not in u and "twitter" not in u and "x.com" not in u and "douyin" not in u):
        return "tiktok"
    elif "instagram.com" in u:
        return "instagram"
    elif "facebook.com" in u or "fb.com" in u or "fb.watch" in u:
        return "facebook"
    elif "twitter.com" in u or "x.com" in u:
        return "x"
    return "other"

def fetch_youtube_channel_info(url: str) -> Dict[str, Any]:
    """Bóc tách thông tin & số liệu kênh YouTube real-time"""
    result = {
        "platform": "youtube",
        "name": "",
        "handle": "",
        "url": url,
        "avatar_url": "",
        "followers_count": 0,
        "posts_count": 0,
        "views_count": 0,
        "bio": ""
    }
    
    # 1. Cào trực tiếp qua YouTube HTML & ytInitialData
    try:
        resp = requests.get(url, headers=DESKTOP_HEADERS, timeout=12)
        if resp.status_code == 200:
            html = resp.text
            
            # Trích xuất ytInitialData
            m = re.search(r'var ytInitialData = ({.*?});</script>', html)
            if m:
                try:
                    d = json.loads(m.group(1))
                    header = d.get("header", {}).get("pageHeaderRenderer", {}).get("content", {}).get("pageHeaderViewModel", {})
                    
                    # Title
                    title = header.get("title", {}).get("dynamicTextViewModel", {}).get("text", {}).get("content", "")
                    if title:
                        result["name"] = title.strip()
                        
                    # Avatar
                    avatar_sources = header.get("image", {}).get("decoratedAvatarViewModel", {}).get("avatar", {}).get("avatarViewModel", {}).get("image", {}).get("sources", [])
                    if avatar_sources:
                        result["avatar_url"] = avatar_sources[-1].get("url", "")
                        
                    # Metadata rows (handle, subscribers, videos)
                    metadata_rows = header.get("metadata", {}).get("contentMetadataViewModel", {}).get("metadataRows", [])
                    for row in metadata_rows:
                        for part in row.get("metadataParts", []):
                            text = part.get("text", {}).get("content", "").strip()
                            if text.startswith("@"):
                                result["handle"] = text
                            elif "đăng ký" in text.lower() or "subscriber" in text.lower():
                                result["followers_count"] = parse_metric_number(text)
                            elif "video" in text.lower():
                                result["posts_count"] = parse_metric_number(text)
                                
                    # Bio
                    bio = header.get("description", {}).get("descriptionPreviewViewModel", {}).get("description", {}).get("content", "")
                    if bio:
                        result["bio"] = bio.strip()
                except Exception as ex:
                    print(f"Error parsing YouTube ytInitialData: {ex}")

            # Fallbacks: Meta tags
            soup = BeautifulSoup(html, 'html.parser')
            if not result["name"]:
                og_title = soup.find("meta", property="og:title")
                if og_title and og_title.get("content"):
                    result["name"] = og_title["content"].strip()
                    
            if not result["avatar_url"]:
                og_image = soup.find("meta", property="og:image")
                if og_image and og_image.get("content"):
                    result["avatar_url"] = og_image["content"]
                    
            if not result["bio"]:
                og_desc = soup.find("meta", property="og:description")
                if og_desc and og_desc.get("content"):
                    result["bio"] = og_desc["content"].strip()
                    
            if not result["handle"]:
                m_handle = re.search(r'@([a-zA-Z0-9_.-]+)', url)
                if m_handle:
                    result["handle"] = f"@{m_handle.group(1)}"
    except Exception as e:
        print(f"Error scraping YouTube HTML: {e}")

    # 2. Nếu thiếu dữ liệu (ví dụ avatar hoặc followers), dùng yt-dlp hỗ trợ
    if not result["name"] or result["followers_count"] == 0:
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True,
                'playlist_items': '1',
                'skip_download': True
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if info:
                    if not result["name"]:
                        result["name"] = info.get("channel") or info.get("uploader") or info.get("title") or ""
                    if not result["handle"]:
                        h = info.get("uploader_id") or info.get("channel_id") or ""
                        result["handle"] = f"@{h}" if h and not h.startswith("@") else h
                    if not result["avatar_url"]:
                        thumbs = info.get("thumbnails") or []
                        if thumbs:
                            result["avatar_url"] = thumbs[-1].get("url", "")
                    if result["followers_count"] == 0 and info.get("channel_follower_count"):
                        result["followers_count"] = info.get("channel_follower_count")
                    if not result["bio"] and info.get("description"):
                        result["bio"] = info.get("description")
        except Exception as e:
            print(f"Error scraping YouTube yt-dlp: {e}")
            
    return result

def fetch_tiktok_channel_info(url: str) -> Dict[str, Any]:
    """Bóc tách thông tin & số liệu kênh TikTok real-time"""
    result = {
        "platform": "tiktok",
        "name": "",
        "handle": "",
        "url": url,
        "avatar_url": "",
        "followers_count": 0,
        "following_count": 0,
        "likes_count": 0,
        "posts_count": 0,
        "bio": ""
    }
    
    # Trích xuất username
    clean_url = url.strip()
    m_handle = re.search(r'@([a-zA-Z0-9_.-]+)', clean_url)
    username = m_handle.group(1) if m_handle else clean_url.split("/")[-1].replace("@", "")
    username = username.split("?")[0].split("#")[0]
    result["handle"] = f"@{username}"
    target_url = f"https://www.tiktok.com/@{username}"
    result["url"] = target_url

    # 1. Cào trực tiếp qua TikTok Mobile Web (Cung cấp __UNIVERSAL_DATA_FOR_REHYDRATION__ đầy đủ nhất)
    try:
        resp = requests.get(target_url, headers=MOBILE_HEADERS, timeout=12)
        if resp.status_code == 200:
            html = resp.text
            
            # Trích xuất __UNIVERSAL_DATA_FOR_REHYDRATION__
            m = re.search(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', html)
            if m:
                try:
                    data = json.loads(m.group(1))
                    user_detail = data.get("__DEFAULT_SCOPE__", {}).get("webapp.user-detail", {})
                    user_info = user_detail.get("userInfo", {})
                    user_obj = user_info.get("user", {})
                    stats_obj = user_info.get("stats", {})
                    
                    if user_obj:
                        result["name"] = user_obj.get("nickname") or username
                        result["avatar_url"] = user_obj.get("avatarLarger") or user_obj.get("avatarMedium") or user_obj.get("avatarThumb") or ""
                        result["bio"] = user_obj.get("signature") or ""
                        if user_obj.get("uniqueId"):
                            result["handle"] = f"@{user_obj.get('uniqueId')}"
                            
                    if stats_obj:
                        result["followers_count"] = stats_obj.get("followerCount") or 0
                        result["following_count"] = stats_obj.get("followingCount") or 0
                        result["likes_count"] = stats_obj.get("heartCount") or stats_obj.get("heart") or 0
                        result["posts_count"] = stats_obj.get("videoCount") or 0
                except Exception as ex:
                    print(f"Error parsing TikTok mobile JSON: {ex}")

            # Fallback nếu chưa có: Meta tags & HTML
            soup = BeautifulSoup(html, 'html.parser')
            if not result["name"]:
                og_title = soup.find("meta", property="og:title")
                if og_title and og_title.get("content"):
                    t = og_title["content"].split("(")[0].strip()
                    result["name"] = t or username
                    
            if not result["avatar_url"]:
                og_image = soup.find("meta", property="og:image")
                if og_image and og_image.get("content"):
                    result["avatar_url"] = og_image["content"]
                    
            if result["followers_count"] == 0:
                og_desc = soup.find("meta", property="og:description")
                if og_desc and og_desc.get("content"):
                    desc = og_desc["content"]
                    m_following = re.search(r'([\d\.,\s]+(?:N|K|M|tr)?)\s*Following', desc, re.IGNORECASE)
                    if m_following:
                        result["following_count"] = parse_metric_number(m_following.group(1))
                    m_follower = re.search(r'([\d\.,\s]+(?:N|K|M|tr)?)\s*Followers', desc, re.IGNORECASE)
                    if m_follower:
                        result["followers_count"] = parse_metric_number(m_follower.group(1))
                    m_likes = re.search(r'([\d\.,\s]+(?:N|K|M|tr)?)\s*Likes', desc, re.IGNORECASE)
                    if m_likes:
                        result["likes_count"] = parse_metric_number(m_likes.group(1))
    except Exception as e:
        print(f"Error scraping TikTok mobile: {e}")

    # 2. Fallback: TikTok oEmbed
    if not result["name"] or result["name"] == username:
        try:
            oembed_res = requests.get(f"https://www.tiktok.com/oembed?url={target_url}", timeout=8)
            if oembed_res.status_code == 200:
                oe_data = oembed_res.json()
                if oe_data.get("author_name"):
                    result["name"] = oe_data["author_name"]
        except Exception:
            pass

    if not result["name"]:
        result["name"] = username
        
    return result

def fetch_instagram_channel_info(url: str) -> Dict[str, Any]:
    """Bóc tách thông tin & số liệu Instagram real-time qua Mobile SSR Meta tags"""
    result = {
        "platform": "instagram",
        "name": "",
        "handle": "",
        "url": url,
        "avatar_url": "",
        "followers_count": 0,
        "following_count": 0,
        "posts_count": 0,
        "likes_count": 0,
        "bio": ""
    }
    
    clean_url = url.strip()
    m_handle = re.search(r'instagram\.com/([a-zA-Z0-9_.-]+)', clean_url)
    username = m_handle.group(1) if m_handle else clean_url.replace("@", "").split("/")[-1]
    username = username.split("?")[0].split("#")[0]
    result["handle"] = f"@{username}"
    target_url = f"https://www.instagram.com/{username}/"
    result["url"] = target_url
    
    try:
        ig_headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
        }
        resp = requests.get(target_url, headers=ig_headers, timeout=12)
        if resp.status_code == 200:
            html = resp.text
            soup = BeautifulSoup(html, 'html.parser')
            
            # og:title: "Tuấn Tàii (@nger_tt) • Instagram photos and videos"
            og_title = soup.find("meta", property="og:title")
            if og_title and og_title.get("content"):
                t = og_title["content"].split("(@")[0].strip()
                result["name"] = t or username
                
            og_image = soup.find("meta", property="og:image")
            if og_image and og_image.get("content"):
                result["avatar_url"] = og_image["content"]
                
            # og:description: "14 Followers, 561 Following, 0 Posts - See Instagram photos and videos from Tuấn Tàii (@nger_tt)"
            og_desc = soup.find("meta", property="og:description")
            if og_desc and og_desc.get("content"):
                desc = og_desc["content"]
                m_follower = re.search(r'([\d\.,\s]+(?:N|K|M|tr)?)\s*(?:Followers|người theo dõi)', desc, re.IGNORECASE)
                if m_follower:
                    result["followers_count"] = parse_metric_number(m_follower.group(1))
                    
                m_following = re.search(r'([\d\.,\s]+(?:N|K|M|tr)?)\s*(?:Following|đang theo dõi)', desc, re.IGNORECASE)
                if m_following:
                    result["following_count"] = parse_metric_number(m_following.group(1))
                    
                m_posts = re.search(r'([\d\.,\s]+(?:N|K|M|tr)?)\s*(?:Posts|bài viết|bài đăng)', desc, re.IGNORECASE)
                if m_posts:
                    result["posts_count"] = parse_metric_number(m_posts.group(1))
                    
            desc_tag = soup.find("meta", attrs={"name": "description"})
            if desc_tag and desc_tag.get("content") and not result["bio"]:
                result["bio"] = desc_tag["content"].strip()
    except Exception as e:
        print(f"Error scraping Instagram: {e}")
        
    if not result["name"]:
        result["name"] = username
        
    return result

def fetch_x_channel_info(url: str) -> Dict[str, Any]:
    """Bóc tách thông tin kênh X (Twitter)"""
    result = {
        "platform": "x",
        "name": "",
        "handle": "",
        "url": url,
        "avatar_url": "",
        "followers_count": 0,
        "following_count": 0,
        "posts_count": 0,
        "likes_count": 0,
        "bio": ""
    }
    clean_url = url.strip()
    m_handle = re.search(r'(?:twitter\.com|x\.com)/([a-zA-Z0-9_]+)', clean_url)
    username = m_handle.group(1) if m_handle else clean_url.replace("@", "").split("/")[-1]
    username = username.split("?")[0].split("#")[0]
    result["handle"] = f"@{username}"
    target_url = f"https://x.com/{username}"
    result["url"] = target_url
    
    try:
        resp = requests.get(target_url, headers=MOBILE_HEADERS, timeout=12)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            og_title = soup.find("meta", property="og:title")
            if og_title and og_title.get("content"):
                result["name"] = og_title["content"].split("(@")[0].strip()
            og_image = soup.find("meta", property="og:image")
            if og_image and og_image.get("content"):
                result["avatar_url"] = og_image["content"]
            og_desc = soup.find("meta", property="og:description")
            if og_desc and og_desc.get("content"):
                result["bio"] = og_desc["content"].strip()
    except Exception as e:
        print(f"Error scraping X: {e}")
        
    if not result["name"]:
        result["name"] = username
    return result

def fetch_douyin_channel_info(url: str) -> Dict[str, Any]:
    """Bóc tách thông tin & số liệu kênh Douyin real-time qua SMDownloader & Video Resolver"""
    from services.downloader import get_sm_session_token, DOUYIN_SESSION, scrape_via_douyin

    result = {
        "platform": "douyin",
        "name": "",
        "handle": "",
        "url": url,
        "avatar_url": "",
        "followers_count": 0,
        "following_count": 0,
        "likes_count": 0,
        "posts_count": 0,
        "views_count": 0,
        "bio": ""
    }

    clean_url = (url or "").strip()
    sec_uid = ""
    vid = ""

    # Trích xuất vid nếu có trong query hoặc url
    m_vid = re.search(r'vid=(\d+)', clean_url) or re.search(r'modal_id=(\d+)', clean_url) or re.search(r'douyin\.com/video/(\d+)', clean_url)
    if m_vid:
        vid = m_vid.group(1)

    # Trích xuất sec_uid từ user/([a-zA-Z0-9_\-]+)
    m_sec = re.search(r'douyin\.com/user/([a-zA-Z0-9_\-]+)', clean_url)
    if m_sec:
        sec_uid = m_sec.group(1)
    elif "v.douyin.com" in clean_url or "iesdouyin.com" in clean_url:
        try:
            resp = DOUYIN_SESSION.get(clean_url, headers=MOBILE_HEADERS, allow_redirects=False, timeout=6)
            loc = resp.headers.get("Location") or resp.headers.get("location") or ""
            m_sec_loc = re.search(r'user/([a-zA-Z0-9_\-]+)', loc)
            if m_sec_loc:
                sec_uid = m_sec_loc.group(1)
            if not vid:
                m_vid_loc = re.search(r'video/(\d+)', loc) or re.search(r'modal_id=(\d+)', loc)
                if m_vid_loc:
                    vid = m_vid_loc.group(1)
        except Exception as e:
            print(f"Error resolving short Douyin link: {e}")

    target_profile_url = f"https://www.douyin.com/user/{sec_uid}" if sec_uid else clean_url
    result["url"] = target_profile_url

    # 1. Thử lấy thông tin qua SMDownloader session API
    try:
        token = get_sm_session_token()
        if token and sec_uid:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": "https://www.smdownloader.com/platforms/douyin/douyin-video-downloader",
                "Origin": "https://www.smdownloader.com",
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                "x-sd-session": token
            }
            r = DOUYIN_SESSION.post("https://www.smdownloader.com/api/extract", json={"url": target_profile_url}, headers=headers, timeout=12)
            if r.status_code == 200:
                res_json = r.json()
                if res_json.get("ok"):
                    data = res_json.get("data", {})
                    profile = data.get("profile", {})
                    result["name"] = profile.get("fullName") or data.get("title") or ""
                    result["handle"] = profile.get("username") or sec_uid
                    result["avatar_url"] = profile.get("profilePicUrl") or profile.get("avatar") or ""
                    result["bio"] = profile.get("biography") or data.get("description") or ""
                    result["posts_count"] = int(profile.get("totalPosts") or 0)
                    result["followers_count"] = int(profile.get("followerCount") or 0)
                    result["following_count"] = int(profile.get("followingCount") or 0)
                    result["likes_count"] = int(profile.get("likesCount") or 0)
    except Exception as e:
        print(f"Error fetching Douyin channel via SM: {e}")

    # 2. Nếu có vid hoặc thông tin còn thiếu, truy vấn thêm video để bổ sung tên tác giả & avatar
    if vid and (not result["name"] or not result["avatar_url"]):
        try:
            v_info = scrape_via_douyin(f"https://www.douyin.com/video/{vid}")
            if v_info:
                if not result["name"] and v_info.get("uploader"):
                    result["name"] = v_info["uploader"]
                if not result["handle"] and v_info.get("uploader"):
                    result["handle"] = v_info["uploader"]
                if not result["avatar_url"] and v_info.get("thumbnail"):
                    result["avatar_url"] = v_info["thumbnail"]
        except Exception as e:
            print(f"Error scraping Douyin video fallback: {e}")

    # 3. Fallback tên nếu vẫn trống
    if not result["name"]:
        result["name"] = f"Kênh Douyin ({sec_uid[:10]}...)" if sec_uid else "Kênh Douyin"
    if not result["handle"] and sec_uid:
        result["handle"] = sec_uid

    return result

def fetch_channel_info(url: str, platform: Optional[str] = None) -> Dict[str, Any]:
    """Hàm tổng quát để bóc tách thông tin kênh từ URL bất kỳ với dữ liệu thật real-time"""
    detected = platform or detect_platform(url)
    
    if detected == "douyin":
        data = fetch_douyin_channel_info(url)
    elif detected == "youtube":
        data = fetch_youtube_channel_info(url)
    elif detected == "tiktok":
        data = fetch_tiktok_channel_info(url)
    elif detected == "instagram":
        data = fetch_instagram_channel_info(url)
    elif detected == "x":
        data = fetch_x_channel_info(url)
    else:
        data = {
            "platform": detected,
            "name": url.split("/")[-1] or "Kênh mới",
            "handle": "",
            "url": url,
            "avatar_url": "",
            "followers_count": 0,
            "following_count": 0,
            "likes_count": 0,
            "posts_count": 0,
            "views_count": 0,
            "bio": ""
        }
        try:
            resp = requests.get(url, headers=MOBILE_HEADERS, timeout=10)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                og_title = soup.find("meta", property="og:title")
                if og_title and og_title.get("content"):
                    data["name"] = og_title["content"].strip()
                og_image = soup.find("meta", property="og:image")
                if og_image and og_image.get("content"):
                    data["avatar_url"] = og_image["content"]
                og_desc = soup.find("meta", property="og:description")
                if og_desc and og_desc.get("content"):
                    data["bio"] = og_desc["content"].strip()
        except Exception:
            pass
            
    return data
