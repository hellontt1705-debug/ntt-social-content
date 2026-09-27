import re
import time
import datetime
from typing import Dict, Any, List, Optional
import requests

from services.downloader import get_sm_session_token, DOUYIN_SESSION

def extract_collection_info(url: str) -> Optional[Dict[str, str]]:
    """Trích xuất username, collection_slug, collection_id từ đường dẫn bộ sưu tập TikTok"""
    if not url:
        return None
    # Hỗ trợ định dạng: https://www.tiktok.com/@username/collection/collection-slug-collectionId
    m = re.search(r'@([a-zA-Z0-9_.-]+)/collection/([^/?#]+)-(\d+)', url)
    if m:
        return {
            "username": m.group(1),
            "collection_slug": m.group(2),
            "collection_id": m.group(3)
        }
    m2 = re.search(r'@([a-zA-Z0-9_.-]+)/collection/([^/?#]+)', url)
    if m2:
        return {
            "username": m2.group(1),
            "collection_slug": m2.group(2),
            "collection_id": ""
        }
    return None

def extract_username_from_url(url: str) -> str:
    """Trích xuất username chuẩn (@username hoặc username) từ đường dẫn TikTok bất kỳ"""
    if not url:
        return ""
    clean = url.strip()
    
    # Kiểm tra nếu là link bộ sưu tập
    col = extract_collection_info(clean)
    if col:
        return col["username"]

    # Dạng @username trực tiếp
    m_at = re.search(r'@([a-zA-Z0-9_.-]+)', clean)
    if m_at:
        return m_at.group(1).rstrip("/.?#")
        
    # Dạng tiktok.com/user_name
    m_url = re.search(r'tiktok\.com/([a-zA-Z0-9_.-]+)', clean)
    if m_url:
        val = m_url.group(1).rstrip("/.?#")
        if val not in ["video", "tag", "music", "discover", "foryou", "live", "collection"]:
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
    col_info = extract_collection_info(channel_url)
    if col_info or "/collection/" in channel_url:
        col_slug = col_info.get("collection_slug", "Bộ sưu tập") if col_info else "Bộ sưu tập"
        u_name = col_info.get("username", "") if col_info else ""
        raise ValueError(
            f"Phát hiện liên kết Bộ sưu tập TikTok: '{col_slug}' (Tài khoản: @{u_name}). "
            "Vì mục Favorites / Bộ sưu tập trên TikTok được bảo mật riêng theo phiên đăng nhập của tài khoản, "
            "máy chủ không thể quét trực tiếp từ xa. "
            "👉 Bạn chỉ cần bấm nút 'Sao chép mã 1-Click' bên dưới, chuyển sang tab TikTok đang mở trên trình duyệt (F12 -> Console -> Dán mã) để quét 100% video và nạp vào đây ngay lập tức!"
        )

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
    end_date: Optional[str] = None,
    is_collection: bool = False,
    collection_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Xử lý danh sách video thu thập được từ Trình duyệt (Bookmarklet/Extension hoặc dán danh sách):
    Tự động trích xuất ID, bóc tách Snowflake Timestamp, và áp dụng bộ lọc ngày.
    Hỗ trợ cả Kênh thường, Mục yêu thích (Favorites) và Bộ sưu tập (Collections).
    """
    processed = []
    seen_urls = set()
    
    col_info = extract_collection_info(channel_url_or_handle)
    if col_info or "/collection/" in channel_url_or_handle:
        is_collection = True
        if col_info:
            username = col_info["username"]
            collection_name = collection_name or col_info["collection_slug"]
        else:
            username = extract_username_from_url(channel_url_or_handle)
    else:
        username = extract_username_from_url(channel_url_or_handle)
        
    # Đối với Bộ sưu tập hoặc Favorites, mặc định lấy toàn bộ (all) để không làm mất video cũ đã lưu
    if is_collection and mode == "30_days":
        mode = "all"
    
    for item in items:
        # Hỗ trợ cả item dạng dict hoặc chuỗi url đơn giản
        if isinstance(item, str):
            raw_url = item.strip()
            caption = "Video TikTok"
            thumb = ""
            views = 0
            likes = 0
            item_uploader = ""
        else:
            raw_url = item.get("url") or item.get("link") or ""
            caption = item.get("caption") or item.get("title") or "Video TikTok"
            thumb = item.get("thumb") or item.get("thumbnail") or item.get("cover") or ""
            views = item.get("views") or 0
            likes = item.get("likes") or 0
            item_uploader = item.get("uploader") or ""
            
        clean_url = raw_url.split("?")[0].split("#")[0]
        if not clean_url or clean_url in seen_urls:
            continue
        seen_urls.add(clean_url)
        
        # Trích xuất video id
        vid_match = re.search(r'(?:video|photo)/(\d+)', clean_url) or re.search(r'v/(\d+)', clean_url)
        vid_id = vid_match.group(1) if vid_match else ""
        
        # Trích xuất tác giả thực sự của video
        u_match = re.search(r'@([a-zA-Z0-9_.-]+)', clean_url)
        video_author = ""
        if u_match:
            video_author = f"@{u_match.group(1)}"
        elif item_uploader:
            video_author = item_uploader if item_uploader.startswith("@") else f"@{item_uploader}"
        elif username:
            video_author = f"@{username}"
        else:
            video_author = "TikTok Creator"
                
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
            "uploader": video_author,
            "uploader_handle": video_author,
            "selected": True
        })
        
    filtered = filter_videos_by_date(
        processed,
        mode=mode,
        days_limit=days_limit,
        start_date=start_date,
        end_date=end_date
    )
    
    if is_collection:
        nickname = f"Bộ sưu tập: {collection_name or 'Yêu thích'}" + (f" (@{username})" if username else "")
    else:
        nickname = f"@{username}" if username else "Kênh TikTok"
    
    return {
        "success": True,
        "is_collection": is_collection,
        "collection_name": collection_name or "",
        "channel_info": {
            "username": username or "tiktok_channel",
            "nickname": nickname,
            "profile_url": channel_url_or_handle or (f"https://www.tiktok.com/@{username}" if username else ""),
            "is_collection": is_collection,
            "collection_name": collection_name or ""
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
    Tạo đoạn mã Bookmarklet & Console JavaScript 1-Click cực kỳ thông minh:
    Khi người dùng mở tab kênh TikTok hoặc tab Bộ sưu tập Yêu thích (Collection / Favorites):
    - Tự động nhận diện loại trang (Kênh, Bộ sưu tập chi tiết, hoặc Danh sách Yêu thích)
    - Tự động bóc tách tên bộ sưu tập và tác giả
    - Thu thập toàn bộ video (link gốc, tiêu đề, ảnh bìa, tác giả thực sự, ngày đăng từ Snowflake ID)
    - Đối với Bộ sưu tập / Favorites: Không giới hạn 30 ngày, tự động dừng ngay khi lấy đủ số lượng video
    - Tự động đẩy dữ liệu sang SocialContent OS qua API Ingest & WebSocket Realtime
    - Cung cấp nút sao chép 1-click dự phòng trực tiếp trên màn hình TikTok.
    """
    js = f"""(function(){{
  if (!location.hostname.includes('tiktok.com')) {{
    alert('Vui lòng mở một trang TikTok (Kênh hoặc Bộ sưu tập Yêu thích) trước khi chạy mã này!');
    return;
  }}
  
  const isCollection = location.pathname.includes('/collection/');
  const isFavorites = location.pathname.includes('/favorite') || location.href.includes('#favorite') || !!document.querySelector('[data-e2e="favorites-tab"][aria-selected="true"]');
  
  let pageTitle = '';
  let collectionSlug = '';
  if (isCollection) {{
    const colMatch = location.pathname.match(/\\/collection\\/([^\\/?#]+)-(\\d+)/) || location.pathname.match(/\\/collection\\/([^\\/?#]+)/);
    if (colMatch) {{
      try {{ collectionSlug = decodeURIComponent(colMatch[1]); }} catch(e) {{ collectionSlug = colMatch[1]; }}
    }}
    pageTitle = collectionSlug || 'Bộ sưu tập TikTok';
  }} else if (isFavorites) {{
    pageTitle = 'Mục Yêu thích TikTok (Favorites)';
  }} else {{
    const userEl = document.querySelector('[data-e2e="user-title"], [data-e2e="user-subtitle"], h1');
    pageTitle = userEl ? userEl.textContent.trim() : (location.pathname.replace(/^\\/@?/, '').split('/')[0] || 'Kênh TikTok');
  }}

  let expectedCount = 0;
  const countMatch = document.body.innerText.match(/(\\d+)\\s+(?:videos|video|bài đăng|mục)/i);
  if (countMatch) {{
    expectedCount = parseInt(countMatch[1], 10);
  }}
  
  const toast = document.createElement('div');
  toast.id = 'sc-os-tiktok-toast';
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999999;background:rgba(15,23,42,0.96);backdrop-filter:blur(16px);color:#fff;padding:16px 20px;border-radius:14px;box-shadow:0 12px 35px rgba(0,0,0,0.6),0 0 0 1px rgba(139,92,246,0.4);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13.5px;max-width:400px;line-height:1.5;box-sizing:border-box;';
  
  const badgeTitle = isCollection ? `📁 BỘ SƯU TẬP: "${{pageTitle}}"` : (isFavorites ? `⭐ MỤC YÊU THÍCH TIKTOK` : `⚡ KÊNH TIKTOK: "${{pageTitle}}"`);
  toast.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;"><b style="color:#c084fc;font-size:14px;">SocialContent OS</b><span style="font-size:11px;background:rgba(139,92,246,0.25);color:#d8b4fe;padding:2px 8px;border-radius:10px;font-weight:600;">${{isCollection ? 'Collection' : 'Scanner'}}</span></div><div style="font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:4px;">${{badgeTitle}}</div><div id="sc-os-status" style="font-size:12.5px;color:#94a3b8;">Đang đọc danh sách video...</div><div id="sc-os-count" style="font-size:13px;font-weight:700;color:#38bdf8;margin-top:6px;">Đã tìm thấy: 0 video</div>`;
  
  const oldToast = document.getElementById('sc-os-tiktok-toast');
  if (oldToast) oldToast.remove();
  document.body.appendChild(toast);
  
  const updateStatus = (txt, countTxt) => {{
    const s = document.getElementById('sc-os-status');
    const c = document.getElementById('sc-os-count');
    if (s && txt) s.innerHTML = txt;
    if (c && countTxt) c.innerHTML = countTxt;
  }};
  
  const nowTs = Math.floor(Date.now() / 1000);
  const cutoff30d = nowTs - (30 * 86400);
  const seen = new Set();
  const collected = [];
  let reachedLimit = false;
  let scrollCount = 0;
  let sameCountRetries = 0;
  let prevCount = 0;
  
  function harvest() {{
    let rootEl = document;
    if (isCollection) {{
      rootEl = document.querySelector('main, [data-e2e="user-post-item-list"], [class*="DivShareLayoutMain"], [class*="DivThreeColumnContainer"], [class*="DivVideoFeed"]') || document;
    }}
    const links = Array.from(rootEl.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]'));
    for (const a of links) {{
      if (a.closest('aside, nav, header, [data-e2e*="sidebar"], [data-e2e*="side-nav"], [data-e2e="nav-following"]')) continue;
      const rawHref = a.href || '';
      if (!rawHref.includes('/video/') && !rawHref.includes('/photo/')) continue;
      const cleanUrl = rawHref.split('?')[0].split('#')[0];
      if (seen.has(cleanUrl)) continue;
      seen.add(cleanUrl);
      
      const m = cleanUrl.match(/(?:video|photo)\\/(\\d+)/);
      const vidId = m ? m[1] : '';
      let ts = 0;
      if (vidId) {{
        try {{
          ts = Number(BigInt(vidId) >> 32n);
        }} catch(e) {{}}
      }}
      
      const card = a.closest('[data-e2e="user-post-item"]') 
        || a.closest('[data-e2e="favorites-item"]')
        || a.closest('div[class*="DivItemContainer"]') 
        || a.closest('div[class*="DivVideoFeed"]') 
        || a.closest('div[class*="DivContentContainer"]')
        || a.parentElement 
        || a;
        
      const img = card.querySelector('img') || a.querySelector('img');
      const thumb = img ? (img.src || img.getAttribute('data-src') || '') : '';
      
      let title = (img && img.alt ? img.alt.trim() : '') 
        || (card.querySelector('[data-e2e="user-post-item-desc"]')?.textContent?.trim())
        || (a.getAttribute('title') || '')
        || '';
        
      if (!title || title.length < 2) {{
        title = `Video TikTok ${{vidId ? '#' + vidId.slice(-4) : ''}}`;
      }}
      
      const uMatch = cleanUrl.match(/@([a-zA-Z0-9_.-]+)/);
      const uploader = uMatch ? '@' + uMatch[1] : '';
      
      if (!isCollection && !isFavorites && ts > 0 && ts < cutoff30d) {{
        reachedLimit = true;
      }}
      
      collected.push({{
        id: vidId,
        url: cleanUrl,
        title: title,
        thumb: thumb,
        createTime: ts,
        uploader: uploader
      }});
    }}
  }}
  
  function finish() {{
    const targetMode = (isCollection || isFavorites) ? 'all' : '30_days';
    updateStatus(`Đang chuyển ${{collected.length}} video sang SocialContent OS...`);
    
    fetch('http://{api_host}/api/tiktok/channel/ingest', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json' }},
      body: JSON.stringify({{
        items: collected,
        channel_url: location.href,
        mode: targetMode,
        days_limit: 30,
        is_collection: isCollection || isFavorites,
        collection_name: pageTitle
      }})
    }}).then(res => res.json()).then(data => {{
      toast.style.background = 'rgba(6, 78, 59, 0.95)';
      toast.style.borderColor = '#10b981';
      toast.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:bold;color:#a7f3d0;font-size:15px;">🎉 ĐÃ QUÉT XONG ${{collected.length}} VIDEO!</span>
          <button id="sc-close-toast" style="background:transparent;border:none;color:#94a3b8;font-size:18px;cursor:pointer;">✕</button>
        </div>
        <div style="font-size:13px;color:#f0fdf4;margin-bottom:8px;">
          ${{isCollection ? `Đã bóc tách toàn bộ Bộ sưu tập: <b>${{pageTitle}}</b>` : `Đã bóc tách video thành công!`}}<br>
          ⚡ <b>Dữ liệu đã tự động chuyển sang tab SocialContent OS!</b>
        </div>
        <div style="font-size:12px;color:#a7f3d0;">
          👉 Bạn chỉ cần chuyển sang tab <b>SocialContent OS</b> để bấm Tải về!
        </div>
      `;
      const cb = document.getElementById('sc-close-toast');
      if (cb) cb.onclick = () => toast.remove();
      setTimeout(() => {{ if (toast.parentNode) toast.remove(); }}, 12000);
    }}).catch(err => {{
      const jsonStr = JSON.stringify(collected);
      console.log('--- DANH SACH VIDEO TIKTOK DA QUET ---', jsonStr);

      toast.style.background = '#1e1b4b';
      toast.style.borderColor = '#818cf8';
      toast.style.maxWidth = '420px';
      toast.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:bold;color:#a5b4fc;font-size:15px;">🎉 ĐÃ QUÉT XONG ${{collected.length}} VIDEO!</span>
          <button id="sc-close-toast" style="background:transparent;border:none;color:#94a3b8;font-size:18px;cursor:pointer;">✕</button>
        </div>
        <div style="font-size:13px;color:#e2e8f0;margin-bottom:10px;">
          ${{isCollection ? `Bộ sưu tập: <b>${{pageTitle}}</b>` : `Kênh TikTok`}}<br>
          Bấm nút bên dưới để copy toàn bộ video, sau đó quay lại SocialContent OS để tải:
        </div>
        <button id="sc-copy-btn" style="width:100%;padding:11px 16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:bold;font-size:14px;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
          📋 SAO CHÉP ${{collected.length}} VIDEO (1-CLICK)
        </button>
        <div id="sc-copy-msg" style="display:none;margin-top:8px;font-size:12px;color:#34d399;font-weight:bold;text-align:center;">
          ✅ Đã sao chép! Hãy mở tab SocialContent OS -> Bấm "Dán link / JSON thủ công" -> Bấm Ctrl + V!
        </div>
      `;

      const copyBtn = document.getElementById('sc-copy-btn');
      const copyMsg = document.getElementById('sc-copy-msg');
      const closeBtn = document.getElementById('sc-close-toast');

      if (closeBtn) closeBtn.onclick = () => toast.remove();

      if (copyBtn) {{
        copyBtn.onclick = () => {{
          let copied = false;
          try {{
            if (navigator.clipboard && navigator.clipboard.writeText) {{
              navigator.clipboard.writeText(jsonStr);
              copied = true;
            }}
          }} catch(e) {{}}

          if (!copied) {{
            try {{
              const ta = document.createElement('textarea');
              ta.value = jsonStr;
              ta.style.position = 'fixed';
              ta.style.left = '-9999px';
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
              copied = true;
            }} catch(e) {{}}
          }}

          copyBtn.style.background = '#10b981';
          copyBtn.innerHTML = '✅ ĐÃ SAO CHÉP ${{collected.length}} VIDEO!';
          if (copyMsg) copyMsg.style.display = 'block';
        }};
      }}
    }});
  }}
  
  function step() {{
    harvest();
    const countDisplay = expectedCount > 0 ? `${{collected.length}} / ${{expectedCount}}` : `${{collected.length}}`;
    updateStatus(`Đang cuộn tải thêm video...`, `Đã tìm thấy: <b style="color:#38bdf8;">${{countDisplay}}</b> video`);
    
    if (expectedCount > 0 && collected.length >= expectedCount) {{
      finish();
      return;
    }}
    
    if (!isCollection && !isFavorites && reachedLimit) {{
      finish();
      return;
    }}
    
    if (collected.length === prevCount) {{
      sameCountRetries++;
      if (sameCountRetries >= 5) {{
        finish();
        return;
      }}
    }} else {{
      sameCountRetries = 0;
      prevCount = collected.length;
    }}
    
    if (scrollCount >= 50) {{
      finish();
      return;
    }}
    
    scrollCount++;
    window.scrollTo(0, document.body.scrollHeight);
    setTimeout(step, 800);
  }}
  
  step();
}})();"""
    compressed = "javascript:" + re.sub(r'\s+', ' ', js).strip()
    return compressed
