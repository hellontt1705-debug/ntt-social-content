import re
import time
import datetime
from typing import Dict, Any, List, Optional
import requests

from services.downloader import get_sm_session_token, DOUYIN_SESSION

def extract_username_from_url(url: str) -> str:
    """Trích xuất username chuẩn (@username hoặc username) từ đường dẫn TikTok bất kỳ"""
    if not url:
        return ""
    clean = url.strip()
    
    # Dạng @username trực tiếp
    m_at = re.search(r'@([a-zA-Z0-9_.-]+)', clean)
    if m_at:
        return m_at.group(1).rstrip("/.?#")
        
    # Dạng tiktok.com/user_name
    m_url = re.search(r'tiktok\.com/([a-zA-Z0-9_.-]+)', clean)
    if m_url:
        val = m_url.group(1).rstrip("/.?#")
        if val not in ["video", "tag", "music", "discover", "foryou", "live"]:
            return val
            
    # Nếu người dùng chỉ gõ tên tài khoản (không có URL)
    clean_handle = re.sub(r'[^a-zA-Z0-9_.-]', '', clean)
    return clean_handle

def get_timestamp_from_tiktok_id(video_id: str) -> int:
    """
    Thuật toán giải mã TikTok Snowflake ID:
    32 bit đầu tiên của ID 64-bit chính là UNIX timestamp (tính bằng giây) lúc video được tạo.
    """
    try:
        vid_num = int(re.sub(r'\D', '', str(video_id)))
        ts = vid_num >> 32
        # Giới hạn hợp lệ (2016 đến 2038)
        if 1451606400 <= ts <= 2147483647:
            return ts
    except Exception:
        pass
    return 0

def format_timestamp(ts: int) -> Dict[str, Any]:
    """Chuyển đổi timestamp sang chuỗi ngày giờ DD/MM/YYYY HH:mm và tính số ngày đã trôi qua"""
    if not ts or ts <= 0:
        return {
            "date_str": "Không rõ",
            "iso": "",
            "days_ago": -1,
            "relative_str": "Chưa rõ thời gian"
        }
    try:
        dt = datetime.datetime.fromtimestamp(ts)
        now = datetime.datetime.now()
        diff = now - dt
        days_ago = max(0, diff.days)
        
        if days_ago == 0:
            rel_str = "Hôm nay"
        elif days_ago == 1:
            rel_str = "Hôm qua"
        else:
            rel_str = f"{days_ago} ngày trước"
            
        return {
            "date_str": dt.strftime("%d/%m/%Y %H:%M"),
            "iso": dt.strftime("%Y-%m-%d"),
            "days_ago": days_ago,
            "relative_str": rel_str
        }
    except Exception:
        return {
            "date_str": "Không rõ",
            "iso": "",
            "days_ago": -1,
            "relative_str": "Chưa rõ thời gian"
        }

def filter_videos_by_date(
    videos: List[Dict[str, Any]],
    mode: str = "30_days",
    days_limit: int = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Lọc danh sách video theo thời gian:
    - mode == "30_days": Trong vòng 30 ngày gần nhất
    - mode == "7_days": Trong vòng 7 ngày gần nhất
    - mode == "custom": Trong khoảng start_date (YYYY-MM-DD) đến end_date (YYYY-MM-DD)
    - mode == "all": Lấy tất cả không lọc
    """
    if not videos:
        return []
        
    now_ts = int(time.time())
    filtered = []
    
    start_ts = None
    end_ts = None
    
    if mode == "custom" and start_date:
        try:
            # 00:00:00 của ngày bắt đầu
            s_dt = datetime.datetime.strptime(start_date.strip(), "%Y-%m-%d")
            start_ts = int(s_dt.timestamp())
        except Exception:
            start_ts = None
            
    if mode == "custom" and end_date:
        try:
            # 23:59:59 của ngày kết thúc
            e_dt = datetime.datetime.strptime(end_date.strip(), "%Y-%m-%d") + datetime.timedelta(days=1, seconds=-1)
            end_ts = int(e_dt.timestamp())
        except Exception:
            end_ts = None
            
    for v in videos:
        v_ts = v.get("created_at") or get_timestamp_from_tiktok_id(v.get("id") or "")
        
        # Nếu không có timestamp thì giữ lại để người dùng quyết định
        if not v_ts:
            filtered.append(v)
            continue
            
        if mode == "30_days":
            cutoff_ts = now_ts - (30 * 86400)
            if v_ts >= cutoff_ts:
                filtered.append(v)
        elif mode == "7_days":
            cutoff_ts = now_ts - (7 * 86400)
            if v_ts >= cutoff_ts:
                filtered.append(v)
        elif mode == "custom":
            match = True
            if start_ts is not None and v_ts < start_ts:
                match = False
            if end_ts is not None and v_ts > end_ts:
                match = False
            if match:
                filtered.append(v)
        else: # "all"
            filtered.append(v)
            
    # Sắp xếp video mới nhất lên đầu
    filtered.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    return filtered

def scan_tiktok_channel(
    channel_url: str,
    mode: str = "30_days",
    days_limit: int = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Quét thông tin kênh TikTok và danh sách video qua Backend:
    Tự động tính timestamp từ Snowflake ID và lọc theo ngày.
    """
    username = extract_username_from_url(channel_url)
    if not username:
        raise ValueError("Không tìm thấy tên kênh hoặc URL TikTok hợp lệ.")
        
    full_profile_url = f"https://www.tiktok.com/@{username}"
    
    token = get_sm_session_token()
    if not token:
        raise RuntimeError("Không thể khởi tạo phiên kết nối máy chủ phân tích.")
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.smdownloader.com/platforms/tiktok/tiktok-video-downloader",
        "Origin": "https://www.smdownloader.com",
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "x-sd-session": token
    }
    
    resp = DOUYIN_SESSION.post(
        "https://www.smdownloader.com/api/extract",
        json={"url": full_profile_url},
        headers=headers,
        timeout=15
    )
    
    if resp.status_code != 200:
        raise RuntimeError(f"Máy chủ phản hồi mã lỗi {resp.status_code}")
        
    res_json = resp.json()
    if not res_json.get("ok"):
        err_msg = res_json.get("error") or "Không thể lấy danh sách video từ kênh TikTok này."
        raise RuntimeError(err_msg)
        
    data = res_json.get("data", {})
    profile = data.get("profile", {})
    posts = data.get("posts", [])
    
    channel_info = {
        "username": username,
        "nickname": profile.get("fullName") or data.get("title") or username,
        "avatar": profile.get("avatar") or "",
        "biography": profile.get("biography") or data.get("description") or "",
        "profile_url": full_profile_url
    }
    
    raw_videos = []
    for p in posts:
        vid_id = str(p.get("shortcode") or "")
        post_url = p.get("postUrl") or f"https://www.tiktok.com/@{username}/video/{vid_id}"
        caption = p.get("caption") or "Video TikTok"
        cover = p.get("coverUrl") or ""
        
        # Snowflake creation timestamp
        ts = get_timestamp_from_tiktok_id(vid_id)
        fmt = format_timestamp(ts)
        
        raw_videos.append({
            "id": vid_id,
            "url": post_url,
            "title": caption,
            "thumbnail": cover,
            "created_at": ts,
            "date_str": fmt["date_str"],
            "relative_str": fmt["relative_str"],
            "days_ago": fmt["days_ago"],
            "uploader": channel_info["nickname"],
            "uploader_handle": f"@{username}",
            "selected": True
        })
        
    filtered_videos = filter_videos_by_date(
        raw_videos,
        mode=mode,
        days_limit=days_limit,
        start_date=start_date,
        end_date=end_date
    )
    
    return {
        "success": True,
        "channel_info": channel_info,
        "total_scanned": len(raw_videos),
        "total_filtered": len(filtered_videos),
        "filter_mode": mode,
        "date_range": {
            "mode": mode,
            "days_limit": days_limit,
            "start_date": start_date or "",
            "end_date": end_date or ""
        },
        "videos": filtered_videos
    }

def ingest_scanned_channel_items(
    items: List[Dict[str, Any]],
    channel_url_or_handle: str = "",
    mode: str = "30_days",
    days_limit: int = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Xử lý danh sách video thu thập được từ Trình duyệt (Bookmarklet/Extension hoặc dán danh sách):
    Tự động trích xuất ID, bóc tách Snowflake Timestamp, và áp dụng bộ lọc ngày.
    """
    processed = []
    seen_urls = set()
    
    username = extract_username_from_url(channel_url_or_handle)
    
    for item in items:
        # Hỗ trợ cả item dạng dict hoặc chuỗi url đơn giản
        if isinstance(item, str):
            raw_url = item.strip()
            caption = "Video TikTok"
            thumb = ""
            views = 0
            likes = 0
        else:
            raw_url = item.get("url") or item.get("link") or ""
            caption = item.get("caption") or item.get("title") or "Video TikTok"
            thumb = item.get("thumb") or item.get("thumbnail") or item.get("cover") or ""
            views = item.get("views") or 0
            likes = item.get("likes") or 0
            
        clean_url = raw_url.split("?")[0].split("#")[0]
        if not clean_url or clean_url in seen_urls:
            continue
        seen_urls.add(clean_url)
        
        # Trích xuất video id
        vid_match = re.search(r'video/(\d+)', clean_url) or re.search(r'v/(\d+)', clean_url) or re.search(r'photo/(\d+)', clean_url)
        vid_id = vid_match.group(1) if vid_match else ""
        
        # Nếu chưa có username, trích xuất từ link
        if not username:
            u_match = re.search(r'@([a-zA-Z0-9_.-]+)', clean_url)
            if u_match:
                username = u_match.group(1)
                
        # Tính toán timestamp từ snowflake ID hoặc item
        item_ts = 0
        if isinstance(item, dict) and item.get("createTime"):
            item_ts = int(item["createTime"])
        elif isinstance(item, dict) and item.get("created_at"):
            item_ts = int(item["created_at"])
        elif vid_id:
            item_ts = get_timestamp_from_tiktok_id(vid_id)
            
        fmt = format_timestamp(item_ts)
        
        processed.append({
            "id": vid_id or str(len(processed) + 1),
            "url": clean_url,
            "title": caption,
            "thumbnail": thumb,
            "created_at": item_ts,
            "date_str": fmt["date_str"],
            "relative_str": fmt["relative_str"],
            "days_ago": fmt["days_ago"],
            "views": views,
            "likes": likes,
            "uploader": f"@{username}" if username else "Kênh TikTok",
            "uploader_handle": f"@{username}" if username else "",
            "selected": True
        })
        
    filtered = filter_videos_by_date(
        processed,
        mode=mode,
        days_limit=days_limit,
        start_date=start_date,
        end_date=end_date
    )
    
    return {
        "success": True,
        "channel_info": {
            "username": username or "tiktok_channel",
            "nickname": f"@{username}" if username else "Kênh TikTok",
            "profile_url": f"https://www.tiktok.com/@{username}" if username else ""
        },
        "total_scanned": len(processed),
        "total_filtered": len(filtered),
        "filter_mode": mode,
        "date_range": {
            "mode": mode,
            "days_limit": days_limit,
            "start_date": start_date or "",
            "end_date": end_date or ""
        },
        "videos": filtered
    }

def get_channel_bookmarklet_code(api_host: str = "localhost:8000") -> str:
    """
    Tạo đoạn mã Bookmarklet JavaScript cực kỳ tối ưu:
    Khi người dùng mở tab kênh TikTok trên Cốc Cốc / Chrome, chỉ cần nhấn Bookmarklet:
    - Script sẽ tự động cuộn trang êm ái để thu thập video
    - Dừng lại ngay khi gặp video vượt quá 30 ngày (tiết kiệm thời gian)
    - Tự động chuyển toàn bộ danh sách về SocialContent OS để tải hàng loạt!
    """
    js = f"""(function(){{
  if (!location.hostname.includes('tiktok.com')) {{
    alert('Vui lòng mở một trang kênh TikTok (tiktok.com/@username) trước khi bấm Bookmarklet này!');
    return;
  }}
  
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;background:#1e1b4b;color:#fff;padding:16px 20px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-family:sans-serif;font-size:14px;border:1px solid #8b5cf6;max-width:380px;line-height:1.5;';
  toast.innerHTML = '⚡ <b>SocialContent OS</b>: Đang quét video kênh trong phạm vi 30 ngày...<br><span id="sc-os-status">Đang đọc bài đăng...</span>';
  document.body.appendChild(toast);
  
  const updateStatus = (txt) => {{
    const s = document.getElementById('sc-os-status');
    if (s) s.textContent = txt;
  }};
  
  const nowTs = Math.floor(Date.now() / 1000);
  const cutoff30d = nowTs - (30 * 86400);
  const seen = new Set();
  const collected = [];
  let reachedLimit = false;
  let scrollCount = 0;
  
  function harvest() {{
    const cards = Array.from(document.querySelectorAll('[data-e2e="user-post-item"], [data-e2e="user-post-item-list"] [class*="DivItemContainer"], [class*="DivVideoFeedV2"] [class*="DivItemContainer"], a[href*="/video/"]'));
    for (const card of cards) {{
      const a = (card.tagName === 'A' && card.href.includes('/video/')) ? card : card.querySelector('a[href*="/video/"]');
      if (!a) continue;
      const url = a.href.split('?')[0].split('#')[0];
      if (seen.has(url)) continue;
      seen.add(url);
      
      const m = url.match(/video\\/(\\d+)/);
      const vidId = m ? m[1] : '';
      let ts = 0;
      if (vidId) {{
        try {{
          ts = Number(BigInt(vidId) >> 32n);
        }} catch(e) {{}}
      }}
      
      const img = card.querySelector('img');
      const thumb = img ? (img.src || img.getAttribute('data-src') || '') : '';
      const title = (img && img.alt ? img.alt.trim() : '') || (card.querySelector('[data-e2e="user-post-item-desc"]')?.textContent?.trim()) || 'Video TikTok';
      
      if (ts > 0 && ts < cutoff30d) {{
        reachedLimit = true;
      }}
      
      collected.push({{
        id: vidId,
        url: url,
        title: title,
        thumb: thumb,
        createTime: ts
      }});
    }}
  }}
  
  function finish() {{
    updateStatus(`Đã quét xong: ${{collected.length}} video! Đang chuyển dữ liệu sang SocialContent OS...`);
    
    // Gửi trực tiếp sang API SocialContent OS
    fetch('http://{api_host}/api/tiktok/channel/ingest', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json' }},
      body: JSON.stringify({{
        items: collected,
        channel_url: location.href,
        mode: '30_days',
        days_limit: 30
      }})
    }}).then(res => res.json()).then(data => {{
      toast.style.background = '#065f46';
      toast.style.borderColor = '#10b981';
      toast.innerHTML = `✅ <b>Quét kênh thành công!</b><br>Đã tìm thấy ${{data.total_scanned}} video (${{data.total_filtered}} video trong 30 ngày).<br><br>👉 Hãy chuyển sang tab <b>SocialContent OS</b> để bấm Tải về!`;
      setTimeout(() => toast.remove(), 8000);
    }}).catch(err => {{
      // Fallback nếu API backend không nhận CORS trực tiếp: Copy vào Clipboard
      const jsonStr = JSON.stringify(collected);
      navigator.clipboard.writeText(jsonStr).then(() => {{
        toast.style.background = '#7c2d12';
        toast.innerHTML = `📋 <b>Đã sao chép ${{collected.length}} video vào bộ nhớ đệm!</b><br>Chuyển sang tab SocialContent OS và dán vào ô 'Dán danh sách' để tải nhé!`;
        setTimeout(() => toast.remove(), 8000);
      }});
    }});
  }}
  
  function step() {{
    harvest();
    updateStatus(`Đã tìm thấy ${{collected.length}} video...`);
    if (reachedLimit || scrollCount >= 25) {{
      finish();
      return;
    }}
    scrollCount++;
    window.scrollTo(0, document.body.scrollHeight);
    setTimeout(step, 800);
  }}
  
  step();
}})();"""
    # Clean bookmarklet javascript url
    compressed = "javascript:" + re.sub(r'\s+', ' ', js).strip()
    return compressed
