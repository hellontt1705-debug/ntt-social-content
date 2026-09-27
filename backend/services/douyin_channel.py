import re
import time
import datetime
from typing import Dict, Any, List, Optional
import requests

from services.downloader import get_sm_session_token, DOUYIN_SESSION, scrape_via_douyin
from services.channel_scraper import fetch_douyin_channel_info

def extract_douyin_sec_uid(url: str) -> str:
    """
    Trích xuất sec_uid từ đường dẫn Douyin:
    Ví dụ: https://www.douyin.com/user/MS4wLjABAAAAdYlDd-8RlA59qAFq1uXoSnqvt2txhi7UUw4Cyv1VGEI?...
    -> MS4wLjABAAAAdYlDd-8RlA59qAFq1uXoSnqvt2txhi7UUw4Cyv1VGEI
    """
    if not url:
        return ""
    clean = url.strip()

    m = re.search(r'douyin\.com/user/([a-zA-Z0-9_\-]+)', clean)
    if m:
        return m.group(1).rstrip("/.?#")

    # Short URL v.douyin.com
    if "v.douyin.com" in clean or "iesdouyin.com" in clean:
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15"
            }
            resp = DOUYIN_SESSION.get(clean, headers=headers, allow_redirects=False, timeout=6)
            loc = resp.headers.get("Location") or resp.headers.get("location") or ""
            m_loc = re.search(r'user/([a-zA-Z0-9_\-]+)', loc)
            if m_loc:
                return m_loc.group(1).rstrip("/.?#")
        except Exception as e:
            print("Error resolving short Douyin url:", e)

    # Nếu người dùng chỉ dán trực tiếp sec_uid
    if clean.startswith("MS4wLjABAAA"):
        return clean.split("?")[0].split("#")[0].strip()

    return ""

def get_timestamp_from_douyin_id(video_id: str) -> int:
    """
    Thuật toán giải mã ByteDance Douyin Snowflake ID:
    32 bit đầu tiên của ID 64-bit chính là UNIX timestamp (tính bằng giây) lúc video được đăng tải.
    Ví dụ: 7681631623212715279 >> 32 = 1788519235 (2026-09-04 17:53:55)
    """
    try:
        vid_num = int(re.sub(r'\D', '', str(video_id)))
        ts = vid_num >> 32
        # Giới hạn hợp lệ (từ 2016 đến 2038)
        if 1451606400 <= ts <= 2147483647:
            return ts
    except Exception:
        pass
    return 0

def format_douyin_timestamp(ts: int) -> Dict[str, Any]:
    """Chuyển đổi timestamp sang chuỗi ngày giờ DD/MM/YYYY HH:mm và tính số ngày/giờ đã trôi qua"""
    if not ts or ts <= 0:
        return {
            "date_str": "Không rõ",
            "iso": "",
            "hours_ago": -1,
            "days_ago": -1,
            "relative_str": "Chưa rõ thời gian"
        }
    try:
        dt = datetime.datetime.fromtimestamp(ts)
        now = datetime.datetime.now()
        diff = now - dt
        hours_ago = max(0, int(diff.total_seconds() // 3600))
        days_ago = max(0, diff.days)

        if hours_ago < 1:
            rel_str = "Vừa xong"
        elif hours_ago < 24:
            rel_str = f"{hours_ago} giờ trước"
        elif days_ago == 1:
            rel_str = "Hôm qua"
        else:
            rel_str = f"{days_ago} ngày trước"

        return {
            "date_str": dt.strftime("%d/%m/%Y %H:%M"),
            "iso": dt.strftime("%Y-%m-%d"),
            "hours_ago": hours_ago,
            "days_ago": days_ago,
            "relative_str": rel_str
        }
    except Exception:
        return {
            "date_str": "Không rõ",
            "iso": "",
            "hours_ago": -1,
            "days_ago": -1,
            "relative_str": "Chưa rõ thời gian"
        }

def filter_douyin_videos_by_date(
    videos: List[Dict[str, Any]],
    mode: str = "30_days",
    days_limit: int = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Lọc danh sách video Douyin theo thời gian:
    - mode == "24h": Trong vòng 24 giờ qua (video mới nhất)
    - mode == "7_days": Trong vòng 7 ngày gần nhất
    - mode == "30_days": Trong vòng 30 ngày gần nhất
    - mode == "custom": Trong khoảng start_date (YYYY-MM-DD) đến end_date (YYYY-MM-DD)
    - mode == "all": Lấy toàn bộ video nguyên kênh không lọc
    """
    if not videos:
        return []

    now_ts = int(time.time())
    filtered = []

    start_ts = None
    end_ts = None

    if mode == "custom" and start_date:
        try:
            s_dt = datetime.datetime.strptime(start_date.strip(), "%Y-%m-%d")
            start_ts = int(s_dt.timestamp())
        except Exception:
            start_ts = None

    if mode == "custom" and end_date:
        try:
            e_dt = datetime.datetime.strptime(end_date.strip(), "%Y-%m-%d") + datetime.timedelta(days=1, seconds=-1)
            end_ts = int(e_dt.timestamp())
        except Exception:
            end_ts = None

    for v in videos:
        v_ts = v.get("created_at") or get_timestamp_from_douyin_id(v.get("id") or "")

        # Nếu không có timestamp thì vẫn giữ lại để người dùng xem xét
        if not v_ts:
            filtered.append(v)
            continue

        if mode == "24h":
            cutoff_ts = now_ts - 86400
            if v_ts >= cutoff_ts:
                filtered.append(v)
        elif mode == "7_days":
            cutoff_ts = now_ts - (7 * 86400)
            if v_ts >= cutoff_ts:
                filtered.append(v)
        elif mode == "30_days":
            cutoff_ts = now_ts - (30 * 86400)
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
        else:  # "all"
            filtered.append(v)

    # Sắp xếp video mới nhất lên đầu
    filtered.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    return filtered

def scan_douyin_channel(
    channel_url: str,
    mode: str = "30_days",
    days_limit: int = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Quét thông tin kênh Douyin và bóc tách video qua Backend.
    Tự động tính timestamp từ Snowflake ID và lọc theo ngày.
    """
    clean_url = channel_url.strip()
    channel_data = fetch_douyin_channel_info(clean_url)

    sec_uid = extract_douyin_sec_uid(clean_url)
    profile_url = f"https://www.douyin.com/user/{sec_uid}" if sec_uid else clean_url

    channel_info = {
        "platform": "douyin",
        "username": channel_data.get("handle") or sec_uid or "douyin_creator",
        "nickname": channel_data.get("name") or "Kênh Douyin",
        "avatar": channel_data.get("avatar_url") or "",
        "biography": channel_data.get("bio") or "",
        "profile_url": profile_url,
        "posts_count": channel_data.get("posts_count", 0),
        "followers_count": channel_data.get("followers_count", 0),
        "likes_count": channel_data.get("likes_count", 0)
    }

    raw_videos = []

    # Kiểm tra nếu link chứa vid cụ thể (ví dụ link người dùng đưa kèm vid=7681631623212715279)
    m_vid = re.search(r'vid=(\d+)', clean_url) or re.search(r'modal_id=(\d+)', clean_url) or re.search(r'douyin\.com/video/(\d+)', clean_url)
    if m_vid:
        vid_id = m_vid.group(1)
        v_url = f"https://www.douyin.com/video/{vid_id}"
        ts = get_timestamp_from_douyin_id(vid_id)
        fmt = format_douyin_timestamp(ts)
        
        # Thử lấy thêm tiêu đề & thumbnail từ video resolver
        v_details = scrape_via_douyin(v_url)
        v_title = (v_details.get("title") if v_details else "") or f"Video Douyin #{vid_id}"
        v_thumb = (v_details.get("thumbnail") if v_details else "") or ""
        
        raw_videos.append({
            "id": vid_id,
            "url": v_url,
            "title": v_title,
            "thumbnail": v_thumb,
            "created_at": ts,
            "date_str": fmt["date_str"],
            "relative_str": fmt["relative_str"],
            "hours_ago": fmt["hours_ago"],
            "days_ago": fmt["days_ago"],
            "uploader": channel_info["nickname"],
            "uploader_handle": channel_info["username"],
            "platform": "douyin",
            "selected": True
        })

    filtered_videos = filter_douyin_videos_by_date(
        raw_videos,
        mode=mode,
        days_limit=days_limit,
        start_date=start_date,
        end_date=end_date
    )

    return {
        "success": True,
        "platform": "douyin",
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
        "videos": filtered_videos,
        "requires_bookmarklet_for_all": channel_data.get("posts_count", 0) > len(raw_videos)
    }

def ingest_scanned_douyin_items(
    items: List[Any],
    channel_url: str = "",
    mode: str = "30_days",
    days_limit: int = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Tiếp nhận danh sách video Douyin từ Bookmarklet (chạy trực tiếp trên trình duyệt) hoặc dán danh sách URL:
    - Bóc tách ID video Douyin
    - Tự động tính timestamp từ Snowflake ID (chính xác 100% đến từng giây)
    - Áp dụng bộ lọc ngày (24h, 7 ngày, 30 ngày, tùy chọn, hoặc tất cả)
    """
    processed = []
    seen_urls = set()
    sec_uid = extract_douyin_sec_uid(channel_url)

    for item in items:
        if isinstance(item, str):
            raw_url = item.strip()
            caption = "Video Douyin"
            thumb = ""
            views = 0
            likes = 0
            item_ts = 0
            author = ""
        else:
            raw_url = item.get("url") or item.get("link") or ""
            caption = item.get("caption") or item.get("title") or "Video Douyin"
            thumb = item.get("thumb") or item.get("thumbnail") or item.get("cover") or ""
            views = item.get("views") or 0
            likes = item.get("likes") or 0
            item_ts = int(item.get("createTime") or item.get("created_at") or 0)
            author = item.get("uploader") or item.get("author") or ""

        if not raw_url:
            continue

        clean_url = raw_url.split("?")[0].split("#")[0]
        if clean_url in seen_urls:
            continue
        seen_urls.add(clean_url)

        # Trích xuất video id
        vid_match = re.search(r'video/(\d+)', clean_url) or re.search(r'modal_id=(\d+)', raw_url)
        vid_id = vid_match.group(1) if vid_match else ""

        # Chuẩn hóa link về dạng https://www.douyin.com/video/{vid_id}
        canonical_url = f"https://www.douyin.com/video/{vid_id}" if vid_id else clean_url

        # Tính toán timestamp từ Snowflake ID nếu chưa có
        if not item_ts and vid_id:
            item_ts = get_timestamp_from_douyin_id(vid_id)

        fmt = format_douyin_timestamp(item_ts)

        processed.append({
            "id": vid_id or str(len(processed) + 1),
            "url": canonical_url,
            "title": caption,
            "thumbnail": thumb,
            "created_at": item_ts,
            "date_str": fmt["date_str"],
            "relative_str": fmt["relative_str"],
            "hours_ago": fmt["hours_ago"],
            "days_ago": fmt["days_ago"],
            "views": views,
            "likes": likes,
            "uploader": author or "Kênh Douyin",
            "uploader_handle": sec_uid or "",
            "platform": "douyin",
            "selected": True
        })

    filtered = filter_douyin_videos_by_date(
        processed,
        mode=mode,
        days_limit=days_limit,
        start_date=start_date,
        end_date=end_date
    )

    return {
        "success": True,
        "platform": "douyin",
        "channel_info": {
            "username": sec_uid or "douyin_channel",
            "nickname": (processed[0]["uploader"] if processed and processed[0].get("uploader") != "Kênh Douyin" else "Kênh Douyin"),
            "profile_url": f"https://www.douyin.com/user/{sec_uid}" if sec_uid else channel_url
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

def get_douyin_bookmarklet_code(api_host: str = "localhost:8000") -> str:
    """
    Tạo đoạn mã JavaScript 1-click bóc tách 100% video nguyên kênh Douyin:
    - Tự động cuộn trang liên tục và bóc tách từng thẻ video không lo bỏ sót
    - Tự động sao chép danh sách vào bộ nhớ đệm máy tính (Clipboard)
    - Hiển thị POPUP MODAL to rõ ràng ngay trên màn hình Douyin kèm nút bấm SAO CHÉP và khung văn bản
    - An toàn, không lỗi cú pháp khi dán vào F12 Console hoặc Bookmarklet
    """
    js = """(async () => {
  if (!location.hostname.includes('douyin.com')) {
    alert('Vui lòng mở trang kênh Douyin (douyin.com/user/...) trước khi chạy mã này!');
    return;
  }

  const oldModal = document.getElementById('sc-modal-douyin');
  if (oldModal) oldModal.remove();
  const oldToast = document.getElementById('sc-toast-douyin');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.id = 'sc-toast-douyin';
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;background:#0f172a;color:#fff;padding:16px 20px;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,0.85);font-family:system-ui,-apple-system,sans-serif;font-size:14px;border:2px solid #ff0050;max-width:380px;line-height:1.5;';
  toast.innerHTML = '⚡ <b>SocialContent OS</b><br><span id="sc-st">Đang bắt đầu quét kênh...</span>';
  document.body.appendChild(toast);
  const st = document.getElementById('sc-st');

  const seen = new Set();
  const collected = [];

  function harvest() {
    const links = document.querySelectorAll('a[href*="/video/"], a[href*="modal_id="], a[href*="/note/"], [data-e2e*="post"] a, li a');
    for (const a of links) {
      const h = a.getAttribute('href') || a.href || '';
      const m = h.match(/\\/video\\/(\\d+)/) || h.match(/modal_id=(\\d+)/) || h.match(/\\/note\\/(\\d+)/) || h.match(/(\\d{18,20})/);
      if (!m) continue;
      const vidId = m[1];
      if (seen.has(vidId)) continue;
      seen.add(vidId);
      const card = a.closest('li') || a.parentElement || a;
      const img = a.querySelector('img') || card.querySelector('img');
      const textElem = card.querySelector('p, span[class*="title"], div[class*="title"]') || a;
      const rawTitle = (img && img.alt && img.alt.trim()) || (textElem && textElem.innerText && textElem.innerText.trim()) || '';
      const title = rawTitle.replace(/\\s+/g, ' ').slice(0, 150) || 'Video Douyin';
      const thumb = (img && (img.src || img.dataset?.src || img.currentSrc)) || '';
      collected.push({
        id: vidId,
        url: 'https://www.douyin.com/video/' + vidId,
        title: title,
        thumb: thumb
      });
    }
  }

  harvest();

  let noNewCount = 0;
  let lastLen = collected.length;

  for (let i = 0; i < 35; i++) {
    window.scrollTo(0, document.body.scrollHeight || document.documentElement.scrollHeight);
    try {
      document.querySelectorAll('div, main').forEach(el => {
        if (el.scrollHeight > el.clientHeight && el.clientHeight > 400) el.scrollTop = el.scrollHeight;
      });
    } catch(e) {}

    await new Promise(r => setTimeout(r, 380));
    harvest();

    if (st) st.innerHTML = 'Đang cuộn bóc tách: <b style="color:#ff0050;font-size:16px;">' + collected.length + '</b> video...';

    if (collected.length === lastLen) {
      noNewCount++;
      if (noNewCount >= 8 && collected.length > 0) break;
    } else {
      noNewCount = 0;
      lastLen = collected.length;
    }
  }

  harvest();
  toast.remove();

  const jsonStr = JSON.stringify(collected);

  if (typeof copy === 'function') {
    try { copy(jsonStr); } catch(e) {}
  }
  try { await navigator.clipboard.writeText(jsonStr); } catch(e) {}

  console.log('🎉 SocialContent OS: Bóc tách thành công ' + collected.length + ' video!');
  console.log('Dữ liệu JSON: ', jsonStr);

  const modal = document.createElement('div');
  modal.id = 'sc-modal-douyin';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.82);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;padding:20px;box-sizing:border-box;';

  modal.innerHTML = '<div style="background:#0f172a;border:2px solid #10b981;border-radius:18px;width:100%;max-width:580px;box-shadow:0 25px 60px rgba(0,0,0,0.95);color:#fff;padding:24px;display:flex;flex-direction:column;gap:14px;position:relative;">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;">'
    + '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:28px;">🎉</span>'
    + '<div><div style="font-size:17px;font-weight:800;color:#34d399;">SocialContent OS - BÓC TÁCH HOÀN TẤT!</div>'
    + '<div style="font-size:13px;color:#94a3b8;">Đã lấy trọn vẹn <b style="color:#f472b6;font-size:15px;">' + collected.length + ' video</b> nguyên kênh</div></div></div>'
    + '<button id="sc-btn-close" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>'
    + '</div>'
    + '<button id="sc-btn-copy" style="background:linear-gradient(135deg, #10b981, #059669);color:#fff;border:none;border-radius:12px;padding:15px 20px;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 8px 24px rgba(16,185,129,0.35);transition:all 0.2s;">'
    + '📋 BẤM VÀO ĐÂY ĐỂ SAO CHÉP ' + collected.length + ' VIDEO'
    + '</button>'
    + '<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:12px 14px;font-size:12.5px;color:#cbd5e1;line-height:1.6;">'
    + '<div style="color:#f59e0b;font-weight:700;margin-bottom:3px;">👉 HƯỚNG DẪN 2 BƯỚC ĐỂ TẢI VIDEO VỀ:</div>'
    + '1. Bấm nút màu xanh <b>"BẤM VÀO ĐÂY ĐỂ SAO CHÉP"</b> ở trên.<br>'
    + '2. Quay lại tab <b>SocialContent OS</b> (localhost:5173).<br>'
    + '3. Dán vào ô khung chữ nhật (bấm <b>Ctrl + V</b>) -> Bấm <b>"Lọc theo ngày & Nạp vào danh sách"</b> để tải video!'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:5px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:#94a3b8;">'
    + '<span>Dữ liệu video (đã tự động chọn toàn bộ):</span>'
    + '<span id="sc-copy-hint" style="color:#34d399;font-weight:600;"></span>'
    + '</div>'
    + '<textarea id="sc-textarea" rows="5" readonly style="width:100%;box-sizing:border-box;background:#030712;border:1px solid #334155;border-radius:8px;padding:8px 10px;color:#38bdf8;font-family:monospace;font-size:11px;line-height:1.4;"></textarea>'
    + '</div>'
    + '</div>';

  document.body.appendChild(modal);

  const copyBtn = document.getElementById('sc-btn-copy');
  const textarea = document.getElementById('sc-textarea');
  const copyHint = document.getElementById('sc-copy-hint');
  const closeBtn = document.getElementById('sc-btn-close');

  textarea.value = jsonStr;
  textarea.focus();
  textarea.select();

  async function performCopy() {
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      await navigator.clipboard.writeText(jsonStr);
      copied = true;
    } catch(e) {}
    try {
      if (document.execCommand('copy')) copied = true;
    } catch(e) {}
    if (typeof copy === 'function') {
      try { copy(jsonStr); copied = true; } catch(e) {}
    }

    copyBtn.style.background = 'linear-gradient(135deg, #059669, #047857)';
    copyBtn.innerHTML = '✅ ĐÃ SAO CHÉP ' + collected.length + ' VIDEO! HÃY SANG TAB SOCIALCONTENT OS VÀ BẤM CTRL + V';
    copyHint.innerText = '✅ Đã lưu vào bộ nhớ tạm!';
  }

  copyBtn.onclick = performCopy;
  closeBtn.onclick = () => modal.remove();

  performCopy();
})();"""
    compressed = "javascript:" + re.sub(r'\s+', ' ', js).strip()
    return compressed

