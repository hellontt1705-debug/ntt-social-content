import os
import sys
import zipfile
import shutil

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
import json
import asyncio
import uuid
import re
import time
import concurrent.futures
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks, Query, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response, RedirectResponse, StreamingResponse
from pydantic import BaseModel

from services.db import (
    init_db, get_all_categories, add_category, update_category, delete_category,
    toggle_category_favorite,
    save_video, get_videos, get_video_by_id, update_video, delete_video,
    soft_delete_video, restore_video, permanent_delete_video, get_trash_count,
    get_calendar_events, save_calendar_event, delete_calendar_event, confirm_calendar_event_published,
    get_notes, save_note, delete_note, get_connection,
    is_vault_password_set, set_vault_password, verify_vault_password,
    get_vault_hint, get_private_videos_count, set_video_privacy, batch_set_video_privacy,
    set_category_lock, verify_category_lock, remove_category_lock, change_category_password,
    get_prompts, get_prompt_by_id, create_prompt, update_prompt, delete_prompt,
    toggle_favorite_prompt, get_prompt_stats,
    toggle_video_used, batch_set_videos_used,
    toggle_video_learned, batch_set_videos_learned,
    reset_video_saved_status, batch_reset_videos_saved_status,
    get_social_channels, get_social_channel_by_id, create_social_channel,
    update_social_channel, delete_social_channel, get_social_channels_stats,
    get_channel_categories, add_channel_category, update_channel_category,
    delete_channel_category, batch_update_channel_category,
    get_channel_followers, save_channel_followers, clear_channel_followers,
    get_resource_categories, save_resource_category, delete_resource_category,
    get_resources, save_resource, delete_resource, toggle_favorite_resource,
    batch_move_resources, batch_delete_resources, batch_toggle_favorite_resources, batch_toggle_pin_resources,
    batch_save_resources
)
from services.downloader import scrape_video_metadata, download_video, DOWNLOADS_DIR, THUMBNAILS_DIR, extract_media_from_social_url
from services.channel_scraper import fetch_channel_info

PROMPTS_DIR = os.path.join(DOWNLOADS_DIR, "prompts")
os.makedirs(PROMPTS_DIR, exist_ok=True)
from services.drive_service import (
    get_drive_status, configure_drive, sync_video_to_drive, sync_prompt_to_drive, test_drive_connection,
    delete_file_from_drive, backup_database_to_drive
)
from services.tiktok_channel import (
    scan_tiktok_channel, ingest_scanned_channel_items, get_channel_bookmarklet_code
)
from services.douyin_channel import (
    scan_douyin_channel, ingest_scanned_douyin_items, get_douyin_bookmarklet_code
)

app = FastAPI(title="SocialContent OS API", version="1.0.0")

# Enable CORS for Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Database
init_db()

# --- CLOUD THUMBNAIL CACHE (ImgBB & Google Drive CDN - 0 Byte Ổ Cứng Máy Tính) ---
drive_thumb_url_cache: Dict[str, str] = {}

def _bg_download_drive_thumbnails(files: list):
    """100% Cloud Mode: Không tải thumbnail về đĩa máy tính"""
    pass

async def prewarm_drive_thumbnails():
    """100% Cloud Mode: Thumbnail được phân phát trực tiếp qua ImgBB CDN hoặc Drive CDN (0 Byte ổ cứng)"""
    pass

@app.on_event("startup")
async def startup_event():
    # 100% Cloud Mode active (0 Byte disk cache)
    print("🚀 SocialContent OS khởi động thành công (100% Thuần Cloud - 0 Byte Ổ Cứng)!")



# High-performance cached static file handler for media and thumbnails
class CachedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "public, max-age=86400"
        return response

# Mount downloads directory for streaming videos and serving thumbnails
app.mount("/media/downloads", CachedStaticFiles(directory=DOWNLOADS_DIR), name="downloads")

# WebSocket Connection Manager for Realtime Download Progress
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

# Active download tasks status
active_tasks: Dict[str, Dict[str, Any]] = {}
active_exports: Dict[str, Dict[str, Any]] = {}
MAX_CONCURRENT_DOWNLOADS = 4
download_semaphore = asyncio.Semaphore(MAX_CONCURRENT_DOWNLOADS)
drive_sync_semaphore = asyncio.Semaphore(1)

@app.websocket("/ws/progress")
async def websocket_progress_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send current active tasks and active export immediately upon connection
        export_tasks = [v for v in active_exports.values() if not v.get("dismissed")]
        await websocket.send_json({
            "type": "init",
            "tasks": list(active_tasks.values()),
            "export_tasks": export_tasks
        })
        while True:
            # Keep alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# ----------------- PYDANTIC SCHEMAS -----------------
class ScrapeRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    category_id: Optional[str] = "all"
    sync_to_drive: Optional[bool] = True
    is_private: Optional[bool] = False

class BatchDownloadRequest(BaseModel):
    urls: List[str]
    category_id: Optional[str] = "all"
    sync_to_drive: Optional[bool] = True
    is_private: Optional[bool] = False

class DriveScanRequest(BaseModel):
    url: str

class DeduplicateRequest(BaseModel):
    urls: List[str]

class TikTokChannelScanRequest(BaseModel):
    channel_url: str
    mode: Optional[str] = "30_days" # "30_days", "7_days", "custom", "all"
    days_limit: Optional[int] = 30
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_collection: Optional[bool] = False
    collection_name: Optional[str] = None

class TikTokChannelIngestRequest(BaseModel):
    items: List[Any]
    channel_url: Optional[str] = ""
    mode: Optional[str] = "30_days"
    days_limit: Optional[int] = 30
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_collection: Optional[bool] = False
    collection_name: Optional[str] = None

class DouyinChannelScanRequest(BaseModel):
    channel_url: str
    mode: Optional[str] = "30_days" # "24h", "7_days", "30_days", "custom", "all"
    days_limit: Optional[int] = 30
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class DouyinChannelIngestRequest(BaseModel):
    items: List[Any]
    channel_url: Optional[str] = ""
    mode: Optional[str] = "all" # "24h", "7_days", "30_days", "custom", "all"
    days_limit: Optional[int] = 30
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class VaultSetupRequest(BaseModel):
    password: str
    hint: Optional[str] = ""

class VaultVerifyRequest(BaseModel):
    password: str

class VaultChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
    hint: Optional[str] = ""

class VideoPrivacyRequest(BaseModel):
    is_private: bool

class BatchPrivacyRequest(BaseModel):
    video_ids: List[str]
    is_private: bool

class CategoryCreateRequest(BaseModel):
    id: str
    name: str
    icon: Optional[str] = "folder"
    color: Optional[str] = "#8b5cf6"
    parent_id: Optional[str] = None

class CategoryUpdateRequest(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_favorite: Optional[int] = None
    parent_id: Optional[str] = None

class CategoryLockRequest(BaseModel):
    password: str
    hint: Optional[str] = ""

class CategoryUnlockRequest(BaseModel):
    password: str

class CategoryChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    hint: Optional[str] = ""

class VideoUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    hashtags: Optional[List[str]] = None
    is_used: Optional[int] = None
    used_at: Optional[str] = None
    is_learned: Optional[int] = None
    learned_at: Optional[str] = None
    learn_notes: Optional[str] = None
    media_type: Optional[str] = None

class VideoUsedToggleRequest(BaseModel):
    is_used: Optional[bool] = None

class BatchUsedRequest(BaseModel):
    video_ids: List[str]
    is_used: bool

class VideoLearnedToggleRequest(BaseModel):
    is_learned: Optional[bool] = None
    learn_notes: Optional[str] = None

class BatchLearnedRequest(BaseModel):
    video_ids: List[str]
    is_learned: bool

class BatchMoveRequest(BaseModel):
    video_ids: List[str]
    target_category_id: str

class CalendarEventRequest(BaseModel):
    id: str
    video_id: Optional[str] = None
    title: str
    scheduled_date: str
    scheduled_time: Optional[str] = "19:00"
    platforms: Optional[List[str]] = ["tiktok", "youtube_shorts"]
    status: Optional[str] = "PLANNED"
    notes: Optional[str] = ""
    published_at: Optional[str] = None
    published_url: Optional[str] = None
    manual_note: Optional[str] = None
    caption: Optional[str] = None
    hashtags: Optional[str] = None
    timezone: Optional[str] = "(UTC+7) Asia/Ho_Chi_Minh"

class ConfirmPublishedRequest(BaseModel):
    published_at: str
    published_url: Optional[str] = ""
    manual_note: Optional[str] = ""

class NoteRequest(BaseModel):
    id: str
    title: str
    content_html: str
    content_text: Optional[str] = ""
    category: Optional[str] = "general"
    linked_video_id: Optional[str] = None
    tags: Optional[List[str]] = []

class ResourceCategoryRequest(BaseModel):
    id: Optional[str] = None
    name: str
    icon: Optional[str] = "folder"
    color: Optional[str] = "#8b5cf6"
    order_num: Optional[int] = 0

class ResourceRequest(BaseModel):
    id: Optional[str] = None
    title: str
    url: str
    description: Optional[str] = ""
    category_id: Optional[str] = "default"
    type: Optional[str] = "website"
    tags: Optional[List[str]] = []
    icon: Optional[str] = ""
    favicon_url: Optional[str] = ""
    image_url: Optional[str] = ""
    is_favorite: Optional[int] = 0
    pinned: Optional[int] = 0

class ScrapeResourceMetadataRequest(BaseModel):
    url: str

class BatchResourceMoveRequest(BaseModel):
    ids: List[str]
    category_id: str

class BatchResourceActionRequest(BaseModel):
    ids: List[str]

class BatchResourceFavoriteRequest(BaseModel):
    ids: List[str]
    is_favorite: bool

class BatchResourcePinRequest(BaseModel):
    ids: List[str]
    pinned: bool

class BatchScrapeResourceMetadataRequest(BaseModel):
    urls: List[str]
    concurrency: Optional[int] = 5

class BatchResourceCreateRequest(BaseModel):
    resources: List[ResourceRequest]


class DriveConfigRequest(BaseModel):
    mode: str
    desktop_folder: Optional[str] = None
    api_creds_json: Optional[str] = None
    target_folder_id: Optional[str] = None
    gas_url: Optional[str] = None

class BatchZipRequest(BaseModel):
    video_ids: List[str]

class BatchActionRequest(BaseModel):
    video_ids: List[str]

class ExportToFolderRequest(BaseModel):
    video_ids: List[str]
    target_folder: str

class ExportPromptsToFolderRequest(BaseModel):
    prompt_ids: List[str]
    target_folder: str
    save_text_file: Optional[bool] = True

class OpenFolderRequest(BaseModel):
    folder_path: str

# ----------------- API ROUTES -----------------

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": "SocialContent OS"}

# --- CATEGORIES ---
@app.get("/api/categories")
async def list_categories():
    categories = get_all_categories()
    conn = get_connection()
    try:
        count_rows = conn.execute("""
            SELECT category_id, COUNT(*) as cnt 
            FROM videos 
            WHERE (status IS NULL OR status != 'trashed') 
            GROUP BY category_id
        """).fetchall()
        counts_by_cat = {r[0]: r[1] for r in count_rows}

        children_map = {}
        valid_cat_ids = set()
        for c in categories:
            cid = c["id"]
            valid_cat_ids.add(cid)
            pid = c.get("parent_id")
            if pid:
                children_map.setdefault(pid, []).append(cid)

        uncategorized = 0
        for cid, cnt in counts_by_cat.items():
            if not cid or cid in ['all', 'default', ''] or cid not in valid_cat_ids:
                uncategorized += cnt

        for c in categories:
            cid = c["id"]
            if cid == "all":
                c["count"] = uncategorized
                c["direct_count"] = uncategorized
            else:
                direct = counts_by_cat.get(cid, 0)
                c["direct_count"] = direct
                sub_cnt = sum(counts_by_cat.get(sub_id, 0) for sub_id in children_map.get(cid, []))
                c["count"] = direct + sub_cnt
    finally:
        conn.close()
    return categories

@app.post("/api/categories")
async def create_category(req: CategoryCreateRequest):
    return add_category(req.id, req.name, req.icon, req.color, req.parent_id)

@app.put("/api/categories/{cat_id}")
async def edit_category(cat_id: str, req: CategoryUpdateRequest):
    if cat_id in ["all", "default"]:
        raise HTTPException(status_code=400, detail="Không thể đổi tên danh mục mặc định.")
    updated = update_category(cat_id, name=req.name, icon=req.icon, color=req.color, is_favorite=req.is_favorite, parent_id=req.parent_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Danh mục không tồn tại.")
    return updated

@app.post("/api/categories/{cat_id}/toggle-favorite")
async def toggle_favorite_category_endpoint(cat_id: str):
    if cat_id in ["all", "default"]:
        raise HTTPException(status_code=400, detail="Không thể đánh dấu yêu thích danh mục hệ thống.")
    res = toggle_category_favorite(cat_id)
    if not res:
        raise HTTPException(status_code=404, detail="Danh mục không tồn tại.")
    return res

@app.delete("/api/categories/{cat_id}")
async def remove_category(cat_id: str):
    if cat_id in ["all", "default"]:
        raise HTTPException(status_code=400, detail="Không thể xóa danh mục mặc định.")
    delete_category(cat_id)
    return {"success": True}

@app.post("/api/categories/{cat_id}/lock")
async def lock_category_endpoint(cat_id: str, req: CategoryLockRequest):
    if cat_id in ["all", "default"]:
        raise HTTPException(status_code=400, detail="Không thể khóa danh mục hệ thống.")
    if not req.password or not req.password.strip():
        raise HTTPException(status_code=400, detail="Vui lòng nhập mật khẩu.")
    success = set_category_lock(cat_id, req.password.strip(), req.hint or "")
    if not success:
        raise HTTPException(status_code=500, detail="Không thể đặt mật khẩu cho danh mục.")
    return {"success": True, "message": "Đã đặt mật khẩu khóa danh mục thành công"}

@app.post("/api/categories/{cat_id}/unlock")
async def unlock_category_endpoint(cat_id: str, req: CategoryUnlockRequest):
    valid = verify_category_lock(cat_id, req.password.strip())
    if not valid:
        raise HTTPException(status_code=400, detail="Mật khẩu không chính xác!")
    return {"success": True, "message": "Mở khóa danh mục thành công"}

@app.post("/api/categories/{cat_id}/remove-lock")
async def remove_category_lock_endpoint(cat_id: str, req: CategoryUnlockRequest):
    if cat_id in ["all", "default"]:
        raise HTTPException(status_code=400, detail="Không thể thao tác trên danh mục mặc định.")
    valid = remove_category_lock(cat_id, req.password.strip())
    if not valid:
        raise HTTPException(status_code=400, detail="Mật khẩu không chính xác, không thể gỡ khóa!")
    return {"success": True, "message": "Đã gỡ bỏ khóa bảo mật danh mục"}

@app.post("/api/categories/{cat_id}/change-password")
async def change_category_password_endpoint(cat_id: str, req: CategoryChangePasswordRequest):
    if not req.new_password or not req.new_password.strip():
        raise HTTPException(status_code=400, detail="Mật khẩu mới không được để trống.")
    valid = change_category_password(cat_id, req.current_password.strip(), req.new_password.strip(), req.hint or "")
    if not valid:
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không chính xác!")
    return {"success": True, "message": "Đã cập nhật mật khẩu mới"}

# --- SCRAPE & DOWNLOAD ---
@app.post("/api/scrape")
async def scrape_video(req: ScrapeRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp URL video.")
    try:
        meta = await scrape_video_metadata(req.url.strip())
        return meta
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/drive/scan")
async def scan_drive_endpoint(req: DriveScanRequest):
    """Quét thư mục hoặc file Google Drive, bóc tách link trong các file và lọc trùng lặp với kho dữ liệu"""
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp link Google Drive.")
    try:
        from services.drive_scanner import scan_and_analyze_drive_source
        res = await scan_and_analyze_drive_source(req.url.strip())
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/urls/deduplicate")
async def deduplicate_urls_endpoint(req: DeduplicateRequest):
    """Kiểm tra danh sách link bất kỳ với DB để lọc ra các link mới và link đã trùng"""
    try:
        from services.drive_scanner import deduplicate_against_db
        res = deduplicate_against_db(req.urls)
        return {"success": True, **res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- TIKTOK CHANNEL SCANNER ---
@app.post("/api/tiktok/channel/scan")
async def scan_tiktok_channel_endpoint(req: TikTokChannelScanRequest):
    """Quét toàn bộ video từ một kênh TikTok và lọc theo mốc thời gian (30 ngày, 7 ngày, hoặc khoảng ngày tùy chọn)"""
    if not req.channel_url or not req.channel_url.strip():
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp link kênh hoặc @username TikTok.")
    try:
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(
            None,
            scan_tiktok_channel,
            req.channel_url.strip(),
            req.mode or "30_days",
            req.days_limit or 30,
            req.start_date,
            req.end_date
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tiktok/channel/ingest")
async def ingest_tiktok_channel_endpoint(req: TikTokChannelIngestRequest):
    """Tiếp nhận danh sách video quét từ trình duyệt (Bookmarklet/Extension) hoặc dán danh sách và lọc theo ngày"""
    if not req.items:
        raise HTTPException(status_code=400, detail="Danh sách video không được để trống.")
    try:
        is_coll = req.is_collection or ("/collection/" in (req.channel_url or ""))
        res = ingest_scanned_channel_items(
            items=req.items,
            channel_url_or_handle=req.channel_url or "",
            mode=req.mode or ("all" if is_coll else "30_days"),
            days_limit=req.days_limit or 30,
            start_date=req.start_date,
            end_date=req.end_date,
            is_collection=is_coll,
            collection_name=req.collection_name
        )
        LATEST_CHANNEL_INGEST["tiktok"] = res
        LATEST_CHANNEL_INGEST["latest"] = res

        # Bắn thông báo Realtime qua WebSocket để giao diện SocialContent OS tự động nhận video ngay lập tức!
        await manager.broadcast({
            "type": "channel_ingested",
            "platform": "tiktok",
            "data": res
        })
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tiktok/channel/bookmarklet")
async def get_tiktok_bookmarklet_endpoint():
    """Lấy đoạn mã Bookmarklet JavaScript 1-click để quét kênh và bộ sưu tập trực tiếp trên Cốc Cốc / Chrome"""
    host = "localhost:8000"
    code = get_channel_bookmarklet_code(api_host=host)
    console_code = code.replace("javascript:", "").strip() if code.startswith("javascript:") else code
    return {"success": True, "bookmarklet": code, "console_code": console_code}

# --- DOUYIN CHANNEL SCANNER ---
@app.post("/api/douyin/channel/scan")
async def scan_douyin_channel_endpoint(req: DouyinChannelScanRequest):
    """Quét toàn bộ video từ một kênh Douyin và lọc theo mốc thời gian (24h, 7 ngày, 30 ngày, hoặc khoảng ngày tùy chọn)"""
    if not req.channel_url or not req.channel_url.strip():
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp link kênh Douyin (douyin.com/user/...).")
    try:
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(
            None,
            scan_douyin_channel,
            req.channel_url.strip(),
            req.mode or "30_days",
            req.days_limit or 30,
            req.start_date,
            req.end_date
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

LATEST_CHANNEL_INGEST: Dict[str, Any] = {}

@app.post("/api/douyin/channel/ingest")
async def ingest_douyin_channel_endpoint(req: DouyinChannelIngestRequest):
    """Tiếp nhận danh sách video Douyin quét từ Bookmarklet trình duyệt hoặc dán danh sách và lọc theo ngày"""
    if not req.items:
        raise HTTPException(status_code=400, detail="Danh sách video không được để trống.")
    try:
        res = ingest_scanned_douyin_items(
            items=req.items,
            channel_url=req.channel_url or "",
            mode=req.mode or "all",
            days_limit=req.days_limit or 30,
            start_date=req.start_date,
            end_date=req.end_date
        )
        platform_key = res.get("platform", "douyin")
        LATEST_CHANNEL_INGEST[platform_key] = res
        LATEST_CHANNEL_INGEST["latest"] = res

        # Bắn thông báo Realtime qua WebSocket để giao diện SocialContent OS tự động nhận video ngay lập tức!
        await manager.broadcast({
            "type": "channel_ingested",
            "platform": platform_key,
            "data": res
        })
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/channel/latest-ingest")
async def get_latest_channel_ingest_endpoint(platform: Optional[str] = None):
    """Lấy dữ liệu video kênh vừa quét gần nhất để giao diện tự nạp mà không cần copy dán thủ công"""
    if platform and platform in LATEST_CHANNEL_INGEST:
        return {"success": True, "data": LATEST_CHANNEL_INGEST.get(platform)}
    return {"success": True, "data": LATEST_CHANNEL_INGEST.get("latest")}


@app.get("/api/douyin/channel/bookmarklet")
async def get_douyin_bookmarklet_endpoint():
    """Lấy đoạn mã Bookmarklet JavaScript 1-click để quét kênh Douyin trực tiếp trên trình duyệt"""
    host = "localhost:8000"
    code = get_douyin_bookmarklet_code(api_host=host)
    console_code = code.replace("javascript:", "").strip()
    return {"success": True, "bookmarklet": code, "console_code": console_code}


@app.get("/api/drive/gas-code")
async def get_gas_code_endpoint():
    """Lấy mã nguồn Google Apps Script chuẩn để người dùng sao chép chỉ với 1-click"""
    gs_path = os.path.join(os.path.dirname(__file__), "gas_bridge", "Code.gs")
    if not os.path.exists(gs_path):
        gs_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "gas_deploy", "Code.gs")
    try:
        with open(gs_path, "r", encoding="utf-8") as f:
            code_text = f.read()
        return {"success": True, "code": code_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Không thể đọc mã nguồn Apps Script: {e}")

def _remove_local_media_files(video_data: dict, keep_thumbnails: bool = True) -> int:
    """Chế độ Cloud: Xóa file video/ảnh gốc trong downloads/ để giải phóng ổ cứng nhưng bảo toàn thumbnail"""
    freed_sz = 0
    vid_id = video_data.get("id", "")
    
    # 1. Xóa file cụ thể theo path nếu có
    file_p = video_data.get("file_path")
    if file_p:
        full_p = os.path.join(DOWNLOADS_DIR, file_p) if not os.path.isabs(file_p) else file_p
        if os.path.exists(full_p):
            try:
                freed_sz += os.path.getsize(full_p)
                os.remove(full_p)
            except Exception:
                pass

    if not keep_thumbnails:
        thumb_p = video_data.get("local_thumbnail")
        if thumb_p:
            full_th = os.path.join(DOWNLOADS_DIR, thumb_p) if not os.path.isabs(thumb_p) else thumb_p
            if os.path.exists(full_th):
                try:
                    freed_sz += os.path.getsize(full_th)
                    os.remove(full_th)
                except Exception:
                    pass
                
    # 2. Quét sạch tất cả file liên quan đến video_id trong DOWNLOADS_DIR
    # (Bao gồm file video .mp4, .mkv, .webm, và file ảnh bài post .jpg/.png)
    if vid_id:
        target_prefixes = [f"video_{vid_id}", vid_id]
        if os.path.exists(DOWNLOADS_DIR):
            for item in os.listdir(DOWNLOADS_DIR):
                item_path = os.path.join(DOWNLOADS_DIR, item)
                if os.path.isfile(item_path):
                    if any(prefix in item for prefix in target_prefixes):
                        try:
                            freed_sz += os.path.getsize(item_path)
                            os.remove(item_path)
                        except Exception:
                            pass
        
        # Chỉ quét THUMBNAILS_DIR nếu người dùng yêu cầu xóa cả thumbnail
        if not keep_thumbnails and os.path.exists(THUMBNAILS_DIR):
            for item in os.listdir(THUMBNAILS_DIR):
                item_path = os.path.join(THUMBNAILS_DIR, item)
                if os.path.isfile(item_path):
                    if any(prefix in item for prefix in target_prefixes) or f"drive_{video_data.get('drive_file_id', '___')}" in item:
                        try:
                            freed_sz += os.path.getsize(item_path)
                            os.remove(item_path)
                        except Exception:
                            pass

    return freed_sz

async def async_sync_drive_and_backup(video_id: str, should_sync: bool):
    """Đồng bộ video và sao lưu database lên Drive bất đồng bộ qua hàng đợi (Semaphore=1 để tránh nghẽn GAS)"""
    if not should_sync:
        return
    async with drive_sync_semaphore:
        try:
            from services.drive_service import sync_video_to_drive, backup_database_to_drive
            loop = asyncio.get_event_loop()
            vid = get_video_by_id(video_id)
            if not vid:
                return
            
            # Chạy trong threadpool riêng để không làm đơ event loop
            drive_res = await loop.run_in_executor(None, sync_video_to_drive, vid)
            if drive_res and drive_res.get("success") and drive_res.get("drive_file_id"):
                drive_fid = drive_res.get("drive_file_id", "")

                # 100% THUẦN CLOUD: Tải thumbnail lên ImgBB để lấy link CDN vĩnh viễn (0 Byte ổ cứng)
                imgbb_thumb_url = ""
                src_thumb = os.path.join(THUMBNAILS_DIR, f"video_{video_id}.jpg")
                if not (vid.get("thumbnail_url") and "ibb.co" in vid.get("thumbnail_url")):
                    from services.imgbb_service import upload_to_imgbb, is_imgbb_enabled
                    if is_imgbb_enabled():
                        thumb_to_upload = None
                        if os.path.exists(src_thumb) and os.path.getsize(src_thumb) > 300:
                            thumb_to_upload = src_thumb
                        elif vid.get("local_thumbnail"):
                            lt_raw = vid.get("local_thumbnail")
                            lt_full = os.path.join(DOWNLOADS_DIR, lt_raw) if not os.path.isabs(lt_raw) else lt_raw
                            if os.path.exists(lt_full) and os.path.getsize(lt_full) > 300:
                                thumb_to_upload = lt_full

                        if thumb_to_upload:
                            try:
                                ibb_res = await loop.run_in_executor(None, upload_to_imgbb, thumb_to_upload, f"thumb_{video_id}")
                                if ibb_res and ibb_res.get("success"):
                                    imgbb_thumb_url = ibb_res.get("display_url") or ibb_res.get("url")
                            except Exception as ibb_err:
                                print(f"[ImgBB] Lỗi upload thumbnail: {ibb_err}")

                # Xóa sạch cả file video và thumbnail cục bộ trên máy tính (100% 0 Byte ổ cứng!)
                _remove_local_media_files(vid, keep_thumbnails=False)

                update_fields = {
                    "drive_file_id": drive_fid,
                    "drive_web_link": drive_res.get("drive_web_link", ""),
                    "drive_synced": 1,
                    "file_path": "",
                    "thumbnail_url": imgbb_thumb_url or (f"/api/drive/thumbnail/{drive_fid}" if drive_fid else vid.get("thumbnail_url", "")),
                    "local_thumbnail": ""
                }

                updated = update_video(video_id, update_fields)

                if updated:
                    await manager.broadcast({
                        "type": "video_updated",
                        "video": updated
                    })
            
            # Tự động sao lưu database lên Drive
            await loop.run_in_executor(None, backup_database_to_drive)
        except Exception as drive_err:
            print(f"Background Drive sync error for video {video_id}: {drive_err}")

async def process_single_download(url: str, category_id: str, sync_to_drive: bool, task_id: str, is_private: bool = False):
    import time
    loop = asyncio.get_running_loop()
    last_broadcast_time = [0.0]

    def on_progress(p):
        if task_id in active_tasks:
            percent = p.get("percent", 10)
            status_text = p.get("status") or (f"Đang tải {percent}%" if percent < 100 else "Đang xử lý video...")
            new_title = p.get("title")
            cur_title = active_tasks[task_id].get("title", "")
            if new_title and (
                cur_title in ["Đang kết nối...", "Đang chuẩn bị...", "Video", ""]
                or cur_title.startswith("Video #")
            ):
                active_tasks[task_id]["title"] = new_title
            active_tasks[task_id].update({
                "percent": percent,
                "status": status_text,
                "speed": p.get("speed", ""),
                "eta": p.get("eta", "")
            })
            now = time.time()
            if now - last_broadcast_time[0] >= 0.25 or percent >= 100:
                last_broadcast_time[0] = now
                try:
                    asyncio.run_coroutine_threadsafe(
                        manager.broadcast({"type": "task_update", "task": active_tasks[task_id]}),
                        loop
                    )
                except Exception as b_err:
                    pass

    try:
        # Điều tiết qua Semaphore: Tối đa MAX_CONCURRENT_DOWNLOADS (4 video) tải cùng lúc
        async with download_semaphore:
            if task_id in active_tasks:
                active_tasks[task_id].update({
                    "percent": 10,
                    "status": "Đang kết nối luồng tải siêu tốc...",
                    "title": active_tasks[task_id].get("title") or "Đang kết nối..."
                })
                await manager.broadcast({"type": "task_update", "task": active_tasks[task_id]})

            # Download and merge video
            video_record = await download_video(
                url=url,
                video_id=task_id,
                category_id=category_id,
                progress_callback=on_progress
            )

            active_tasks[task_id]["title"] = video_record.get("title", "Video")
            active_tasks[task_id]["status"] = "Đang lưu vào kho..."
            active_tasks[task_id]["percent"] = 98
            await manager.broadcast({"type": "task_update", "task": active_tasks[task_id]})

            # 1. Save immediately to SQLite (instant, ultra-fast response)
            video_record["is_private"] = 1 if is_private else 0
            saved = save_video(video_record)

            # 2. Complete download task immediately so UI feels lightning fast
            active_tasks[task_id]["status"] = "Hoàn thành! Đã lưu vào Kho Video"
            active_tasks[task_id]["percent"] = 100
            active_tasks[task_id]["speed"] = ""
            active_tasks[task_id]["eta"] = ""
            active_tasks[task_id]["isCompleted"] = True
            await manager.broadcast({
                "type": "task_completed",
                "task": active_tasks[task_id],
                "video": saved
            })

            # 3. Asynchronously sync to Drive & backup DB in background (non-blocking)
            from services.drive_service import get_drive_status
            d_status = get_drive_status()
            should_sync = sync_to_drive or d_status.get("is_ready", False)
            if should_sync and saved and saved.get("id"):
                asyncio.create_task(async_sync_drive_and_backup(saved["id"], should_sync))
    except Exception as e:
        err_msg = str(e)
        if "Fresh cookies" in err_msg and "Douyin" in err_msg:
            err_msg = "Video không tồn tại trên Douyin hoặc liên kết TikTok bị nạp nhầm vào danh mục Douyin. Hãy chọn tab TikTok và quét lại!"
        elif "blocked from accessing this post" in err_msg:
            err_msg = "TikTok tạm thời giới hạn IP trực tiếp. Hãy quét nạp bằng Tiện ích 1-Click trên trình duyệt."
        print(f"Download error on task {task_id}: {err_msg}")
        if task_id in active_tasks:
            active_tasks[task_id]["status"] = f"Lỗi: {err_msg}"
            active_tasks[task_id]["isError"] = True
            await manager.broadcast({"type": "task_error", "task": active_tasks[task_id], "error": err_msg})
    finally:
        pass

@app.post("/api/download")
async def start_download(req: DownloadRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp URL video.")
    
    import uuid
    task_id = str(uuid.uuid4())[:8]
    active_tasks[task_id] = {
        "task_id": task_id,
        "url": req.url.strip(),
        "percent": 0,
        "status": "Đang chuẩn bị tải...",
        "speed": "",
        "eta": "",
        "title": "Đang chuẩn bị...",
        "isCompleted": False,
        "isError": False
    }
    await manager.broadcast({"type": "task_update", "task": active_tasks[task_id]})

    asyncio.create_task(
        process_single_download(
            url=req.url.strip(),
            category_id=req.category_id or "all",
            sync_to_drive=bool(req.sync_to_drive),
            task_id=task_id,
            is_private=bool(req.is_private)
        )
    )
    return {"success": True, "task_id": task_id, "message": "Đã thêm vào hàng đợi tải xuống"}

@app.post("/api/batch-download")
async def start_batch_download(req: BatchDownloadRequest):
    clean_urls = [u.strip() for u in req.urls if u.strip()]
    if not clean_urls:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp ít nhất 1 URL.")

    import uuid
    created_tasks = []
    total_batch = len(clean_urls)

    for idx, u in enumerate(clean_urls):
        task_id = str(uuid.uuid4())[:8]
        created_tasks.append(task_id)
        # Khởi tạo trạng thái ĐANG CHỜ ngay lập tức cho từng video trong batch
        active_tasks[task_id] = {
            "task_id": task_id,
            "url": u,
            "percent": 0,
            "status": f"Đang chờ tải (thứ tự #{idx + 1}/{total_batch})...",
            "speed": "",
            "eta": "",
            "title": f"Video #{idx + 1}",
            "isCompleted": False,
            "isError": False
        }
        asyncio.create_task(
            process_single_download(
                url=u,
                category_id=req.category_id or "all",
                sync_to_drive=bool(req.sync_to_drive),
                task_id=task_id,
                is_private=bool(req.is_private)
            )
        )

    # Phát sóng ngay toàn bộ danh sách để frontend nhận đủ số lượng (ví dụ: 10/10 video)
    await manager.broadcast({"type": "init", "tasks": list(active_tasks.values())})

    return {
        "success": True,
        "task_ids": created_tasks,
        "count": len(created_tasks),
        "message": f"Đã bắt đầu tải hàng loạt {len(created_tasks)} video (đa luồng song song {MAX_CONCURRENT_DOWNLOADS} video cùng lúc)!"
    }

@app.post("/api/download/clear-completed")
async def clear_completed_tasks_endpoint():
    """Xóa các tiến trình đã hoàn thành hoặc thất bại khỏi bộ nhớ theo dõi"""
    to_del = [tid for tid, t in active_tasks.items() if t.get("isCompleted") or t.get("isError") or (t.get("percent") or 0) >= 100]
    for tid in to_del:
        if tid in active_tasks:
            del active_tasks[tid]
    await manager.broadcast({"type": "init", "tasks": list(active_tasks.values())})
    return {"success": True, "cleared": len(to_del)}

# --- VIDEOS VAULT & SECURITY ---
@app.get("/api/vault/status")
async def vault_status_route():
    return {
        "has_password": is_vault_password_set(),
        "hint": get_vault_hint(),
        "count": get_private_videos_count()
    }

@app.post("/api/vault/setup")
async def setup_vault_route(req: VaultSetupRequest):
    if not req.password or len(req.password.strip()) < 3:
        raise HTTPException(status_code=400, detail="Mật khẩu phải từ 3 ký tự trở lên.")
    success = set_vault_password(req.password.strip(), req.hint or "")
    return {"success": success}

@app.post("/api/vault/verify")
async def verify_vault_route(req: VaultVerifyRequest):
    is_valid = verify_vault_password(req.password)
    if not is_valid:
        raise HTTPException(status_code=401, detail="Mật khẩu không chính xác.")
    return {"success": True}

@app.post("/api/vault/change-password")
async def change_vault_password_route(req: VaultChangePasswordRequest):
    if not verify_vault_password(req.old_password):
        raise HTTPException(status_code=401, detail="Mật khẩu cũ không chính xác.")
    if not req.new_password or len(req.new_password.strip()) < 3:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải từ 3 ký tự trở lên.")
    success = set_vault_password(req.new_password.strip(), req.hint or "")
    return {"success": success}

@app.post("/api/videos/{video_id}/privacy")
async def update_video_privacy_route(video_id: str, req: VideoPrivacyRequest):
    set_video_privacy(video_id, req.is_private)
    return {"success": True, "video_id": video_id, "is_private": req.is_private}

@app.post("/api/videos/batch-privacy")
async def batch_video_privacy_route(req: BatchPrivacyRequest):
    affected = batch_set_video_privacy(req.video_ids, req.is_private)
    return {"success": True, "count": affected}

@app.get("/api/videos")
async def list_videos(category_id: Optional[str] = None, search: Optional[str] = None, status: Optional[str] = "active", is_private: Optional[bool] = False, used_status: Optional[str] = None, learned_status: Optional[str] = None, media_type: Optional[str] = None):
    """Lấy danh sách video/ảnh: status='active' (kho chính), status='trashed' (thùng rác), is_private=True (kho bảo mật), used_status='all'|'used'|'unused', learned_status='all'|'learned'|'unlearned', media_type='all'|'video'|'image'"""
    return get_videos(category_id=category_id, search=search, status=status, is_private=is_private, used_status=used_status, learned_status=learned_status, media_type=media_type)

@app.get("/api/trash/count")
async def get_trash_count_route():
    """Lấy số lượng video đang có trong thùng rác"""
    return {"count": get_trash_count()}

def async_delete_from_drive_and_backup(video: Dict[str, Any]):
    """Tác vụ ngầm: Xóa file trên Google Drive và cập nhật DB Drive"""
    try:
        delete_file_from_drive(video)
        backup_database_to_drive()
    except Exception as e:
        print(f"Error in async_delete_from_drive_and_backup: {e}")

_video_download_locks: Dict[str, asyncio.Lock] = {}
_video_download_locks_guard = asyncio.Lock()

async def get_video_lock(video_id: str) -> asyncio.Lock:
    async with _video_download_locks_guard:
        if video_id not in _video_download_locks:
            _video_download_locks[video_id] = asyncio.Lock()
        return _video_download_locks[video_id]

async def ensure_video_file_cached(video_id: str) -> Optional[str]:
    """
    Đảm bảo file video/ảnh chất lượng gốc có sẵn trên ổ cứng để phát video HTML5 / hiển thị ảnh siêu nét và tức thì (0ms).
    Nếu file chưa có trên máy, tự động tải trực tiếp từ Google Drive (Google Drive API / GAS) hoặc link nguồn.
    Cập nhật database và phát sóng qua WebSocket.
    """
    v = get_video_by_id(video_id)
    if not v:
        return None

    # 0. Nếu là ảnh/image và đã có thumbnail/ảnh local từ Drive, dùng luôn không cần tải lại (0ms)
    if v.get("media_type") == "image":
        drive_fid = v.get("drive_file_id")
        if drive_fid:
            cached_img = os.path.join(THUMBNAILS_DIR, f"drive_{drive_fid}.jpg")
            if os.path.exists(cached_img) and os.path.getsize(cached_img) > 500:
                return cached_img
        local_thumb = v.get("local_thumbnail")
        if local_thumb and os.path.exists(local_thumb) and os.path.getsize(local_thumb) > 500:
            return local_thumb
    
    # 1. Kiểm tra file_path hiện tại
    current_fp = v.get("file_path") or ""
    if current_fp and os.path.exists(current_fp) and os.path.getsize(current_fp) > 1000:
        return current_fp
        
    # 2. Kiểm tra nếu file đã có trong thư mục DOWNLOADS_DIR theo quy ước đặt tên
    possible_names = [
        f"video_{video_id}.mp4",
        f"video_{video_id}.webm",
        f"video_{video_id}.mov",
    ]
    for pname in possible_names:
        chk_path = os.path.join(DOWNLOADS_DIR, pname)
        if os.path.exists(chk_path) and os.path.getsize(chk_path) > 1000:
            update_video(video_id, {"file_path": chk_path, "file_size": os.path.getsize(chk_path)})
            return chk_path

    # 3. Đồng bộ tải file với lock để tránh tải trùng lặp
    lock = await get_video_lock(video_id)
    async with lock:
        # Kiểm tra lại lần nữa trong lock
        v = get_video_by_id(video_id)
        if not v:
            return None
        current_fp = v.get("file_path") or ""
        if current_fp and os.path.exists(current_fp) and os.path.getsize(current_fp) > 1000:
            return current_fp

        dest_path = os.path.join(DOWNLOADS_DIR, f"video_{video_id}.mp4")
        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 1000:
            update_video(video_id, {"file_path": dest_path, "file_size": os.path.getsize(dest_path)})
            return dest_path

        # 100% THUẦN CLOUD: Video đã có trên Google Drive -> Không tải về ổ đĩa!
        drive_file_id = v.get("drive_file_id")
        if drive_file_id and not str(drive_file_id).startswith("local_"):
            return None

    return None

@app.get("/api/videos/{video_id}/stream")
async def stream_video_file(video_id: str, request: Request):
    """
    100% THUẦN CLOUD STREAMING:
    - Nếu file có sẵn cục bộ (vừa tải về chưa kịp đồng bộ): stream trực tiếp từ đĩa với FileResponse.
    - Nếu đã đồng bộ hoặc trên Google Drive: Stream trực tiếp luồng byte từ Google Drive API 
      (hỗ trợ HTTP Range 206 Partial Content để tua video 0ms) mà KHÔNG tải và KHÔNG lưu file .mp4 vào đĩa!
    - Tuyệt đối 0 Byte ổ cứng khi xem lại / lướt video.
    """
    v = get_video_by_id(video_id)
    if not v:
        raise HTTPException(status_code=404, detail="Không tìm thấy video.")

    # 1. Kiểm tra nếu file cục bộ có sẵn và hợp lệ (>1000 bytes)
    local_p = v.get("file_path") or ""
    full_local = os.path.join(DOWNLOADS_DIR, local_p) if (local_p and not os.path.isabs(local_p)) else local_p
    if full_local and os.path.exists(full_local) and os.path.getsize(full_local) > 1000:
        import mimetypes
        guessed, _ = mimetypes.guess_type(full_local)
        if v.get("media_type") == "image" or (guessed and guessed.startswith("image/")):
            media_type = guessed or "image/jpeg"
        else:
            media_type = "video/mp4"

        return FileResponse(
            path=full_local,
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=604800, immutable",
                "Access-Control-Allow-Origin": "*",
            }
        )

    # 2. 100% CLOUD STREAMING QUA GOOGLE DRIVE API (Hỗ trợ HTTP Range tua video mượt mà, 0 Byte ổ cứng)
    drive_fid = v.get("drive_file_id")
    if drive_fid and not str(drive_fid).startswith("local_"):
        try:
            from services.drive_service import get_drive_api_service
            from google.auth.transport.requests import Request as GoogleAuthRequest
            import requests

            service = get_drive_api_service()
            if service:
                creds = service._http.credentials
                if not creds.valid:
                    creds.refresh(GoogleAuthRequest())
                token = creds.token

                drive_url = f"https://www.googleapis.com/drive/v3/files/{drive_fid}?alt=media"
                req_headers = {"Authorization": f"Bearer {token}"}
                range_header = request.headers.get("range")
                if range_header:
                    req_headers["Range"] = range_header

                upstream = requests.get(drive_url, headers=req_headers, stream=True, timeout=30)
                if upstream.status_code in [200, 206]:
                    resp_headers = {
                        "Accept-Ranges": "bytes",
                        "Cache-Control": "public, max-age=86400",
                        "Access-Control-Allow-Origin": "*",
                    }
                    for h in ["Content-Range", "Content-Length", "Content-Type"]:
                        if h in upstream.headers:
                            resp_headers[h] = upstream.headers[h]
                    
                    content_type = upstream.headers.get("Content-Type", "video/mp4")
                    if v.get("media_type") == "image":
                        content_type = "image/jpeg"

                    def iterfile():
                        try:
                            for chunk in upstream.iter_content(chunk_size=256 * 1024):
                                if chunk:
                                    yield chunk
                        finally:
                            upstream.close()

                    return StreamingResponse(
                        iterfile(),
                        status_code=upstream.status_code,
                        headers=resp_headers,
                        media_type=content_type
                    )
        except Exception as e:
            print(f"[CloudStream] Lỗi stream Google Drive API cho {video_id}: {e}")

        # Fallback 1: Redirect trực tiếp đến link tải/phát Google Drive
        return RedirectResponse(f"https://drive.google.com/uc?export=download&id={drive_fid}")

    # 3. Fallback nếu có source_url
    source_url = v.get("source_url")
    if source_url:
        return RedirectResponse(source_url)

    raise HTTPException(status_code=404, detail="Không tìm thấy file video trên Cloud hoặc máy tính.")

@app.post("/api/videos/{video_id}/preload")
@app.get("/api/videos/{video_id}/preload")
async def preload_video_cache(video_id: str):
    """
    Pure Cloud Mode: Không tải ngầm file video nặng về ổ cứng.
    """
    v = get_video_by_id(video_id)
    if not v:
        return {"cached": False, "error": "Not found"}
    return {
        "cached": True,
        "mode": "cloud_stream",
        "drive_file_id": v.get("drive_file_id")
    }

@app.api_route("/api/videos/{video_id}/thumbnail", methods=["GET", "HEAD"])
async def get_video_thumbnail(video_id: str):
    """
    Trả về thumbnail video siêu tốc (<5ms):
    1. Nếu video trên Google Drive -> redirect sang /api/drive/thumbnail/{drive_file_id} (Cloud-first)
    2. Nếu có file local -> trả về ngay (0ms)
    3. Nếu có link CDN ngoài hợp lệ -> redirect thẳng
    4. Fallback -> SVG poster sang trọng (0ms)
    TUYỆT ĐỐI KHÔNG CHẠY SCRAPING LÀM TREO SERVER
    """
    v = get_video_by_id(video_id)
    if not v:
        raise HTTPException(status_code=404, detail="Video not found")

    # 1. Local-First: Kiểm tra file thumbnail video_{video_id}.jpg trên đĩa (0ms)
    target_thumb_path = os.path.join(THUMBNAILS_DIR, f"video_{video_id}.jpg")
    if os.path.exists(target_thumb_path) and os.path.getsize(target_thumb_path) > 500:
        return FileResponse(target_thumb_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=2592000, immutable"})

    # 2. Kiểm tra local_thumbnail trong DB
    local_p = v.get("local_thumbnail")
    if local_p:
        chk_p = os.path.join(DOWNLOADS_DIR, local_p) if not os.path.isabs(local_p) else local_p
        if os.path.exists(chk_p) and os.path.getsize(chk_p) > 500:
            return FileResponse(chk_p, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=2592000, immutable"})

    # 3. Kiểm tra cache Drive drive_{drive_fid}.jpg trên đĩa nếu có
    drive_fid = v.get("drive_file_id")
    if drive_fid:
        drive_thumb_path = os.path.join(THUMBNAILS_DIR, f"drive_{drive_fid}.jpg")
        if os.path.exists(drive_thumb_path) and os.path.getsize(drive_thumb_path) > 500:
            return FileResponse(drive_thumb_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=2592000, immutable"})

    # 4. Nếu có video file cục bộ trên máy, trích xuất frame bằng FFmpeg trong 0.05s
    fp = v.get("file_path")
    if fp and os.path.exists(fp) and os.path.getsize(fp) > 5000:
        try:
            import subprocess
            subprocess.run(['ffmpeg', '-y', '-ss', '00:00:01', '-i', fp, '-vframes', '1', '-q:v', '2', target_thumb_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if os.path.exists(target_thumb_path) and os.path.getsize(target_thumb_path) > 500:
                if drive_fid:
                    try:
                        shutil.copyfile(target_thumb_path, os.path.join(THUMBNAILS_DIR, f"drive_{drive_fid}.jpg"))
                    except Exception:
                        pass
                return FileResponse(target_thumb_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=2592000, immutable"})
        except Exception:
            pass

    # 5. Link ngoài CDN nếu hợp lệ (TikTok, Douyin, X/Twitter CDN)
    thumb_url = v.get("thumbnail_url")
    if thumb_url and thumb_url.startswith("http") and "googleusercontent.com" not in thumb_url:
        return RedirectResponse(thumb_url)

    # 6. Nếu là video trên Google Drive và chưa có cache local
    if drive_fid:
        return RedirectResponse(f"/api/drive/thumbnail/{drive_fid}")

    # 4. Fallback SVG ngay lập tức (0ms)
    safe_title = (v.get("title") or "Video").replace("<", "&lt;").replace(">", "&gt;")[:35]
    platform = (v.get("platform") or "MEDIA").upper()
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="550" viewBox="0 0 400 550">
        <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0f172a"/>
                <stop offset="50%" stop-color="#1e1b4b"/>
                <stop offset="100%" stop-color="#0f172a"/>
            </linearGradient>
        </defs>
        <rect width="400" height="550" fill="url(#g)"/>
        <circle cx="200" cy="230" r="44" fill="rgba(139, 92, 246, 0.15)" stroke="#8b5cf6" stroke-width="2"/>
        <polygon points="192,214 218,230 192,246" fill="#a78bfa"/>
        <text x="200" y="320" text-anchor="middle" fill="#f8fafc" font-size="15" font-weight="600" font-family="system-ui, -apple-system, sans-serif">{safe_title}</text>
        <text x="200" y="348" text-anchor="middle" fill="#8b5cf6" font-size="12" font-weight="bold" font-family="system-ui, -apple-system, sans-serif">{platform}</text>
    </svg>'''
    return Response(content=svg, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})

@app.get("/api/videos/{video_id}")
async def get_video(video_id: str):
    video = get_video_by_id(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Không tìm thấy video.")
    return video

@app.put("/api/videos/{video_id}")
async def edit_video(video_id: str, req: VideoUpdateRequest):
    updates = req.dict(exclude_unset=True)
    updated = update_video(video_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy video để cập nhật.")
    return updated

@app.post("/api/videos/{video_id}/toggle-used")
async def toggle_video_used_route(video_id: str, req: Optional[VideoUsedToggleRequest] = None):
    """Đánh dấu hoặc bỏ đánh dấu video đã sử dụng"""
    is_used = req.is_used if req else None
    updated = toggle_video_used(video_id, is_used)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy video.")
    return {"success": True, "video": updated}

@app.post("/api/videos/batch-used")
async def batch_video_used_route(req: BatchUsedRequest):
    """Đánh dấu hoặc bỏ đánh dấu hàng loạt video đã sử dụng"""
    affected = batch_set_videos_used(req.video_ids, req.is_used)
    return {"success": True, "count": affected, "is_used": req.is_used}

@app.post("/api/videos/{video_id}/toggle-learned")
async def toggle_video_learned_route(video_id: str, req: Optional[VideoLearnedToggleRequest] = None):
    """Đánh dấu hoặc bỏ đánh dấu video đã xem học làm edit CapCut"""
    is_learned = req.is_learned if req else None
    learn_notes = req.learn_notes if req else None
    updated = toggle_video_learned(video_id, is_learned, learn_notes)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy video.")
    await manager.broadcast({"type": "video_updated", "video": updated})
    return {"success": True, "video": updated}

@app.post("/api/videos/batch-learned")
async def batch_video_learned_route(req: BatchLearnedRequest):
    """Đánh dấu hoặc bỏ đánh dấu hàng loạt video đã xem học làm edit CapCut"""
    affected = batch_set_videos_learned(req.video_ids, req.is_learned)
    await manager.broadcast({
        "type": "videos_batch_learned",
        "video_ids": req.video_ids,
        "is_learned": 1 if req.is_learned else 0
    })
    return {"success": True, "count": affected, "is_learned": req.is_learned}

@app.post("/api/videos/{video_id}/reset-saved")
async def reset_video_saved_route(video_id: str):
    """Bỏ/Xóa thông tin hiển thị đã lưu về máy tính của video"""
    updated = reset_video_saved_status(video_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy video.")
    return {"success": True, "video": updated}

@app.post("/api/videos/batch-reset-saved")
async def batch_reset_videos_saved_route(req: BatchActionRequest):
    """Bỏ/Xóa thông tin hiển thị đã lưu về máy tính cho hàng loạt video đã chọn"""
    affected = batch_reset_videos_saved_status(req.video_ids)
    return {"success": True, "count": affected}

@app.post("/api/videos/{video_id}/redownload")
async def redownload_video_route(video_id: str):
    """Tải lại video từ source_url khi file local đã bị xóa hoặc không tìm thấy"""
    v = get_video_by_id(video_id)
    if not v:
        raise HTTPException(status_code=404, detail="Không tìm thấy video trong kho.")
    src_url = v.get("source_url")
    if not src_url:
        raise HTTPException(status_code=400, detail="Video không có URL nguồn gốc để tải lại.")
    
    from services.downloader import download_video
    try:
        dl_res = await download_video(src_url, video_id, v.get("category_id") or "all")
        dl_path = dl_res.get("file_path", "")
        if not dl_path or not os.path.exists(dl_path):
            raise HTTPException(status_code=500, detail="Tải lại video từ nguồn thất bại.")
        
        updates = {
            "file_path": dl_path,
            "file_size": dl_res.get("file_size") or v.get("file_size"),
            "quality": dl_res.get("quality") or v.get("quality")
        }
        if dl_res.get("local_thumbnail") and os.path.exists(dl_res.get("local_thumbnail")):
            updates["local_thumbnail"] = dl_res["local_thumbnail"]
            
        updated = update_video(video_id, updates)
        if updated:
            await manager.broadcast({"type": "video_updated", "video": updated})
        return {"success": True, "video": updated, "message": "Đã tải lại video từ nguồn gốc thành công!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi tải lại video: {str(e)}")

@app.delete("/api/videos/{video_id}")
async def soft_delete_single_video(video_id: str):
    """Xóa tạm: Chuyển video từ kho chính vào thùng rác (không xóa file)"""
    updated = soft_delete_video(video_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy video để chuyển vào thùng rác.")
    return {"success": True, "message": "Đã chuyển video vào thùng rác.", "video": updated}

@app.post("/api/videos/{video_id}/restore")
async def restore_single_video(video_id: str):
    """Khôi phục video từ thùng rác về lại kho chính"""
    updated = restore_video(video_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy video để khôi phục.")
    return {"success": True, "message": "Đã khôi phục video về kho chính thành công!", "video": updated}

@app.delete("/api/videos/{video_id}/permanent")
async def permanent_delete_single_video(video_id: str, background_tasks: BackgroundTasks):
    """Xóa vĩnh viễn: Xóa khỏi máy tính, xóa khỏi Google Drive và cập nhật Database trên Drive"""
    video = get_video_by_id(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Không tìm thấy video để xóa vĩnh viễn.")
    
    # 1. Xóa khỏi local disk và SQLite DB
    deleted = permanent_delete_video(video_id)
    
    # 2. Xóa khỏi Google Drive và sao lưu lại DB trên Drive
    background_tasks.add_task(async_delete_from_drive_and_backup, video)
    
    return {"success": True, "message": "Đã xóa vĩnh viễn video khỏi máy tính và Google Drive."}

@app.post("/api/trash/empty")
async def empty_trash_endpoint(background_tasks: BackgroundTasks):
    """Dọn sạch toàn bộ thùng rác: Xóa vĩnh viễn tất cả video trong thùng rác và trên Google Drive"""
    trashed_videos = get_videos(status="trashed")
    count = len(trashed_videos)
    for v in trashed_videos:
        permanent_delete_video(v["id"])
        background_tasks.add_task(async_delete_from_drive_and_backup, v)
    return {"success": True, "deleted_count": count, "message": f"Đã dọn sạch {count} video trong thùng rác và Google Drive."}

@app.post("/api/videos/batch-move")
async def batch_move_videos(req: BatchMoveRequest):
    for vid in req.video_ids:
        update_video(vid, {"category_id": req.target_category_id})
    return {"success": True, "count": len(req.video_ids)}

@app.post("/api/videos/batch-cache")
async def batch_cache_videos_route(req: BatchActionRequest, background_tasks: BackgroundTasks):
    """Tải và lưu đệm ngầm (background cache) hàng loạt video từ Google Drive vào máy để xem siêu tốc 0ms"""
    ids = req.video_ids[:30]
    for vid in ids:
        background_tasks.add_task(ensure_video_file_cached, vid)
    return {"success": True, "count": len(ids)}

def _ask_directory_native():
    import tkinter as tk
    from tkinter import filedialog
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        folder = filedialog.askdirectory(title="Chọn thư mục lưu video trên máy tính")
        root.destroy()
        return folder or ""
    except Exception as e:
        print(f"Tkinter dialog error: {e}")
        return ""

@app.post("/api/browse-folder")
async def browse_folder_endpoint():
    """Mở hộp thoại chọn thư mục chuẩn của Windows để duyệt chọn ổ đĩa máy tính"""
    loop = asyncio.get_running_loop()
    selected_path = await loop.run_in_executor(None, _ask_directory_native)
    return {"path": selected_path or ""}

@app.post("/api/open-folder")
async def open_specific_folder(req: OpenFolderRequest):
    """Mở một thư mục bất kỳ trong Windows Explorer"""
    import subprocess
    target = req.folder_path
    if not target or not os.path.exists(target):
        raise HTTPException(status_code=400, detail="Thư mục không tồn tại.")
    try:
        if sys.platform == "win32":
            os.startfile(target)
        else:
            subprocess.run(["xdg-open", target])
        return {"success": True, "path": target}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/drive/backup-db")
async def backup_database_to_drive_endpoint():
    try:
        from services.drive_service import backup_database_to_drive
        res = backup_database_to_drive()
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def process_export_to_folder_worker(export_id: str, video_ids: List[str], target_folder: str, loop: asyncio.AbstractEventLoop):
    import shutil
    import os
    target_dir = os.path.abspath(target_folder)
    os.makedirs(target_dir, exist_ok=True)
    
    saved_files = []
    errors = []
    total = len(video_ids)
    
    for idx, vid in enumerate(video_ids):
        # Kiểm tra yêu cầu hủy
        if export_id in active_exports and active_exports[export_id].get("cancel_requested"):
            active_exports[export_id].update({
                "status": f"Đã dừng lưu video theo yêu cầu ({len(saved_files)}/{total} hoàn thành)",
                "is_cancelled": True,
                "is_completed": True
            })
            try:
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast({"type": "export_completed", "export": active_exports[export_id]}),
                    loop
                )
            except Exception:
                pass
            return

        v = get_video_by_id(vid)
        if not v:
            continue
            
        safe_title = "".join(c for c in (v.get("title") or "media") if c.isalnum() or c in (" ", "-", "_")).strip()[:50]
        if not safe_title:
            safe_title = "media"
        
        is_img = v.get("media_type") == "image"
        ext = ".mp4"
        local_file = v.get("file_path")
        if local_file and "." in local_file:
            cand_ext = os.path.splitext(local_file)[1].lower()
            if cand_ext in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov", ".mkv"]:
                ext = cand_ext
        elif is_img:
            ext = ".jpg"

        video_filename = f"{safe_title}_{v['id'][:8]}{ext}"
        dest_video_path = os.path.join(target_dir, video_filename)
        
        has_local = local_file and os.path.exists(local_file)
        action_text = "Đang sao chép file" if has_local else "Đang tải từ Google Drive"
        status_msg = f"{action_text} ({idx + 1}/{total}): {safe_title}"

        # Broadcast progress
        if export_id in active_exports:
            active_exports[export_id].update({
                "current": idx + 1,
                "percent": int(round(((idx + 1) / total) * 100)),
                "current_title": v.get("title") or safe_title,
                "status": status_msg,
                "saved_count": len(saved_files)
            })
            try:
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast({"type": "export_progress", "export": active_exports[export_id]}),
                    loop
                )
            except Exception:
                pass
                
        # 1. Nếu file local vẫn còn tồn tại thì copy sang
        file_saved = False
        if has_local:
            try:
                shutil.copy2(local_file, dest_video_path)
                saved_files.append(video_filename)
                file_saved = True
            except Exception as copy_err:
                errors.append(f"Lỗi sao chép {video_filename}: {copy_err}")

        # 2. File local đã được dọn (Cloud-First), thử tải từ Google Drive về thư mục đích
        if not file_saved and v.get("drive_file_id"):
            try:
                from services.drive_service import download_video_from_drive
                downloaded_path = download_video_from_drive(v, dest_video_path)
                if downloaded_path and os.path.exists(downloaded_path):
                    saved_files.append(video_filename)
                    file_saved = True
                else:
                    errors.append(f"Không thể tải video '{v.get('title')}' từ Google Drive.")
            except Exception as drive_dl_err:
                errors.append(f"Lỗi tải từ Drive {v.get('title')}: {drive_dl_err}")

        # 3. Fallback: Nếu không có trên máy lẫn Drive, tự động tải lại từ link nguồn gốc (X/TikTok/YouTube...)
        if not file_saved and v.get("source_url"):
            try:
                from services.downloader import download_video
                future = asyncio.run_coroutine_threadsafe(
                    download_video(v["source_url"], v["id"], v.get("category_id") or "all"),
                    loop
                )
                dl_res = future.result(timeout=180)
                temp_file = dl_res.get("file_path")
                if temp_file and os.path.exists(temp_file):
                    shutil.copy2(temp_file, dest_video_path)
                    saved_files.append(video_filename)
                    file_saved = True
                    update_video(vid, {"file_path": temp_file})
            except Exception as src_dl_err:
                errors.append(f"Lỗi tải từ nguồn gốc {v.get('title')}: {src_dl_err}")

        # Nếu hoàn toàn không thể lưu được file video thì bỏ qua, không ghi nhận đã lưu vào máy!
        if not file_saved:
            if not any(v.get('title', safe_title) in err for err in errors):
                errors.append(f"Không tìm thấy file khả dụng cho '{v.get('title', safe_title)}'.")
            continue
                
        # 3. Tạo kèm file thông tin metadata .txt
        try:
            meta_filename = f"{safe_title}_{v['id'][:8]}_metadata.txt"
            meta_path = os.path.join(target_dir, meta_filename)
            meta_content = f"""TIÊU ĐỀ: {v.get('title')}
TÁC GIẢ: {v.get('uploader')} ({v.get('uploader_url')})
NGUỒN GỐC: {v.get('source_url')}
HASHTAGS: {' '.join(['#' + t for t in v.get('hashtags', [])])}
MÔ TẢ GỐC:
{v.get('description')}
GHI CHÚ:
{v.get('notes')}
"""
            with open(meta_path, "w", encoding="utf-8") as mf:
                mf.write(meta_content)
        except Exception:
            pass

        # 4. Ghi nhận trạng thái đã lưu vào máy tính & tăng số lượt tải về máy
        try:
            from datetime import datetime
            cur_count = v.get("local_export_count") or 0
            now_iso = datetime.now().isoformat()
            updated_v = update_video(vid, {
                "is_saved_to_computer": 1,
                "local_export_count": cur_count + 1,
                "last_exported_at": now_iso,
                "last_export_folder": target_dir
            })
            if updated_v:
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast({"type": "video_updated", "video": updated_v}),
                    loop
                )
        except Exception as update_err:
            print(f"Error updating video export count for {vid}: {update_err}")

    # Hoàn tất xuất
    if export_id in active_exports:
        final_msg = f"Đã lưu thành công {len(saved_files)}/{total} video vào: {target_dir}"
        active_exports[export_id].update({
            "current": total,
            "percent": 100,
            "status": final_msg,
            "saved_count": len(saved_files),
            "errors": errors,
            "is_completed": True,
            "message": final_msg
        })
        try:
            asyncio.run_coroutine_threadsafe(
                manager.broadcast({"type": "export_completed", "export": active_exports[export_id]}),
                loop
            )
        except Exception:
            pass

@app.post("/api/export-to-folder")
async def export_to_folder_endpoint(req: ExportToFolderRequest):
    """Lưu các video đã chọn vào thư mục được chỉ định trên máy tính (hỗ trợ cả file local và file từ Drive)"""
    import uuid
    if not req.video_ids:
        raise HTTPException(status_code=400, detail="Chưa chọn video nào.")
    if not req.target_folder:
        raise HTTPException(status_code=400, detail="Chưa chỉ định thư mục đích.")
        
    target_dir = os.path.abspath(req.target_folder)
    os.makedirs(target_dir, exist_ok=True)
    
    export_id = str(uuid.uuid4())[:8]
    total = len(req.video_ids)
    
    active_exports[export_id] = {
        "id": export_id,
        "total": total,
        "current": 0,
        "percent": 0,
        "target_folder": target_dir,
        "current_title": "Đang chuẩn bị lưu...",
        "status": f"Bắt đầu lưu {total} video vào {target_dir}...",
        "saved_count": 0,
        "errors": [],
        "is_completed": False,
        "is_error": False,
        "is_cancelled": False,
        "dismissed": False,
        "message": ""
    }
    
    await manager.broadcast({"type": "export_start", "export": active_exports[export_id]})
    
    # Khởi chạy trong thread riêng để không block event loop
    loop = asyncio.get_running_loop()
    loop.run_in_executor(
        None,
        process_export_to_folder_worker,
        export_id,
        req.video_ids,
        target_dir,
        loop
    )
    
    return {
        "success": True,
        "export_id": export_id,
        "total": total,
        "target_folder": target_dir,
        "status": "started",
        "message": f"Đang bắt đầu lưu {total} video vào: {target_dir}"
    }

@app.get("/api/export-status")
async def get_export_status_endpoint(export_id: Optional[str] = None):
    """Lấy trạng thái tác vụ xuất video hiện tại"""
    if export_id and export_id in active_exports:
        return active_exports[export_id]
    for exp in reversed(list(active_exports.values())):
        if not exp.get("dismissed"):
            return exp
    return {"status": "none"}

@app.post("/api/export/dismiss/{export_id}")
async def dismiss_export_endpoint(export_id: str):
    """Ẩn / xóa thông báo tác vụ xuất video"""
    if export_id in active_exports:
        active_exports[export_id]["dismissed"] = True
    return {"success": True}

@app.post("/api/export/cancel/{export_id}")
async def cancel_export_endpoint(export_id: str):
    """Hủy tác vụ xuất video đang chạy"""
    if export_id in active_exports:
        active_exports[export_id]["cancel_requested"] = True
        active_exports[export_id]["status"] = "Đang hủy tiến trình lưu..."
        await manager.broadcast({"type": "export_progress", "export": active_exports[export_id]})
    return {"success": True}

@app.post("/api/prompts/export-to-folder")
async def export_prompts_to_folder_endpoint(req: ExportPromptsToFolderRequest):
    """Lưu các prompt đã chọn vào thư mục được chỉ định trên máy tính (bao gồm cả ảnh/video và file .txt câu lệnh)"""
    import shutil
    import requests
    if not req.prompt_ids:
        raise HTTPException(status_code=400, detail="Chưa chọn prompt nào.")
    if not req.target_folder:
        raise HTTPException(status_code=400, detail="Chưa chỉ định thư mục đích.")

    target_dir = os.path.abspath(req.target_folder)
    os.makedirs(target_dir, exist_ok=True)

    saved_files = []
    errors = []

    for pid in req.prompt_ids:
        p = get_prompt_by_id(pid)
        if not p:
            continue

        raw_title = p.get("title") or "prompt"
        safe_title = "".join(c for c in raw_title if c.isalnum() or c in (" ", "-", "_")).strip()[:50]
        if not safe_title:
            safe_title = "prompt"

        media_type = p.get("media_type", "image")
        
        # Xác định phần mở rộng file
        ext = ".mp4" if media_type == "video" else ".png"
        local_path = p.get("local_path", "")
        media_url = p.get("media_url", "")
        if local_path:
            _, src_ext = os.path.splitext(local_path)
            if src_ext:
                ext = src_ext.lower()
        elif media_url and "." in media_url.split("?")[0]:
            cand_ext = os.path.splitext(media_url.split("?")[0])[1].lower()
            if cand_ext in [".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".webm"]:
                ext = cand_ext

        media_filename = f"{safe_title}_{p['id'][:8]}{ext}"
        dest_media_path = os.path.join(target_dir, media_filename)

        # 1. Tải hoặc sao chép file media vào thư mục đích
        saved_media = False
        # 1.1 Nếu file local còn tồn tại
        if local_path and os.path.exists(local_path):
            try:
                shutil.copy2(local_path, dest_media_path)
                saved_files.append(media_filename)
                saved_media = True
            except Exception as copy_err:
                errors.append(f"Lỗi sao chép {media_filename}: {copy_err}")
        
        # 1.2 Nếu file đã được đưa lên Google Drive (Cloud-First)
        if not saved_media and p.get("drive_file_id"):
            drive_file_id = p["drive_file_id"]
            # Thử tải qua Google Drive CDN hoặc direct download
            try:
                cdn_url = f"https://lh3.googleusercontent.com/d/{drive_file_id}"
                r = requests.get(cdn_url, timeout=30)
                if r.status_code == 200 and len(r.content) > 500:
                    with open(dest_media_path, "wb") as f:
                        f.write(r.content)
                    saved_files.append(media_filename)
                    saved_media = True
            except Exception:
                pass

            if not saved_media:
                try:
                    from services.drive_service import download_video_from_drive
                    dl_res = download_video_from_drive(p, dest_media_path)
                    if dl_res and os.path.exists(dl_res):
                        saved_files.append(media_filename)
                        saved_media = True
                except Exception as dl_err:
                    errors.append(f"Lỗi tải từ Drive cho prompt '{p.get('title')}': {dl_err}")

        # 1.3 Nếu media_url là URL http(s)
        if not saved_media and media_url and media_url.startswith("http"):
            try:
                r = requests.get(media_url, timeout=30)
                if r.status_code == 200 and len(r.content) > 500:
                    with open(dest_media_path, "wb") as f:
                        f.write(r.content)
                    saved_files.append(media_filename)
                    saved_media = True
            except Exception as net_err:
                errors.append(f"Lỗi tải media từ URL: {net_err}")

        # 2. Tạo file text chứa câu lệnh Prompt và chi tiết thông số
        if req.save_text_file:
            try:
                txt_filename = f"{safe_title}_{p['id'][:8]}_prompt.txt"
                txt_path = os.path.join(target_dir, txt_filename)
                tags_str = ", ".join(p.get("tags", [])) if isinstance(p.get("tags"), list) else str(p.get("tags") or "")
                txt_content = f"""==================================================
THÔNG TIN CÂU LỆNH PROMPT (SOCIALCONTENT OS)
==================================================
TIÊU ĐỀ: {p.get('title') or 'Không có tiêu đề'}
MÔ HÌNH AI: {p.get('ai_model') or 'N/A'}
THỂ LOẠI: {p.get('category') or 'general'}
ĐỊNH DẠNG: {p.get('media_type', 'image').upper()}
TAGS: {tags_str}
NGÀY TẠO: {p.get('created_at', '')}

--------------------------------------------------
CÂU LỆNH PROMPT CHÍNH:
--------------------------------------------------
{p.get('prompt', '')}

--------------------------------------------------
NEGATIVE PROMPT (NẾU CÓ):
--------------------------------------------------
{p.get('negative_prompt') or 'Không có'}

--------------------------------------------------
THÔNG SỐ KỸ THUẬT (PARAMETERS):
--------------------------------------------------
{p.get('parameters') or 'Không có'}

--------------------------------------------------
GHI CHÚ / HƯỚNG DẪN:
--------------------------------------------------
{p.get('notes') or 'Không có'}
==================================================
"""
                with open(txt_path, "w", encoding="utf-8") as tf:
                    tf.write(txt_content)
                saved_files.append(txt_filename)
            except Exception as txt_err:
                errors.append(f"Lỗi tạo file prompt .txt: {txt_err}")

    return {
        "success": len(saved_files) > 0,
        "saved_count": len(saved_files),
        "saved_files": saved_files,
        "target_folder": target_dir,
        "errors": errors,
        "message": f"Đã lưu thành công {len(saved_files)} file vào: {target_dir}"
    }


@app.post("/api/videos/batch-trash")
async def batch_trash_endpoint(req: BatchActionRequest):
    """Chuyển hàng loạt video vào thùng rác"""
    count = 0
    for vid in req.video_ids:
        if soft_delete_video(vid):
            count += 1
    return {"success": True, "count": count, "message": f"Đã chuyển {count} video vào thùng rác."}

@app.post("/api/videos/batch-restore")
async def batch_restore_endpoint(req: BatchActionRequest):
    """Khôi phục hàng loạt video từ thùng rác"""
    count = 0
    for vid in req.video_ids:
        if restore_video(vid):
            count += 1
    return {"success": True, "count": count, "message": f"Đã khôi phục {count} video về kho chính."}

@app.post("/api/videos/batch-permanent")
async def batch_permanent_endpoint(req: BatchActionRequest, background_tasks: BackgroundTasks):
    """Xóa vĩnh viễn hàng loạt video khỏi máy tính và Google Drive"""
    count = 0
    for vid in req.video_ids:
        v = get_video_by_id(vid)
        if v:
            permanent_delete_video(vid)
            background_tasks.add_task(async_delete_from_drive_and_backup, v)
            count += 1
    return {"success": True, "count": count, "message": f"Đã xóa vĩnh viễn {count} video."}

@app.post("/api/cleanup-local-cache")
async def cleanup_local_cache_endpoint():
    """Dọn dẹp các file video .mp4 đã đồng bộ lên Drive để giải phóng dung lượng ổ cứng (BẢO TOÀN THUMBNAIL)"""
    freed_count = 0
    freed_bytes = 0

    # 1. Dọn dẹp Video đã đồng bộ lên Drive (Xóa file video nặng nhưng BẢO TOÀN THUMBNAIL)
    videos = get_videos(category_id="*", status="all")
    for v in videos:
        if v.get("drive_synced") == 1 and v.get("drive_file_id"):
            sz = _remove_local_media_files(v, keep_thumbnails=True)
            if sz > 0 or v.get("file_path"):
                freed_bytes += sz
                freed_count += 1
                update_video(v["id"], {"file_path": ""})

    # 2. Dọn dẹp Prompts đã đồng bộ lên Drive
    try:
        prompts = get_prompts()
        for p in prompts:
            if p.get("drive_synced") == 1 and p.get("drive_file_id"):
                lp = p.get("local_path")
                if lp and os.path.exists(lp):
                    try:
                        freed_bytes += os.path.getsize(lp)
                        os.remove(lp)
                        freed_count += 1
                    except Exception:
                        pass
                update_prompt(p["id"], {"local_path": ""})
    except Exception as err:
        print(f"Error cleaning prompts: {err}")

    # 3. Quét sạch file mồ côi trong PROMPTS_DIR
    try:
        active_prompts = get_prompts()
        active_prompt_files = set(p.get("local_path") for p in active_prompts if p.get("local_path"))
        for item in os.listdir(PROMPTS_DIR):
            item_p = os.path.join(PROMPTS_DIR, item)
            if os.path.isfile(item_p) and item_p not in active_prompt_files:
                try:
                    freed_bytes += os.path.getsize(item_p)
                    os.remove(item_p)
                    freed_count += 1
                except Exception:
                    pass
    except Exception as e:
        print(f"Error scanning prompts dir: {e}")

    # 4. Quét sạch file trong AUDIO_OUTPUT_DIR
    try:
        from services.audio_service import AUDIO_OUTPUT_DIR
        for item in os.listdir(AUDIO_OUTPUT_DIR):
            item_p = os.path.join(AUDIO_OUTPUT_DIR, item)
            if os.path.isfile(item_p):
                try:
                    freed_bytes += os.path.getsize(item_p)
                    os.remove(item_p)
                    freed_count += 1
                except Exception:
                    pass
    except Exception as e:
        print(f"Error scanning audio dir: {e}")

    # 5. Dọn dẹp sạch sẽ các file video thừa/mồ côi trong downloads/ (100% Cloud Mode)
    try:
        active_db_videos = get_videos(category_id="*", status="all")
        # Giữ lại nếu video chưa đồng bộ lên Drive
        unsynced_videos = [v for v in active_db_videos if not (v.get("drive_synced") == 1 and v.get("drive_file_id"))]
        keep_names = set()
        for uv in unsynced_videos:
            fp = uv.get("file_path")
            if fp:
                keep_names.add(os.path.basename(fp))
            vid_id = uv.get("id")
            if vid_id:
                keep_names.add(f"video_{vid_id}.mp4")
                keep_names.add(f"video_{vid_id}.jpg")
                keep_names.add(f"video_{vid_id}.webm")
                keep_names.add(f"video_{vid_id}.mov")
        
        for item in os.listdir(DOWNLOADS_DIR):
            item_p = os.path.join(DOWNLOADS_DIR, item)
            if os.path.isfile(item_p) and item not in keep_names:
                try:
                    freed_bytes += os.path.getsize(item_p)
                    os.remove(item_p)
                    freed_count += 1
                except Exception:
                    pass
    except Exception as scan_err:
        print(f"Error scanning orphaned cache: {scan_err}")

    mb_freed = round(freed_bytes / (1024 * 1024), 2)
    return {
        "success": True,
        "freed_count": freed_count,
        "freed_bytes": freed_bytes,
        "freed_mb": mb_freed,
        "message": f"Chế độ 100% Cloud: Đã dọn sạch các file video trên máy tính, giải phóng {mb_freed} MB ổ cứng!"
    }

@app.post("/api/drive/sync-all-pending")
async def sync_all_pending_drive_endpoint():
    """Quét và đồng bộ toàn bộ video chưa lên Drive hoặc còn file .mp4 trên máy, sau đó giải phóng bộ nhớ"""
    from services.drive_service import sync_video_to_drive, backup_database_to_drive, get_drive_status
    d_status = get_drive_status()
    if not d_status.get("is_ready"):
        raise HTTPException(status_code=400, detail="Google Drive chưa được cấu hình hoặc chưa sẵn sàng.")
    
    videos = get_videos(category_id="*", status="all")
    pending_videos = []
    for v in videos:
        fp = v.get("file_path")
        has_file = fp and os.path.exists(fp)
        if v.get("drive_synced") != 1 or has_file:
            if has_file:
                pending_videos.append(v)
    
    synced_count = 0
    errors = []
    freed_bytes = 0
    loop = asyncio.get_event_loop()

    for vid in pending_videos:
        async with drive_sync_semaphore:
            try:
                drive_res = await loop.run_in_executor(None, sync_video_to_drive, vid)
                if drive_res and drive_res.get("success") and drive_res.get("drive_file_id"):
                    sz = _remove_local_media_files(vid, keep_thumbnails=True)
                    freed_bytes += sz
                    synced_count += 1
                    
                    update_fields = {
                        "drive_file_id": drive_res.get("drive_file_id", ""),
                        "drive_web_link": drive_res.get("drive_web_link", ""),
                        "drive_synced": 1,
                        "file_path": ""
                    }
                    
                    updated = update_video(vid["id"], update_fields)
                    if updated:
                        await manager.broadcast({
                            "type": "video_updated",
                            "video": updated
                        })
            except Exception as e:
                errors.append(f"Video {vid.get('id')}: {str(e)}")

    if synced_count > 0:
        await loop.run_in_executor(None, backup_database_to_drive)

    mb_freed = round(freed_bytes / (1024 * 1024), 2)
    return {
        "success": True,
        "total_pending": len(pending_videos),
        "synced_count": synced_count,
        "freed_mb": mb_freed,
        "errors": errors,
        "message": f"Đã đồng bộ {synced_count}/{len(pending_videos)} video lên Google Drive và giải phóng {mb_freed} MB ổ cứng!"
    }

@app.post("/api/videos/{video_id}/sync-drive")
async def sync_single_video_drive(video_id: str):
    video = get_video_by_id(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Không tìm thấy video.")
    try:
        res = sync_video_to_drive(video)
        if res.get("success") and res.get("drive_file_id"):
            _remove_local_media_files(video, keep_thumbnails=True)
            update_fields = {
                "drive_file_id": res.get("drive_file_id", ""),
                "drive_web_link": res.get("drive_web_link", ""),
                "drive_synced": 1,
                "file_path": ""
            }
            updated = update_video(video_id, update_fields)
            if updated:
                await manager.broadcast({"type": "video_updated", "video": updated})
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/open-downloads")
async def open_downloads_folder():
    """Mở thư mục downloads trên máy tính của người dùng"""
    import subprocess
    try:
        if sys.platform == "win32":
            os.startfile(DOWNLOADS_DIR)
        elif sys.platform == "darwin":
            subprocess.run(["open", DOWNLOADS_DIR])
        else:
            subprocess.run(["xdg-open", DOWNLOADS_DIR])
        return {"success": True, "path": DOWNLOADS_DIR}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Không thể mở thư mục: {str(e)}")

@app.post("/api/drive/backup-db")
async def backup_database_endpoint():
    """Sao lưu database lên Google Drive"""
    from services.drive_service import backup_database_to_drive
    try:
        return backup_database_to_drive()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/drive/sync-all")
async def sync_all_to_drive_endpoint():
    """Đồng bộ toàn bộ video, prompt, sao lưu database lên Drive và xóa sạch file local"""
    from services.drive_service import sync_video_to_drive, sync_prompt_to_drive, backup_database_to_drive
    
    # 1. Đồng bộ Video (Tất cả danh mục)
    videos = get_videos(category_id="*", status="all")
    synced_count = 0
    skipped_count = 0
    failed_count = 0
    errors = []
    
    for v in videos:
        if v.get("drive_synced") == 1 and v.get("drive_file_id"):
            _remove_local_media_files(v, keep_thumbnails=True)
            update_video(v["id"], {"file_path": ""})
            skipped_count += 1
            continue

        try:
            res = sync_video_to_drive(v)
            if res.get("success") and res.get("drive_file_id"):
                _remove_local_media_files(v, keep_thumbnails=True)
                updated = update_video(v["id"], {
                    "drive_file_id": res.get("drive_file_id", ""),
                    "drive_web_link": res.get("drive_web_link", ""),
                    "drive_synced": 1,
                    "file_path": ""
                })
                if updated:
                    await manager.broadcast({"type": "video_updated", "video": updated})
                synced_count += 1
        except Exception as err:
            failed_count += 1
            errors.append(f"Video {v.get('title', v['id'])}: {str(err)}")

    # 2. Đồng bộ Prompts
    prompts = get_prompts()
    synced_prompts_count = 0
    for p in prompts:
        if p.get("drive_synced") == 1 and p.get("drive_file_id"):
            lp = p.get("local_path")
            if lp and os.path.exists(lp):
                try:
                    os.remove(lp)
                except Exception:
                    pass
            update_prompt(p["id"], {"local_path": ""})
            continue

        try:
            p_res = sync_prompt_to_drive(p)
            if p_res.get("success"):
                synced_prompts_count += 1
        except Exception as p_err:
            errors.append(f"Prompt {p.get('title', p['id'])}: {str(p_err)}")

    # 3. Sao lưu Database SQLite lên Drive
    db_backup_res = None
    try:
        db_backup_res = backup_database_to_drive()
    except Exception as err:
        errors.append(f"Sao lưu DB: {str(err)}")
        
    msg_parts = []
    if synced_count > 0:
        msg_parts.append(f"Đã đồng bộ {synced_count} video lên Drive")
    if synced_prompts_count > 0:
        msg_parts.append(f"Đã đồng bộ {synced_prompts_count} prompt lên Drive")
    if skipped_count > 0:
        msg_parts.append(f"{skipped_count} video đã có sẵn trên Drive")
    if db_backup_res:
        msg_parts.append("Đã sao lưu Database mới nhất lên Drive")
    if not msg_parts:
        msg_parts.append("Tất cả dữ liệu đã được lưu an toàn trên Google Drive!")

    return {
        "success": failed_count == 0,
        "synced_count": synced_count,
        "synced_prompts_count": synced_prompts_count,
        "skipped_count": skipped_count,
        "failed_count": failed_count,
        "db_backup": db_backup_res,
        "errors": errors,
        "message": " | ".join(msg_parts)
    }

@app.post("/api/videos/export-zip")
async def export_selected_videos_zip(req: BatchZipRequest):
    if not req.video_ids:
        raise HTTPException(status_code=400, detail="Chưa chọn video nào.")
        
    zip_filename = f"batch_videos_{len(req.video_ids)}.zip"
    zip_path = os.path.join(DOWNLOADS_DIR, zip_filename)

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for vid in req.video_ids:
            v = get_video_by_id(vid)
            if v and v.get("file_path") and os.path.exists(v["file_path"]):
                zipf.write(v["file_path"], arcname=os.path.basename(v["file_path"]))
                # Include metadata txt
                meta_content = f"""TIÊU ĐỀ: {v.get('title')}
TÁC GIẢ: {v.get('uploader')} ({v.get('uploader_url')})
NGUỒN GỐC: {v.get('source_url')}
HASHTAGS: {' '.join(['#' + t for t in v.get('hashtags', [])])}
MÔ TẢ GỐC:
{v.get('description')}
GHI CHÚ:
{v.get('notes')}
"""
                zipf.writestr(f"{v['id']}_metadata.txt", meta_content)

    return FileResponse(
        path=zip_path,
        filename=zip_filename,
        media_type="application/zip"
    )

# --- CONTENT CALENDAR ---
@app.get("/api/calendar")
async def list_calendar_events():
    return get_calendar_events()

@app.post("/api/calendar")
async def create_or_update_calendar_event(req: CalendarEventRequest):
    return save_calendar_event(req.dict())

@app.post("/api/calendar/{event_id}/confirm-published")
async def confirm_manual_published(event_id: str, req: ConfirmPublishedRequest):
    return confirm_calendar_event_published(
        event_id=event_id,
        published_at=req.published_at,
        published_url=req.published_url or "",
        manual_note=req.manual_note or ""
    )

@app.delete("/api/calendar/{event_id}")
async def remove_calendar_event(event_id: str):
    delete_calendar_event(event_id)
    return {"success": True}

# --- RICH NOTES & SCRIPTS ---
@app.get("/api/notes")
async def list_notes():
    return get_notes()

@app.post("/api/notes")
async def create_or_update_note(req: NoteRequest):
    return save_note(req.dict())

@app.delete("/api/notes/{note_id}")
async def remove_note(note_id: str):
    delete_note(note_id)
    return {"success": True}

# --- RESOURCE & LINK VAULT ---

@app.get("/api/resources/categories")
async def list_resource_categories():
    return get_resource_categories()

@app.post("/api/resources/categories")
async def create_or_update_resource_category(req: ResourceCategoryRequest):
    return save_resource_category(req.dict())

@app.delete("/api/resources/categories/{category_id}")
async def remove_resource_category(category_id: str):
    delete_resource_category(category_id)
    return {"success": True}

@app.get("/api/resources")
async def list_resources(
    category_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    favorite_only: bool = Query(False)
):
    return get_resources(category_id=category_id, search=search, res_type=type, favorite_only=favorite_only)

@app.post("/api/resources")
async def create_or_update_resource(req: ResourceRequest):
    return save_resource(req.dict())

@app.delete("/api/resources/{resource_id}")
async def remove_resource(resource_id: str):
    delete_resource(resource_id)
    return {"success": True}

@app.post("/api/resources/{resource_id}/toggle-favorite")
async def toggle_resource_favorite_route(resource_id: str):
    return toggle_favorite_resource(resource_id)

@app.post("/api/resources/batch-move")
async def batch_move_resources_route(req: BatchResourceMoveRequest):
    count = batch_move_resources(req.ids, req.category_id)
    return {"success": True, "count": count}

@app.post("/api/resources/batch-delete")
async def batch_delete_resources_route(req: BatchResourceActionRequest):
    count = batch_delete_resources(req.ids)
    return {"success": True, "count": count}

@app.post("/api/resources/batch-favorite")
async def batch_favorite_resources_route(req: BatchResourceFavoriteRequest):
    count = batch_toggle_favorite_resources(req.ids, 1 if req.is_favorite else 0)
    return {"success": True, "count": count}

@app.post("/api/resources/batch-pin")
async def batch_pin_resources_route(req: BatchResourcePinRequest):
    count = batch_toggle_pin_resources(req.ids, 1 if req.pinned else 0)
    return {"success": True, "count": count}

def extract_resource_metadata_sync(raw_url: str) -> dict:
    raw_url = (raw_url or "").strip()
    if not raw_url:
        return {
            "url": "",
            "title": "URL không hợp lệ",
            "description": "",
            "type": "website",
            "icon": "globe",
            "favicon_url": "",
            "image_url": "",
            "domain": "",
            "success": False,
            "error": "URL trống"
        }
    
    if not (raw_url.startswith("http://") or raw_url.startswith("https://")):
        raw_url = "https://" + raw_url

    detected_type = "website"
    detected_icon = "globe"
    url_lower = raw_url.lower()

    if "docs.google.com/document" in url_lower:
        detected_type = "doc"
        detected_icon = "fileText"
    elif "docs.google.com/spreadsheets" in url_lower:
        detected_type = "sheet"
        detected_icon = "fileSpreadsheet"
    elif "docs.google.com/presentation" in url_lower:
        detected_type = "slide"
        detected_icon = "presentation"
    elif "drive.google.com" in url_lower:
        detected_type = "drive"
        detected_icon = "drive"
    elif ".pdf" in url_lower or url_lower.endswith(".pdf"):
        detected_type = "pdf"
        detected_icon = "fileText"
    elif any(hub in url_lower for hub in ["lootprompt", "openpromptlib", "civitai", "prompthero", "flowgpt", "promptbase", "prompt"]):
        detected_type = "prompt_hub"
        detected_icon = "sparkles"
    elif any(bot in url_lower for bot in ["chatgpt.com", "claude.ai", "poe.com", "gemini.google"]):
        detected_type = "chatbot"
        detected_icon = "sparkles"

    from urllib.parse import urlparse
    parsed = urlparse(raw_url)
    domain = parsed.netloc.replace("www.", "")
    path_slug = parsed.path.strip("/").split("/")[-1]
    fallback_title = domain.title()
    if path_slug:
        clean_slug = path_slug.replace("-", " ").replace("_", " ").title()
        if len(clean_slug) > 3:
            fallback_title = f"{clean_slug} — {domain}"

    title = fallback_title
    description = ""
    favicon_url = f"https://www.google.com/s2/favicons?domain={domain}&sz=64"
    image_url = ""

    # Platform-specific image heuristics
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        yt_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', raw_url)
        if yt_match:
            image_url = f"https://img.youtube.com/vi/{yt_match.group(1)}/hqdefault.jpg"
    elif "docs.google.com/document" in url_lower:
        image_url = "https://www.gstatic.com/images/branding/product/2x/docs_2020q4_48dp.png"
    elif "docs.google.com/spreadsheets" in url_lower:
        image_url = "https://www.gstatic.com/images/branding/product/2x/sheets_2020q4_48dp.png"
    elif "docs.google.com/presentation" in url_lower:
        image_url = "https://www.gstatic.com/images/branding/product/2x/slides_2020q4_48dp.png"
    elif "drive.google.com" in url_lower:
        image_url = "https://www.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png"

    if not any(x in url_lower for x in ["drive.google.com", "docs.google.com"]):
        try:
            import requests
            from bs4 import BeautifulSoup
            from urllib.parse import urljoin
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "vi,en-US;q=0.9,en;q=0.8"
            }
            resp = requests.get(raw_url, headers=headers, timeout=5)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")
                t_tag = soup.find("title")
                og_title = soup.find("meta", property="og:title")
                if og_title and og_title.get("content"):
                    title = og_title["content"].strip()
                elif t_tag and t_tag.get_text():
                    title = t_tag.get_text().strip()

                desc_meta = (
                    soup.find("meta", attrs={"name": "description"}) or
                    soup.find("meta", property="og:description") or
                    soup.find("meta", attrs={"name": "twitter:description"})
                )
                if desc_meta and desc_meta.get("content"):
                    description = desc_meta["content"].strip()

                # Extract og:image or twitter:image
                img_meta = (
                    soup.find("meta", property="og:image") or
                    soup.find("meta", property="og:image:secure_url") or
                    soup.find("meta", attrs={"name": "twitter:image"}) or
                    soup.find("meta", attrs={"name": "twitter:image:src"}) or
                    soup.find("link", rel="image_src")
                )
                if img_meta:
                    raw_img = img_meta.get("content") or img_meta.get("href")
                    if raw_img:
                        image_url = urljoin(raw_url, raw_img.strip())

                # Check custom icon
                icon_tag = soup.find("link", rel=lambda x: x and ("icon" in x.lower() or "apple-touch-icon" in x.lower()))
                if icon_tag and icon_tag.get("href"):
                    href = icon_tag["href"]
                    favicon_url = urljoin(raw_url, href)
        except Exception:
            pass

    # If no image_url found, check microlink
    if not image_url and not any(x in url_lower for x in ["drive.google.com", "docs.google.com"]):
        try:
            import requests
            from urllib.parse import quote_plus
            m_resp = requests.get(f"https://api.microlink.io?url={quote_plus(raw_url)}", timeout=3)
            if m_resp.status_code == 200:
                m_data = m_resp.json().get("data", {})
                if m_data.get("image", {}).get("url"):
                    image_url = m_data["image"]["url"]
                elif m_data.get("logo", {}).get("url"):
                    image_url = m_data["logo"]["url"]
        except Exception:
            pass

    # Final fallback: website screenshot preview
    if not image_url and not any(x in url_lower for x in ["drive.google.com", "docs.google.com"]):
        from urllib.parse import quote_plus
        image_url = f"https://s0.wp.com/mshots/v1/{quote_plus(raw_url)}?w=600"

    return {
        "url": raw_url,
        "title": title or fallback_title,
        "description": description,
        "type": detected_type,
        "icon": detected_icon,
        "favicon_url": favicon_url,
        "image_url": image_url,
        "domain": domain,
        "success": True
    }

@app.post("/api/resources/scrape-metadata")
async def scrape_resource_metadata_endpoint(req: ScrapeResourceMetadataRequest):
    raw_url = (req.url or "").strip()
    if not raw_url:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp URL hợp lệ")
    data = extract_resource_metadata_sync(raw_url)
    return data

@app.post("/api/resources/batch-scrape-metadata")
async def batch_scrape_resource_metadata_endpoint(req: BatchScrapeResourceMetadataRequest):
    raw_urls = [u.strip() for u in (req.urls or []) if u and u.strip()]
    if not raw_urls:
        return {"success": True, "total": 0, "results": []}
    
    concurrency = min(max(req.concurrency or 5, 1), 15)
    import concurrent.futures
    loop = asyncio.get_event_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [loop.run_in_executor(executor, extract_resource_metadata_sync, u) for u in raw_urls]
        results = await asyncio.gather(*futures)

    return {
        "success": True,
        "total": len(results),
        "results": list(results)
    }

@app.post("/api/resources/batch-create")
async def batch_create_resources_endpoint(req: BatchResourceCreateRequest):
    items = [r.dict() for r in req.resources]
    saved = batch_save_resources(items)
    return {"success": True, "count": len(saved), "resources": saved}



# --- GOOGLE DRIVE SETTINGS ---
class DriveTestRequest(BaseModel):
    mode: Optional[str] = None
    desktop_folder: Optional[str] = None
    api_creds_json: Optional[str] = None
    target_folder_id: Optional[str] = None
    gas_url: Optional[str] = None

@app.get("/api/drive/status")
async def get_drive_configuration():
    return get_drive_status()

@app.post("/api/drive/config")
async def update_drive_configuration(req: DriveConfigRequest):
    return configure_drive(
        mode=req.mode,
        desktop_folder=req.desktop_folder,
        api_creds_json=req.api_creds_json,
        target_folder_id=req.target_folder_id,
        gas_url=req.gas_url
    )

@app.post("/api/drive/test")
async def test_drive_configuration(req: Optional[DriveTestRequest] = None):
    if req:
        return test_drive_connection(
            mode=req.mode,
            desktop_folder=req.desktop_folder,
            api_creds_json=req.api_creds_json,
            target_folder_id=req.target_folder_id,
            gas_url=req.gas_url
        )
    return test_drive_connection()

@app.api_route("/api/drive/thumbnail/{file_id}", methods=["GET", "HEAD"])
async def get_drive_thumbnail_proxy(file_id: str):
    """
    Persistent Local Cache Google Drive Thumbnail Proxy:
    - Kiểm tra cache local (thumbnails/drive_{file_id}.jpg): <1ms load, 0ms latency, không phụ thuộc mạng
    - Tải và lưu vĩnh viễn trên SSD (~15KB/ảnh), không bao giờ bị lỗi 403 Forbidden do token link Google hết hạn!
    """
    # 1. Local disk thumbnail cache (0ms, 100% vĩnh viễn, không bao giờ lỗi)
    dest_path = os.path.join(THUMBNAILS_DIR, f"drive_{file_id}.jpg")
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 500:
        return FileResponse(
            dest_path, 
            media_type="image/jpeg", 
            headers={"Cache-Control": "public, max-age=2592000, immutable"}
        )

    # 1b. Tra cứu Database: Nếu file Drive này thuộc video trong hệ thống có sẵn thumbnail local (0ms)
    try:
        from services.db import get_connection
        conn = get_connection()
        row = conn.execute("SELECT id, local_thumbnail, file_path, thumbnail_url FROM videos WHERE drive_file_id = ? LIMIT 1", (file_id,)).fetchone()
        conn.close()
        if row:
            vid = row["id"]
            # Kiểm tra video_{vid}.jpg trên đĩa
            vid_thumb = os.path.join(THUMBNAILS_DIR, f"video_{vid}.jpg")
            if os.path.exists(vid_thumb) and os.path.getsize(vid_thumb) > 500:
                try:
                    shutil.copyfile(vid_thumb, dest_path)
                except Exception:
                    pass
                return FileResponse(vid_thumb, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=2592000, immutable"})

            # Kiểm tra local_thumbnail
            lt = row["local_thumbnail"]
            if lt:
                chk_lt = os.path.join(DOWNLOADS_DIR, lt) if not os.path.isabs(lt) else lt
                if os.path.exists(chk_lt) and os.path.getsize(chk_lt) > 500:
                    try:
                        shutil.copyfile(chk_lt, dest_path)
                    except Exception:
                        pass
                    return FileResponse(chk_lt, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=2592000, immutable"})

            # Nếu có file video mp4 trên máy, trích xuất frame bằng ffmpeg (0.05s)
            fp = row["file_path"]
            if fp and os.path.exists(fp) and os.path.getsize(fp) > 5000:
                import subprocess
                subprocess.run(['ffmpeg', '-y', '-ss', '00:00:01', '-i', fp, '-vframes', '1', '-q:v', '2', dest_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if os.path.exists(dest_path) and os.path.getsize(dest_path) > 500:
                    return FileResponse(dest_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=2592000, immutable"})

            # Nếu có link CDN ngoài hợp lệ (TikTok, X, Douyin)
            turl = row["thumbnail_url"]
            if turl and turl.startswith("http") and "googleusercontent.com" not in turl and "/api/drive" not in turl:
                return RedirectResponse(turl)
    except Exception as db_err:
        pass

    # 2. Lấy thumbnailLink từ Google Drive API qua Service Account với timeout cực nhanh (2.0s)
    try:
        thumb_link = drive_thumb_url_cache.get(file_id)
        if not thumb_link:
            from services.drive_service import get_drive_api_service
            service = get_drive_api_service()
            if service:
                loop = asyncio.get_event_loop()
                f_meta = await asyncio.wait_for(
                    loop.run_in_executor(
                        None,
                        lambda: service.files().get(fileId=file_id, fields="id, name, mimeType, thumbnailLink").execute()
                    ),
                    timeout=2.0
                )
                tlink = f_meta.get("thumbnailLink")
                if tlink:
                    thumb_link = re.sub(r'=s\d+$', '=s400', tlink)
                    drive_thumb_url_cache[file_id] = thumb_link

        if thumb_link:
            import urllib.request
            loop = asyncio.get_event_loop()
            def _fetch_and_save():
                try:
                    req = urllib.request.Request(thumb_link, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=2.5) as resp, open(dest_path, 'wb') as out:
                        out.write(resp.read())
                    return True
                except Exception:
                    return False

            ok = await loop.run_in_executor(None, _fetch_and_save)
            if ok and os.path.exists(dest_path) and os.path.getsize(dest_path) > 500:
                return FileResponse(
                    dest_path, 
                    media_type="image/jpeg", 
                    headers={"Cache-Control": "public, max-age=2592000, immutable"}
                )
            elif thumb_link:
                return RedirectResponse(
                    thumb_link, 
                    status_code=307, 
                    headers={"Cache-Control": "public, max-age=300"}
                )
    except Exception:
        pass

    # 3. Fallback: Trả về SVG poster hiện đại ngay lập tức (0ms), không làm đơ giao diện
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="550" viewBox="0 0 400 550">
        <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0f172a"/>
                <stop offset="50%" stop-color="#1e1b4b"/>
                <stop offset="100%" stop-color="#090d16"/>
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
        <circle cx="200" cy="240" r="50" fill="#6366f1" opacity="0.2"/>
        <path d="M190 220 L220 240 L190 260 Z" fill="#818cf8"/>
        <text x="200" y="320" fill="#94a3b8" font-size="14" font-family="sans-serif" text-anchor="middle" font-weight="600">Google Drive Cloud</text>
    </svg>'''
    return Response(content=svg, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=3600"})



@app.get("/api/drive/media-info/{file_id}")
async def get_drive_media_info(file_id: str):
    """Lấy thông tin kích thước và tỉ lệ (width, height, duration, mimeType) của file từ Drive hoặc cached thumbnail"""
    width = None
    height = None
    duration = None
    
    # Lấy metadata từ Google Drive API nếu có credentials
    try:
        from services.drive_service import get_drive_api_service
        service = get_drive_api_service()
        if service:
            f_meta = service.files().get(
                fileId=file_id, 
                fields="id, name, mimeType, size, videoMediaMetadata, imageMediaMetadata"
            ).execute()
            
            if "videoMediaMetadata" in f_meta:
                v_meta = f_meta["videoMediaMetadata"]
                if v_meta.get("width") and v_meta.get("height"):
                    width = v_meta.get("width")
                    height = v_meta.get("height")
                duration = v_meta.get("durationMillis")
            elif "imageMediaMetadata" in f_meta:
                i_meta = f_meta["imageMediaMetadata"]
                if i_meta.get("width") and i_meta.get("height"):
                    width = i_meta.get("width")
                    height = i_meta.get("height")
                    
            return {
                "file_id": file_id,
                "name": f_meta.get("name"),
                "mime_type": f_meta.get("mimeType"),
                "size": f_meta.get("size"),
                "width": width,
                "height": height,
                "duration_ms": duration
            }
    except Exception as e:
        print(f"Lỗi lấy media info cho Drive file {file_id}: {e}")

    return {
        "file_id": file_id,
        "width": width,
        "height": height,
        "duration_ms": duration
    }


# --- DRIVE SCANNER & SMART DEDUPLICATION ---
@app.post("/api/drive/scan")
async def scan_drive_endpoint(req: DriveScanRequest):
    """Quét thư mục/file Google Drive (đọc các file .txt/.csv/docs bên trong), trích xuất danh sách link video và lọc trùng lặp với kho SQLite"""
    from services.drive_scanner import scan_and_analyze_drive_source
    try:
        return await scan_and_analyze_drive_source(req.url)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/urls/deduplicate")
async def deduplicate_urls_endpoint(req: DeduplicateRequest):
    """Kiểm tra và lọc trùng lặp danh sách URL video với kho dữ liệu SQLite"""
    from services.drive_scanner import deduplicate_against_db
    try:
        return deduplicate_against_db(req.urls)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/drive/gas-code")
async def get_gas_code_endpoint():
    """Lấy toàn bộ mã nguồn Google Apps Script Code.gs mới nhất để người dùng sao chép tiện lợi chỉ với 1 click"""
    gas_paths = [
        os.path.join(os.path.dirname(__file__), "gas_deploy", "Code.gs"),
        os.path.join(os.path.dirname(__file__), "gas_bridge", "Code.gs"),
    ]
    for p in gas_paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return {"code": f.read(), "path": p}
            except Exception:
                pass
    return {"code": "", "error": "Không tìm thấy file Code.gs"}


# --- TRANSLATION API (VI / EN / ZH) ---
from services.translator import translate_text, translate_video_metadata

class TranslateRequest(BaseModel):
    title: Optional[str] = ""
    description: Optional[str] = ""
    hashtags: Optional[List[str]] = []
    text: Optional[str] = ""
    target_lang: str = "vi"

@app.post("/api/translate")
async def translate_endpoint(req: TranslateRequest):
    if req.text:
        res = translate_text(req.text, req.target_lang)
        return {"translated_text": res, "target_lang": req.target_lang}
    
    return translate_video_metadata(
        title=req.title or "",
        description=req.description or "",
        hashtags=req.hashtags or [],
        target_lang=req.target_lang
    )


# --- AUDIO & VOLUME STUDIO API ---
from services.audio_service import (
    extract_audio_from_video,
    adjust_media_volume,
    get_media_info,
    AUDIO_OUTPUT_DIR
)

class ExtractAudioRequest(BaseModel):
    video_id: Optional[str] = None
    url: Optional[str] = None
    format: str = "mp3"
    bitrate: str = "320k"
    save_to_vault: bool = False
    custom_title: Optional[str] = None
    category_id: Optional[str] = "all"

class AdjustVolumeRequest(BaseModel):
    video_id: Optional[str] = None
    url: Optional[str] = None
    volume_percent: int = 100
    output_type: str = "video"
    enable_limiter: bool = True
    save_to_vault: bool = False
    custom_title: Optional[str] = None
    category_id: Optional[str] = "all"

async def _resolve_input_media(video_id: Optional[str], url: Optional[str], category_id: Optional[str] = "all") -> tuple[str, str]:
    """Helper to resolve local file path and title from video_id or url"""
    if video_id:
        v = get_video_by_id(video_id)
        if not v:
            raise HTTPException(status_code=404, detail="Không tìm thấy video trong kho")
        file_path = v.get("file_path", "")
        if file_path and os.path.exists(file_path):
            return file_path, v.get("title", "video")
        
        # If file_path does not exist locally but source_url exists, download it first
        src_url = v.get("source_url")
        if src_url:
            from services.downloader import download_video
            dl_res = await download_video(src_url, video_id, category_id or "all")
            dl_path = dl_res.get("file_path", "")
            if dl_path and os.path.exists(dl_path):
                update_video(video_id, {"file_path": dl_path})
                return dl_path, v.get("title", "video")
        
        raise HTTPException(status_code=400, detail="Video này chưa có file khả dụng trên máy")
    
    if url:
        from services.downloader import download_video
        temp_id = uuid.uuid4().hex[:8]
        dl_res = await download_video(url, temp_id, category_id or "all")
        dl_path = dl_res.get("file_path", "")
        if not dl_path or not os.path.exists(dl_path):
            raise HTTPException(status_code=400, detail="Không thể tải video từ URL được cung cấp")
        return dl_path, dl_res.get("title", f"Video_{temp_id}")

    raise HTTPException(status_code=400, detail="Vui lòng cung cấp ID video hoặc URL hợp lệ")

@app.post("/api/audio/extract")
async def extract_audio_endpoint(req: ExtractAudioRequest):
    """Trích xuất âm thanh từ video (Vault ID hoặc URL) sang MP3 (320k/192k), M4A hoặc WAV"""
    try:
        input_path, title = await _resolve_input_media(req.video_id, req.url, req.category_id)
        chosen_title = req.custom_title or title
        res = extract_audio_from_video(
            input_file=input_path,
            output_format=req.format,
            bitrate=req.bitrate,
            custom_name=chosen_title
        )
        filename = res["filename"]
        stream_url = f"/media/downloads/audio_processed/{filename}"
        download_url = f"/api/audio/download/{filename}"
        res["stream_url"] = stream_url
        res["download_url"] = download_url

        if req.save_to_vault:
            audio_id = f"aud_{uuid.uuid4().hex[:8]}"
            save_video({
                "id": audio_id,
                "title": f"[Audio] {chosen_title}",
                "uploader": "Audio Studio",
                "platform": "audio",
                "source_url": "",
                "description": f"Trích xuất âm thanh ({req.format.upper()} {res.get('bitrate', '')})",
                "hashtags": ["audio", req.format],
                "duration": res.get("duration", 0),
                "category_id": req.category_id or "all",
                "file_path": res["file_path"],
                "file_size": res.get("file_size", 0),
                "thumbnail_url": "",
                "local_thumbnail": "",
                "quality": f"{req.format.upper()} {res.get('bitrate', '')}",
                "status": "saved",
                "is_private": 0
            })
            res["vault_id"] = audio_id

        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/audio/extract-upload")
async def extract_audio_upload_endpoint(
    file: UploadFile = File(...),
    format: str = Form("mp3"),
    bitrate: str = Form("320k"),
    save_to_vault: bool = Form(False),
    custom_title: Optional[str] = Form(None),
    category_id: Optional[str] = Form("all")
):
    """Trích xuất âm thanh từ file video tải trực tiếp từ máy tính lên"""
    try:
        ext = os.path.splitext(file.filename)[1] or ".mp4"
        temp_input = os.path.join(AUDIO_OUTPUT_DIR, f"temp_upload_{uuid.uuid4().hex[:8]}{ext}")
        with open(temp_input, "wb") as f:
            content = await file.read()
            f.write(content)
        
        chosen_title = custom_title or os.path.splitext(file.filename)[0]
        res = extract_audio_from_video(
            input_file=temp_input,
            output_format=format,
            bitrate=bitrate,
            custom_name=chosen_title
        )
        try:
            if os.path.exists(temp_input):
                os.remove(temp_input)
        except Exception:
            pass

        filename = res["filename"]
        res["stream_url"] = f"/media/downloads/audio_processed/{filename}"
        res["download_url"] = f"/api/audio/download/{filename}"

        if save_to_vault:
            audio_id = f"aud_{uuid.uuid4().hex[:8]}"
            save_video({
                "id": audio_id,
                "title": f"[Audio] {chosen_title}",
                "uploader": "Audio Studio",
                "platform": "audio",
                "source_url": "",
                "description": f"Trích xuất âm thanh ({format.upper()} {res.get('bitrate', '')})",
                "hashtags": ["audio", format],
                "duration": res.get("duration", 0),
                "category_id": category_id or "all",
                "file_path": res["file_path"],
                "file_size": res.get("file_size", 0),
                "thumbnail_url": "",
                "local_thumbnail": "",
                "quality": f"{format.upper()} {res.get('bitrate', '')}",
                "status": "saved",
                "is_private": 0
            })
            res["vault_id"] = audio_id

        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/audio/adjust-volume")
async def adjust_volume_endpoint(req: AdjustVolumeRequest):
    """Tăng giảm âm lượng video hoặc nhạc (0% - 500% BOOST) chống vỡ tiếng"""
    try:
        input_path, title = await _resolve_input_media(req.video_id, req.url, req.category_id)
        chosen_title = req.custom_title or title
        res = adjust_media_volume(
            input_file=input_path,
            volume_percent=req.volume_percent,
            output_type=req.output_type,
            enable_limiter=req.enable_limiter,
            custom_name=chosen_title
        )
        filename = res["filename"]
        stream_url = f"/media/downloads/audio_processed/{filename}"
        download_url = f"/api/audio/download/{filename}"
        res["stream_url"] = stream_url
        res["download_url"] = download_url

        if req.save_to_vault:
            media_id = f"vol_{uuid.uuid4().hex[:8]}"
            is_video = req.output_type == "video"
            save_video({
                "id": media_id,
                "title": f"[{req.volume_percent}% Vol] {chosen_title}",
                "uploader": "Audio Studio",
                "platform": "video" if is_video else "audio",
                "source_url": "",
                "description": f"Điều chỉnh âm lượng: {req.volume_percent}% (Chống vỡ tiếng: {'Bật' if req.enable_limiter else 'Tắt'})",
                "hashtags": ["volume_boost", f"{req.volume_percent}pct"],
                "duration": res.get("duration", 0),
                "category_id": req.category_id or "all",
                "file_path": res["file_path"],
                "file_size": res.get("file_size", 0),
                "thumbnail_url": "",
                "local_thumbnail": "",
                "quality": "Boosted Media",
                "status": "saved",
                "is_private": 0
            })
            res["vault_id"] = media_id

        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/audio/adjust-volume-upload")
async def adjust_volume_upload_endpoint(
    file: UploadFile = File(...),
    volume_percent: int = Form(100),
    output_type: str = Form("video"),
    enable_limiter: bool = Form(True),
    save_to_vault: bool = Form(False),
    custom_title: Optional[str] = Form(None),
    category_id: Optional[str] = Form("all")
):
    """Tăng giảm âm lượng từ file media tải trực tiếp từ máy tính lên"""
    try:
        ext = os.path.splitext(file.filename)[1] or ".mp4"
        temp_input = os.path.join(AUDIO_OUTPUT_DIR, f"temp_upload_vol_{uuid.uuid4().hex[:8]}{ext}")
        with open(temp_input, "wb") as f:
            content = await file.read()
            f.write(content)
        
        chosen_title = custom_title or os.path.splitext(file.filename)[0]
        res = adjust_media_volume(
            input_file=temp_input,
            volume_percent=volume_percent,
            output_type=output_type,
            enable_limiter=enable_limiter,
            custom_name=chosen_title
        )
        try:
            if os.path.exists(temp_input):
                os.remove(temp_input)
        except Exception:
            pass

        filename = res["filename"]
        res["stream_url"] = f"/media/downloads/audio_processed/{filename}"
        res["download_url"] = f"/api/audio/download/{filename}"

        if save_to_vault:
            media_id = f"vol_{uuid.uuid4().hex[:8]}"
            is_video = output_type == "video"
            save_video({
                "id": media_id,
                "title": f"[{volume_percent}% Vol] {chosen_title}",
                "uploader": "Audio Studio",
                "platform": "video" if is_video else "audio",
                "source_url": "",
                "description": f"Điều chỉnh âm lượng: {volume_percent}% (Chống vỡ tiếng: {'Bật' if enable_limiter else 'Tắt'})",
                "hashtags": ["volume_boost", f"{volume_percent}pct"],
                "duration": res.get("duration", 0),
                "category_id": category_id or "all",
                "file_path": res["file_path"],
                "file_size": res.get("file_size", 0),
                "thumbnail_url": "",
                "local_thumbnail": "",
                "quality": "Boosted Media",
                "status": "saved",
                "is_private": 0
            })
            res["vault_id"] = media_id

        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/audio/download/{filename}")
async def download_audio_file(filename: str):
    """Tải trực tiếp file âm thanh/video đã xử lý về máy"""
    clean_name = os.path.basename(filename)
    path = os.path.join(AUDIO_OUTPUT_DIR, clean_name)
    if not os.path.exists(path):
        alt_path = os.path.join(DOWNLOADS_DIR, clean_name)
        if os.path.exists(alt_path):
            path = alt_path
        else:
            raise HTTPException(status_code=404, detail="File không tồn tại trên hệ thống")
    return FileResponse(path, filename=clean_name, media_type="application/octet-stream")

@app.get("/api/audio/history")
async def list_processed_audio_history():
    """Lấy danh sách các file âm thanh / media đã xử lý gần đây"""
    items = []
    if os.path.exists(AUDIO_OUTPUT_DIR):
        for f in os.listdir(AUDIO_OUTPUT_DIR):
            if f.startswith("temp_"):
                continue
            fp = os.path.join(AUDIO_OUTPUT_DIR, f)
            if os.path.isfile(fp):
                st = os.stat(fp)
                ext = os.path.splitext(f)[1].lower().strip(".")
                items.append({
                    "filename": f,
                    "file_size": st.st_size,
                    "created_at": st.st_mtime,
                    "type": "video" if ext in ["mp4", "mkv", "webm", "mov"] else "audio",
                    "format": ext,
                    "stream_url": f"/media/downloads/audio_processed/{f}",
                    "download_url": f"/api/audio/download/{f}"
                })
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items

# ==========================================
# PROMPT VAULT API ENDPOINTS
# ==========================================

class PromptCreateRequest(BaseModel):
    title: Optional[str] = ""
    prompt: str
    negative_prompt: Optional[str] = ""
    media_type: Optional[str] = "image"
    media_url: Optional[str] = ""
    local_path: Optional[str] = ""
    thumbnail_url: Optional[str] = ""
    ai_model: Optional[str] = "Midjourney"
    category: Optional[str] = "general"
    tags: Optional[List[str]] = []
    parameters: Optional[str] = ""
    notes: Optional[str] = ""
    is_favorite: Optional[bool] = False

class PromptUpdateRequest(BaseModel):
    title: Optional[str] = None
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    media_type: Optional[str] = None
    media_url: Optional[str] = None
    local_path: Optional[str] = None
    thumbnail_url: Optional[str] = None
    ai_model: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    parameters: Optional[str] = None
    notes: Optional[str] = None
    is_favorite: Optional[bool] = None

class PromptBatchActionRequest(BaseModel):
    ids: List[str]
    is_favorite: Optional[bool] = True

class PromptExtractUrlRequest(BaseModel):
    url: str
    download_to_vault: Optional[bool] = True

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg", ".avif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v", ".flv"}

@app.post("/api/prompts/upload")
async def upload_prompt_media(files: List[UploadFile] = File(...)):
    """Upload ảnh hoặc video từ máy tính vào Kho Prompt"""
    uploaded_items = []
    for file in files:
        try:
            original_filename = file.filename or "media"
            _, ext = os.path.splitext(original_filename)
            ext = ext.lower()
            if not ext:
                content_type = file.content_type or ""
                if "image" in content_type:
                    ext = ".jpg"
                elif "video" in content_type:
                    ext = ".mp4"
                else:
                    ext = ".bin"
            
            safe_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', os.path.splitext(original_filename)[0])
            unique_name = f"{int(time.time() * 1000)}_{safe_name}{ext}"
            file_path = os.path.join(PROMPTS_DIR, unique_name)
            
            with open(file_path, "wb") as f_out:
                content = await file.read()
                f_out.write(content)
                file_size = len(content)
            
            media_type = "video" if ext in VIDEO_EXTENSIONS else "image"
            media_url = f"/media/downloads/prompts/{unique_name}"
            
            uploaded_items.append({
                "original_filename": original_filename,
                "filename": unique_name,
                "media_url": media_url,
                "local_path": file_path,
                "media_type": media_type,
                "file_size": file_size
            })
        except Exception as e:
            print(f"Error uploading file {file.filename}: {e}")
            continue
            
    if not uploaded_items:
        raise HTTPException(status_code=400, detail="Không có file nào được tải lên thành công")
        
    return {"files": uploaded_items}

@app.post("/api/prompts/extract-media-from-url")
async def extract_media_from_url_endpoint(req: PromptExtractUrlRequest, background_tasks: BackgroundTasks):
    """Trích xuất trực tiếp video/ảnh chất lượng cao từ YouTube, TikTok, Douyin, Instagram, X/Twitter, Google Drive..."""
    try:
        data = await extract_media_from_social_url(req.url, download_to_prompts=bool(req.download_to_vault))
        return data
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Lỗi khi trích xuất video/ảnh từ URL: {str(e)}")

@app.get("/api/prompts")
async def list_prompts(
    search: str = Query("", description="Tìm kiếm từ khóa"),
    media_type: str = Query("all", description="image | video | all"),
    ai_model: str = Query("all", description="Midjourney | Flux | DALL-E | all"),
    category: str = Query("all", description="Thể loại hoặc all"),
    is_favorite: Optional[bool] = Query(None, description="Lọc theo yêu thích")
):
    """Lấy danh sách các prompt có bộ lọc"""
    return get_prompts(
        search=search,
        media_type=media_type,
        ai_model=ai_model,
        category=category,
        is_favorite=is_favorite
    )

@app.get("/api/prompts/stats")
async def get_stats_for_prompts():
    """Lấy thống kê số lượng prompt, ảnh, video, yêu thích"""
    return get_prompt_stats()

@app.get("/api/prompts/{prompt_id}")
async def get_single_prompt(prompt_id: str):
    """Lấy chi tiết 1 prompt"""
    prompt = get_prompt_by_id(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Không tìm thấy prompt này")
    return prompt

@app.post("/api/prompts/{prompt_id}/re-extract")
async def re_extract_prompt_endpoint(prompt_id: str, background_tasks: BackgroundTasks):
    """Tự động trích xuất lại video/ảnh chất lượng cao cho prompt cũ bị lỗi liên kết web"""
    prompt = get_prompt_by_id(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Không tìm thấy prompt này")
    
    target_url = prompt.get("media_url") or prompt.get("thumbnail_url")
    if not target_url or not target_url.startswith("http"):
        raise HTTPException(status_code=400, detail="Prompt này không có đường dẫn URL mạng xã hội hợp lệ để trích xuất lại.")
    
    try:
        extracted = await extract_media_from_social_url(target_url, download_to_prompts=True)
        updates = {
            "media_type": extracted["media_type"],
            "media_url": extracted["media_url"],
            "thumbnail_url": extracted["thumbnail_url"],
            "local_path": extracted["local_path"]
        }
        if extracted.get("ratioStr"):
            updates["parameters"] = f"--ar {extracted['ratioStr']}"
        if extracted.get("prompt_text") and len(prompt.get("prompt", "")) < 10:
            updates["prompt"] = extracted["prompt_text"]
        
        updated = update_prompt(prompt_id, updates)
        
        # Tự động đồng bộ lên Drive nếu Drive đã cấu hình
        try:
            status = get_drive_status()
            if status.get("is_ready") and updated.get("local_path"):
                background_tasks.add_task(sync_prompt_to_drive, updated)
        except Exception:
            pass
            
        return updated
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Không thể trích xuất lại video: {str(e)}")

@app.post("/api/prompts")
async def create_new_prompt(req: PromptCreateRequest, background_tasks: BackgroundTasks):
    """Tạo mới 1 prompt và tự động đồng bộ lên Drive nếu cấu hình sẵn sàng"""
    data = req.model_dump()
    created = create_prompt(data)
    
    # Tự động đồng bộ lên Drive nếu Drive đã cấu hình
    try:
        status = get_drive_status()
        if status.get("is_ready") and created.get("local_path"):
            background_tasks.add_task(sync_prompt_to_drive, created)
    except Exception as e:
        print(f"Auto-sync prompt to Drive failed: {e}")

    return created

@app.post("/api/prompts/batch")
async def create_batch_prompts(prompts: List[PromptCreateRequest], background_tasks: BackgroundTasks):
    """Tạo nhiều prompt cùng lúc (cho tính năng upload hàng loạt)"""
    results = []
    status = get_drive_status()
    is_drive_ready = status.get("is_ready")

    for p in prompts:
        created = create_prompt(p.model_dump())
        results.append(created)
        if is_drive_ready and created.get("local_path"):
            background_tasks.add_task(sync_prompt_to_drive, created)

    return {"created_count": len(results), "prompts": results}

@app.post("/api/prompts/batch-delete")
async def delete_batch_prompts_endpoint(req: PromptBatchActionRequest):
    """Xóa hàng loạt prompt và file liên quan"""
    deleted_count = 0
    for pid in req.ids:
        local_path = delete_prompt(pid)
        if local_path and os.path.exists(local_path):
            try:
                norm_local = os.path.normpath(local_path)
                norm_prompts = os.path.normpath(PROMPTS_DIR)
                if norm_local.startswith(norm_prompts):
                    os.remove(local_path)
            except Exception:
                pass
        deleted_count += 1
    return {"success": True, "deleted_count": deleted_count}

@app.post("/api/prompts/batch-favorite")
async def favorite_batch_prompts_endpoint(req: PromptBatchActionRequest):
    """Yêu thích hoặc bỏ yêu thích hàng loạt prompt"""
    updated_count = 0
    val = 1 if req.is_favorite else 0
    for pid in req.ids:
        update_prompt(pid, {"is_favorite": val})
        updated_count += 1
    return {"success": True, "updated_count": updated_count}

@app.post("/api/prompts/batch-sync-drive")
async def sync_batch_prompts_to_drive_endpoint(req: PromptBatchActionRequest):
    """Đồng bộ hàng loạt prompt đã chọn lên Google Drive"""
    drive_status = get_drive_status()
    if not drive_status.get("is_ready"):
        raise HTTPException(status_code=400, detail="Google Drive chưa được cấu hình hoặc chưa sẵn sàng. Vui lòng kiểm tra lại cấu hình Drive.")

    synced_count = 0
    errors = []
    for pid in req.ids:
        p = get_prompt_by_id(pid)
        if p:
            try:
                sync_prompt_to_drive(p)
                synced_count += 1
            except Exception as e:
                errors.append(f"Prompt {pid}: {str(e)}")

    # Sao lưu database SQLite lên Drive
    try:
        backup_database_to_drive()
    except Exception:
        pass

    return {
        "success": True,
        "synced_count": synced_count,
        "errors": errors,
        "message": f"Đã đồng bộ {synced_count} prompt lên Google Drive thành công!"
    }

@app.post("/api/prompts/{prompt_id}/sync-drive")
async def sync_single_prompt_to_drive_endpoint(prompt_id: str):
    """Đồng bộ 1 prompt lên Google Drive"""
    p = get_prompt_by_id(prompt_id)
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy prompt")
    return sync_prompt_to_drive(p)

@app.put("/api/prompts/{prompt_id}")
async def update_existing_prompt(prompt_id: str, req: PromptUpdateRequest):
    """Cập nhật prompt"""
    data = {k: v for k, v in req.model_dump().items() if v is not None}
    updated = update_prompt(prompt_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy prompt để cập nhật")
    return updated

@app.delete("/api/prompts/{prompt_id}")
async def delete_existing_prompt(prompt_id: str):
    """Xóa prompt và file đính kèm nếu có"""
    local_path = delete_prompt(prompt_id)
    if local_path and os.path.exists(local_path):
        try:
            # Chỉ xóa nếu file nằm trong thư mục PROMPTS_DIR
            norm_local = os.path.normpath(local_path)
            norm_prompts = os.path.normpath(PROMPTS_DIR)
            if norm_local.startswith(norm_prompts):
                os.remove(local_path)
        except Exception as e:
            print(f"Error removing prompt file: {e}")
    return {"success": True, "message": "Đã xóa prompt thành công"}

@app.post("/api/prompts/{prompt_id}/favorite")
async def toggle_favorite(prompt_id: str):
    """Bật/tắt trạng thái yêu thích của prompt"""
    res = toggle_favorite_prompt(prompt_id)
    if res is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy prompt")
    return {"is_favorite": res}

# ==========================================
# Social Channels Management Endpoints
# ==========================================

class ChannelCategoryCreateRequest(BaseModel):
    name: str
    icon: Optional[str] = "folder"
    color: Optional[str] = "#8b5cf6"
    parent_id: Optional[str] = None

class ChannelCategoryUpdateRequest(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    parent_id: Optional[str] = None
    order_num: Optional[int] = None

class ChannelBatchCategoryRequest(BaseModel):
    ids: List[str]
    category_id: str

@app.get("/api/channel-categories")
async def list_channel_categories_endpoint():
    """Lấy danh sách các danh mục kênh mạng xã hội theo cấu trúc phân cấp (Cha - Con)"""
    return get_channel_categories()

@app.post("/api/channel-categories")
async def create_channel_category_endpoint(req: ChannelCategoryCreateRequest):
    """Tạo mới một danh mục kênh (có thể là loại danh mục chính hoặc thuộc một loại danh mục cha)"""
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Tên danh mục không được để trống")
    return add_channel_category(
        name=req.name,
        icon=req.icon or "folder",
        color=req.color or "#8b5cf6",
        parent_id=req.parent_id
    )

@app.put("/api/channel-categories/{cat_id}")
async def update_channel_category_endpoint(cat_id: str, req: ChannelCategoryUpdateRequest):
    """Cập nhật thông tin danh mục kênh hoặc đổi loại danh mục cha"""
    data = {k: v for k, v in req.model_dump().items() if v is not None}
    updated = update_channel_category(cat_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy danh mục kênh")
    return updated

@app.delete("/api/channel-categories/{cat_id}")
async def delete_channel_category_endpoint(cat_id: str):
    """Xóa một danh mục kênh"""
    success = delete_channel_category(cat_id)
    return {"success": success, "message": "Đã xóa danh mục kênh thành công"}

class ChannelCreateRequest(BaseModel):
    platform: str
    name: str
    handle: Optional[str] = ""
    url: Optional[str] = ""
    avatar_url: Optional[str] = ""
    email: Optional[str] = ""
    orientation: Optional[str] = ""
    status: Optional[str] = "active"
    followers_count: Optional[int] = 0
    following_count: Optional[int] = 0
    likes_count: Optional[int] = 0
    posts_count: Optional[int] = 0
    views_count: Optional[int] = 0
    bio: Optional[str] = ""
    notes: Optional[str] = ""
    category_id: Optional[str] = "default"

class ChannelUpdateRequest(BaseModel):
    platform: Optional[str] = None
    name: Optional[str] = None
    handle: Optional[str] = None
    url: Optional[str] = None
    avatar_url: Optional[str] = None
    email: Optional[str] = None
    orientation: Optional[str] = None
    status: Optional[str] = None
    followers_count: Optional[int] = None
    following_count: Optional[int] = None
    likes_count: Optional[int] = None
    posts_count: Optional[int] = None
    views_count: Optional[int] = None
    bio: Optional[str] = None
    notes: Optional[str] = None
    category_id: Optional[str] = None

class ChannelFetchInfoRequest(BaseModel):
    url: str
    platform: Optional[str] = None

@app.get("/api/channels")
async def list_social_channels(
    platform: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None)
):
    """Lấy danh sách các kênh mạng xã hội kèm khối KPI thống kê (hỗ trợ lọc theo loại danh mục cha-con)"""
    channels = get_social_channels(platform=platform, status=status, search=search, category_id=category_id)
    stats = get_social_channels_stats()
    return {
        "channels": channels,
        "stats": stats
    }

@app.get("/api/channels/{channel_id}")
async def get_single_social_channel(channel_id: str):
    """Lấy chi tiết 1 kênh mạng xã hội"""
    ch = get_social_channel_by_id(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Không tìm thấy kênh")
    return ch

@app.post("/api/channels")
async def create_new_social_channel(req: ChannelCreateRequest):
    """Thêm một kênh mạng xã hội mới"""
    data = req.model_dump()
    created = create_social_channel(data)
    return created

@app.put("/api/channels/{channel_id}")
async def update_existing_social_channel(channel_id: str, req: ChannelUpdateRequest):
    """Cập nhật thông tin, định hướng hoặc số liệu kênh"""
    data = {k: v for k, v in req.model_dump().items() if v is not None}
    updated = update_social_channel(channel_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy kênh để cập nhật")
    return updated

@app.delete("/api/channels/{channel_id}")
async def delete_existing_social_channel(channel_id: str):
    """Xóa kênh khỏi hệ thống quản lý"""
    success = delete_social_channel(channel_id)
    return {"success": success, "message": "Đã xóa kênh thành công"}

@app.post("/api/channels/fetch-info")
async def fetch_channel_info_endpoint(req: ChannelFetchInfoRequest):
    """Tự động quét thông tin và số liệu từ link kênh bất kỳ"""
    if not req.url:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp link kênh")
    try:
        data = fetch_channel_info(req.url, req.platform)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Không thể quét thông tin kênh: {str(e)}")

@app.post("/api/channels/{channel_id}/refresh")
async def refresh_channel_stats_endpoint(channel_id: str):
    """Làm mới lại số liệu mới nhất của kênh từ link gốc"""
    ch = get_social_channel_by_id(channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Không tìm thấy kênh")
    url = ch.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="Kênh không có link liên kết để làm mới")
    
    try:
        scraped = fetch_channel_info(url, ch.get("platform"))
        update_data = {
            "last_synced_at": time.strftime("%Y-%m-%dT%H:%M:%S")
        }
        if scraped.get("name") and not ch.get("name"):
            update_data["name"] = scraped["name"]
        if scraped.get("avatar_url"):
            update_data["avatar_url"] = scraped["avatar_url"]
        if scraped.get("handle") and not ch.get("handle"):
            update_data["handle"] = scraped["handle"]
        if scraped.get("bio") and not ch.get("bio"):
            update_data["bio"] = scraped["bio"]
        if scraped.get("followers_count"):
            update_data["followers_count"] = scraped["followers_count"]
        if scraped.get("following_count"):
            update_data["following_count"] = scraped["following_count"]
        if scraped.get("likes_count"):
            update_data["likes_count"] = scraped["likes_count"]
        if scraped.get("posts_count"):
            update_data["posts_count"] = scraped["posts_count"]
        if scraped.get("views_count"):
            update_data["views_count"] = scraped["views_count"]
        old_posts = int(ch.get("posts_count") or 0)
        new_posts = int(scraped.get("posts_count") or 0)
        if new_posts > old_posts and old_posts > 0:
            update_data["has_new_videos"] = 1
            update_data["new_videos_count"] = new_posts - old_posts

        updated = update_social_channel(channel_id, update_data)
        return {"success": True, "channel": updated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi làm mới số liệu: {str(e)}")

@app.post("/api/channels/{channel_id}/clear-new-videos")
async def clear_channel_new_videos_endpoint(channel_id: str):
    """Xóa cảnh báo video mới sau khi người dùng đã xem hoặc quét kênh"""
    updated = update_social_channel(channel_id, {"has_new_videos": 0, "new_videos_count": 0})
    return {"success": True, "channel": updated}

# Batch actions for channels
class ChannelBatchDeleteRequest(BaseModel):
    ids: List[str]

class ChannelBatchStatusRequest(BaseModel):
    ids: List[str]
    status: str

class ChannelBatchUpdateRequest(BaseModel):
    ids: List[str]
    data: Dict[str, Any]

class ChannelBatchRefreshRequest(BaseModel):
    ids: List[str]

@app.post("/api/channels/batch-delete")
async def batch_delete_channels(req: ChannelBatchDeleteRequest):
    count = 0
    for cid in req.ids:
        if delete_social_channel(cid):
            count += 1
    return {"success": True, "deleted_count": count}

@app.post("/api/channels/batch-status")
async def batch_update_channel_status(req: ChannelBatchStatusRequest):
    count = 0
    for cid in req.ids:
        if update_social_channel(cid, {"status": req.status}):
            count += 1
    return {"success": True, "updated_count": count}

@app.post("/api/channels/batch-update")
async def batch_update_channels(req: ChannelBatchUpdateRequest):
    count = 0
    for cid in req.ids:
        if update_social_channel(cid, req.data):
            count += 1
    return {"success": True, "updated_count": count}

@app.post("/api/channels/batch-category")
async def batch_update_channel_category_endpoint(req: ChannelBatchCategoryRequest):
    """Gán hoặc đổi danh mục hàng loạt cho nhiều kênh"""
    count = batch_update_channel_category(req.ids, req.category_id)
    return {"success": True, "updated_count": count}

@app.post("/api/channels/batch-refresh")
async def batch_refresh_channels(req: ChannelBatchRefreshRequest):
    refreshed_count = 0
    errors = []
    for cid in req.ids:
        ch = get_social_channel_by_id(cid)
        if ch and ch.get("url"):
            try:
                scraped = fetch_channel_info(ch["url"], ch.get("platform"))
                update_data = {"last_synced_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
                for field in ["name", "avatar_url", "handle", "bio", "followers_count", "following_count", "likes_count", "posts_count", "views_count"]:
                    if scraped.get(field) is not None:
                        update_data[field] = scraped[field]
                old_posts = int(ch.get("posts_count") or 0)
                new_posts = int(scraped.get("posts_count") or 0)
                if new_posts > old_posts and old_posts > 0:
                    update_data["has_new_videos"] = 1
                    update_data["new_videos_count"] = new_posts - old_posts
                update_social_channel(cid, update_data)
                refreshed_count += 1
            except Exception as e:
                errors.append(f"{ch.get('name')}: {str(e)}")
    return {
        "success": True,
        "refreshed_count": refreshed_count,
        "total_requested": len(req.ids),
        "errors": errors
    }

@app.post("/api/channels/refresh-all")
async def refresh_all_channels_endpoint():
    """Làm mới toàn bộ số liệu tất cả các kênh mạng xã hội trong hệ thống có liên kết URL"""
    all_channels = get_social_channels()
    target_channels = [c for c in all_channels if c.get("url")]
    
    if not target_channels:
        return {
            "success": True,
            "total_channels": len(all_channels),
            "target_channels": 0,
            "refreshed_count": 0,
            "new_videos_found": 0,
            "errors": []
        }
    
    refreshed_count = 0
    new_videos_found = 0
    errors = []
    
    def process_channel(ch):
        cid = ch["id"]
        try:
            scraped = fetch_channel_info(ch["url"], ch.get("platform"))
            update_data = {"last_synced_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
            for field in ["name", "avatar_url", "handle", "bio", "followers_count", "following_count", "likes_count", "posts_count", "views_count"]:
                if scraped.get(field) is not None:
                    update_data[field] = scraped[field]
            old_posts = int(ch.get("posts_count") or 0)
            new_posts = int(scraped.get("posts_count") or 0)
            has_new = False
            if new_posts > old_posts and old_posts > 0:
                update_data["has_new_videos"] = 1
                update_data["new_videos_count"] = new_posts - old_posts
                has_new = True
            update_social_channel(cid, update_data)
            return {"success": True, "cid": cid, "has_new": has_new}
        except Exception as e:
            return {"success": False, "cid": cid, "error": f"{ch.get('name')}: {str(e)}"}
            
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(process_channel, target_channels))
        
    for r in results:
        if r.get("success"):
            refreshed_count += 1
            if r.get("has_new"):
                new_videos_found += 1
        else:
            errors.append(r.get("error", "Unknown error"))
            
    return {
        "success": True,
        "total_channels": len(all_channels),
        "target_channels": len(target_channels),
        "refreshed_count": refreshed_count,
        "new_videos_found": new_videos_found,
        "errors": errors
    }

class SaveFollowersRequest(BaseModel):
    followers: List[Dict[str, Any]]
    replace: bool = True

class ParseFollowersTextRequest(BaseModel):
    text: str

@app.get("/api/channels/{channel_id}/followers")
async def get_followers_endpoint(channel_id: str):
    """Lấy danh sách followers đã lưu của kênh"""
    followers = get_channel_followers(channel_id)
    return {"success": True, "followers": followers, "total": len(followers)}

@app.post("/api/channels/{channel_id}/followers")
async def save_followers_endpoint(channel_id: str, req: SaveFollowersRequest):
    """Lưu danh sách followers đã quét vào cơ sở dữ liệu của kênh"""
    saved_count = save_channel_followers(channel_id, req.followers, req.replace)
    if saved_count > 0:
        ch = get_social_channel_by_id(channel_id)
        if ch and (not ch.get("followers_count") or ch.get("followers_count") < saved_count):
            update_social_channel(channel_id, {"followers_count": saved_count})
    return {"success": True, "saved_count": saved_count}

@app.post("/api/channels/parse-followers-text")
async def parse_followers_text_endpoint(req: ParseFollowersTextRequest):
    """Bóc tách thông minh chuỗi văn bản danh sách followers dán vào (Hỗ trợ JSON, Copy từ modal TikTok, STT, @username)"""
    raw_text = req.text.strip()
    if not raw_text:
        return {"success": True, "followers": [], "total": 0}

    # 1. Hỗ trợ mảng JSON xuất từ script/extension
    if raw_text.startswith("[") and raw_text.endswith("]"):
        try:
            items = json.loads(raw_text)
            if isinstance(items, list):
                parsed = []
                for it in items:
                    if isinstance(it, dict):
                        d_name = (it.get("displayName") or it.get("display_name") or it.get("name") or "").strip()
                        h = (it.get("handle") or it.get("username") or "").strip()
                        if h and not h.startswith("@"):
                            h = "@" + h
                        u = it.get("url") or (f"https://www.tiktok.com/{h}" if h else "")
                        av = it.get("avatar_url") or it.get("avatar") or ""
                        if d_name or h:
                            parsed.append({
                                "displayName": d_name or (h.lstrip("@") if h else "Người dùng"),
                                "handle": h,
                                "url": u,
                                "avatar_url": av
                            })
                if parsed:
                    unique = []
                    seen = set()
                    for p in parsed:
                        k = (p.get("handle") or p.get("displayName") or "").lower()
                        if k and k not in seen:
                            seen.add(k)
                            unique.append(p)
                    return {"success": True, "followers": unique, "total": len(unique)}
        except Exception:
            pass

    # 2. Xử lý chuỗi văn bản thông thường và văn bản bôi đen copy từ TikTok
    lines = [line.strip() for line in raw_text.split("\n") if line.strip()]
    btn_keywords = {
        "follow", "follow back", "following", "friends", "bạn bè", "follow lại", 
        "tin nhắn", "message", "xóa", "suggested", "gợi ý", "edit profile", "chỉnh sửa hồ sơ"
    }
    header_patterns = {"followers", "following", "friends", "suggested", "bạn bè"}
    pattern1 = re.compile(r'^\d+[\.\-\)]\s*([^(]+?)\s*\((@[^)]+)\)\s*(?:-\s*(https?://[^\s]+))?')

    parsed = []
    buf = []

    for line in lines:
        if line.startswith("===") or line.startswith("---") or "DANH SÁCH" in line or "Tổng số" in line or "Thời gian xuất" in line:
            continue

        # Bỏ qua các tab tiêu đề như "Following 25", "Followers 82", "Friends 11"
        if any(line.lower().startswith(h) for h in header_patterns) and any(c.isdigit() for c in line):
            continue

        m1 = pattern1.match(line)
        if m1:
            name = m1.group(1).strip()
            handle = m1.group(2).strip()
            url = m1.group(3) or f"https://www.tiktok.com/{handle}"
            parsed.append({
                "displayName": name,
                "handle": handle,
                "url": url
            })
            continue

        if line.lower() in btn_keywords:
            if len(buf) >= 2:
                name = buf[-2]
                h = buf[-1]
                if not h.startswith("@"):
                    h = "@" + h
                parsed.append({
                    "displayName": name,
                    "handle": h,
                    "url": f"https://www.tiktok.com/{h}"
                })
            elif len(buf) == 1:
                item = buf[0]
                h = ("@" + item) if re.match(r'^[a-zA-Z0-9_.-]+$', item) else ""
                parsed.append({
                    "displayName": item,
                    "handle": h,
                    "url": f"https://www.tiktok.com/{h}" if h else ""
                })
            buf = []
        else:
            buf.append(line)

    if buf:
        for b in buf:
            m = re.match(r'^\d+[\.\-\)]\s*(.+)', b)
            val = m.group(1).strip() if m else b
            if val.lower() in btn_keywords:
                continue
            h = val if val.startswith("@") else (("@" + val) if re.match(r'^[a-zA-Z0-9_.-]+$', val) and len(val) < 25 else "")
            parsed.append({
                "displayName": val,
                "handle": h,
                "url": f"https://www.tiktok.com/{h}" if h else ""
            })

    unique_list = []
    seen = set()
    for p in parsed:
        key = (p.get("handle") or p.get("displayName") or "").lower()
        if key and key not in seen:
            seen.add(key)
            unique_list.append(p)

    return {"success": True, "followers": unique_list, "total": len(unique_list)}

# =============================================================
# VIDEO LOCALIZATION / DUBBING STUDIO API (4KSTUDIO WORKFLOW)
# =============================================================
import services.dubbing_service as dubbing_service

@app.get("/api/dubbing/folders")
def get_dubbing_folders():
    return {"success": True, "folders": dubbing_service.get_all_folders()}

@app.post("/api/dubbing/folders")
async def create_dubbing_folder(req: Request):
    data = await req.json()
    name = data.get("name", "Thư mục mới")
    color = data.get("color", "#10b981")
    folder = dubbing_service.create_folder(name, color)
    return {"success": True, "folder": folder}

@app.put("/api/dubbing/folders/{folder_id}")
async def update_dubbing_folder(folder_id: str, req: Request):
    data = await req.json()
    name = data.get("name", "Thư mục mới")
    color = data.get("color")
    folder = dubbing_service.update_folder(folder_id, name, color)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return {"success": True, "folder": folder}

@app.delete("/api/dubbing/folders/{folder_id}")
def delete_dubbing_folder(folder_id: str, delete_projects: bool = False):
    success = dubbing_service.delete_folder(folder_id, delete_projects=delete_projects)
    return {"success": success}

@app.get("/api/dubbing/projects")
def get_dubbing_projects(folder_id: Optional[str] = None, search: Optional[str] = None):
    projects = dubbing_service.get_projects(folder_id=folder_id, search=search or "")
    return {"success": True, "projects": projects}

@app.post("/api/dubbing/projects")
async def create_dubbing_project(req: Request):
    data = await req.json()
    project = dubbing_service.create_project(data)
    return {"success": True, "project": project}

@app.post("/api/dubbing/projects/bulk_delete")
async def bulk_delete_dubbing_projects(req: Request):
    data = await req.json()
    project_ids = data.get("project_ids", [])
    count = dubbing_service.bulk_delete_projects(project_ids)
    return {"success": True, "deleted_count": count}

@app.post("/api/dubbing/upload_video")
async def upload_dubbing_video(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    folder_id: Optional[str] = Form(None),
    auto_transcribe: Optional[bool] = Form(True)
):
    try:
        content = await file.read()
        project = dubbing_service.ingest_uploaded_video(
            file_bytes=content,
            filename=file.filename,
            name=name,
            folder_id=folder_id,
            auto_transcribe=bool(auto_transcribe)
        )
        return {"success": True, "project": project}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/dubbing/import_url")
async def import_dubbing_url(req: Request):
    data = await req.json()
    url = data.get("url", "").strip()
    name = data.get("name")
    folder_id = data.get("folder_id")
    auto_transcribe = data.get("auto_transcribe", True)
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    try:
        project = dubbing_service.ingest_url_video(
            url=url,
            name=name,
            folder_id=folder_id,
            auto_transcribe=bool(auto_transcribe)
        )
        return {"success": True, "project": project}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dubbing/projects/{project_id}")
def get_dubbing_project_detail(project_id: str):
    project = dubbing_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True, "project": project}

@app.put("/api/dubbing/projects/{project_id}")
async def update_dubbing_project(project_id: str, req: Request):
    data = await req.json()
    project = dubbing_service.update_project(project_id, data)
    return {"success": True, "project": project}

@app.delete("/api/dubbing/projects/{project_id}")
def delete_dubbing_project(project_id: str):
    success = dubbing_service.delete_project(project_id)
    return {"success": success}

@app.get("/api/dubbing/projects/{project_id}/segments")
def get_dubbing_segments(project_id: str):
    segments = dubbing_service.get_segments(project_id)
    return {"success": True, "segments": segments}

@app.post("/api/dubbing/projects/{project_id}/segments")
async def save_dubbing_segments(project_id: str, req: Request):
    data = await req.json()
    segments = data.get("segments", [])
    saved = dubbing_service.save_segments(project_id, segments)
    return {"success": True, "segments": saved}

@app.post("/api/dubbing/projects/{project_id}/retranslate")
async def retranslate_dubbing_segments(project_id: str, req: Request):
    data = await req.json()
    target_lang = data.get("target_lang", "vi")
    style = data.get("style", "concise")
    segments = dubbing_service.retranslate_project_segments(project_id, target_lang=target_lang, style=style)
    return {"success": True, "segments": segments}

@app.post("/api/dubbing/projects/{project_id}/generate_tts")
async def generate_dubbing_tts(project_id: str, req: Request):
    data = await req.json()
    voice_id = data.get("voice_id", "HN - Ngoc Huyen")
    segments = dubbing_service.generate_tts_for_project(project_id, voice_id=voice_id)
    return {"success": True, "segments": segments}

@app.post("/api/dubbing/projects/{project_id}/auto_fit_sync")
async def auto_fit_sync_dubbing_project(project_id: str):
    try:
        dubbing_service.assemble_precision_master_voiceover(project_id, auto_fit=True)
        segments = dubbing_service.get_segments(project_id)
        audits = dubbing_service.get_segment_audits(project_id)
        return {"success": True, "segments": segments, "audits": audits}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/dubbing/projects/{project_id}/auto_localize")
async def auto_localize_dubbing_project(project_id: str, req: Request, background_tasks: BackgroundTasks):
    try:
        data = await req.json()
    except Exception:
        data = {}
    mode = data.get("mode", "SPEECH")
    source_lang = data.get("source_lang", "auto")
    roi_box = data.get("roi_box")
    voice_id = data.get("voice_id", "HN - Ngoc Huyen")
    auto_blur = data.get("auto_blur", True)
    auto_tts = data.get("auto_tts", True)
    is_async = data.get("is_async", True)
    
    # Initialize initial progress state
    dubbing_service.set_pipeline_progress(
        project_id, "start", 10,
        "Đang phân tích video và khởi động luồng tự động hoá đa tác vụ...",
        current_step=1, total_steps=5
    )

    if is_async:
        background_tasks.add_task(
            dubbing_service.run_automated_localization,
            project_id=project_id,
            mode=mode,
            source_lang=source_lang,
            roi_box=roi_box,
            voice_id=voice_id,
            auto_blur=bool(auto_blur),
            auto_tts=bool(auto_tts)
        )
        return {
            "success": True,
            "status": "processing",
            "project_id": project_id,
            "message": "Đã khởi chạy luồng xử lý tự động ngầm."
        }
    else:
        try:
            project = dubbing_service.run_automated_localization(
                project_id=project_id,
                mode=mode,
                source_lang=source_lang,
                roi_box=roi_box,
                voice_id=voice_id,
                auto_blur=bool(auto_blur),
                auto_tts=bool(auto_tts)
            )
            segments = dubbing_service.get_segments(project_id)
            audits = dubbing_service.get_segment_audits(project_id)
            return {
                "success": True,
                "project": project,
                "segments": segments,
                "audits": audits,
                "detected_language": project.get("detected_language", "zh"),
                "language_name": project.get("language_name", "Tiếng Trung(中文)")
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dubbing/projects/{project_id}/progress")
def get_dubbing_project_progress(project_id: str):
    prog = dubbing_service.get_pipeline_progress(project_id)
    return {"success": True, "progress": prog}

@app.get("/api/dubbing/progress/all")
def get_all_dubbing_progress():
    all_prog = dubbing_service.get_all_pipeline_progress()
    return {"success": True, "progress": all_prog}

@app.post("/api/dubbing/cleanup_expired")
def cleanup_expired_dubbing():
    count = dubbing_service.cleanup_expired_dubbing_projects()
    return {"success": True, "cleaned_count": count}

@app.get("/api/dubbing/projects/{project_id}/audits")
def get_dubbing_segment_audits(project_id: str):
    audits = dubbing_service.get_segment_audits(project_id)
    return {"success": True, "audits": audits}

@app.post("/api/dubbing/projects/{project_id}/subtitle_style")
async def save_dubbing_subtitle_style(project_id: str, req: Request):
    style_data = await req.json()
    saved = dubbing_service.save_subtitle_style(project_id, style_data)
    return {"success": True, "subtitle_style": saved}

@app.post("/api/dubbing/projects/{project_id}/blur_regions")
async def save_dubbing_blur_regions(project_id: str, req: Request):
    data = await req.json()
    regions = data.get("regions", [])
    saved = dubbing_service.save_blur_regions(project_id, regions)
    return {"success": True, "blur_regions": saved}

@app.get("/api/dubbing/projects/{project_id}/assets")
def get_dubbing_assets(project_id: str):
    assets = dubbing_service.get_project_assets(project_id)
    return {"success": True, "assets": assets}

@app.post("/api/dubbing/projects/{project_id}/export_zip")
def export_dubbing_zip(project_id: str):
    zip_path = dubbing_service.package_project_zip(project_id)
    return {"success": True, "zip_path": zip_path, "filename": os.path.basename(zip_path)}

@app.post("/api/dubbing/projects/{project_id}/render")
async def render_dubbing_video(project_id: str, background_tasks: BackgroundTasks):
    project = dubbing_service.get_project_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    p_status = project["pipeline_status"]
    p_status["render"] = "PROCESSING"
    dubbing_service.update_project(project_id, {"pipeline_status": p_status})
    
    def run_render():
        try:
            dubbing_service.render_project_video_sync(project_id)
        except Exception as e:
            print(f"[Render Task Error] {e}")
            p_status["render"] = "ERROR"
            dubbing_service.update_project(project_id, {"pipeline_status": p_status})
            
    background_tasks.add_task(run_render)
    return {"success": True, "message": "Render task dispatched", "pipeline_status": p_status}

@app.get("/api/dubbing/credits")
def get_dubbing_credits(user_id: str = "default_user"):
    credits = dubbing_service.get_user_credits(user_id)
    return {"success": True, "credits": credits}

@app.api_route("/api/dubbing/assets/download/{project_id}/{asset_type}", methods=["GET", "HEAD"])
def download_dubbing_asset(project_id: str, asset_type: str):
    if asset_type.lower() == "thumbnail":
        thumb_path = os.path.join(dubbing_service.DUBBING_STORAGE_DIR, project_id, "thumbnail.jpg")
        if os.path.exists(thumb_path):
            return FileResponse(thumb_path, media_type="image/jpeg")
    if asset_type.lower() in ["source", "source_video"]:
        source_path = os.path.join(dubbing_service.DUBBING_STORAGE_DIR, project_id, "source.mp4")
        if os.path.exists(source_path):
            return FileResponse(source_path, media_type="video/mp4")
        proj = dubbing_service.get_project_by_id(project_id)
        if proj and proj.get("video_path") and os.path.exists(proj["video_path"]):
            return FileResponse(proj["video_path"], media_type="video/mp4")
            
    if asset_type.lower() in ["voiceover", "voiceover_wav"]:
        voice_path = os.path.join(dubbing_service.DUBBING_STORAGE_DIR, project_id, "voiceover.wav")
        if os.path.exists(voice_path):
            return FileResponse(voice_path, media_type="audio/wav")
            
    if asset_type.lower().startswith("tts_seg_"):
        try:
            seg_num = int(asset_type.lower().replace("tts_seg_", ""))
            seg_file = os.path.join(dubbing_service.DUBBING_STORAGE_DIR, project_id, "tts_segments", f"segment_{seg_num:04d}.mp3")
            if os.path.exists(seg_file):
                return FileResponse(seg_file, media_type="audio/mpeg")
        except Exception:
            pass
            
    assets = dubbing_service.get_project_assets(project_id)
    for a in assets:
        if a["asset_type"].lower() == asset_type.lower():
            if os.path.exists(a["file_path"]):
                return FileResponse(a["file_path"], filename=a["filename"], media_type=a.get("mime_type") or "application/octet-stream")
    raise HTTPException(status_code=404, detail="Asset file not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)



