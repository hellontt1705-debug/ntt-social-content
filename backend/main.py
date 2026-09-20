import os
import sys
import zipfile

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
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from services.db import (
    init_db, get_all_categories, add_category, update_category, delete_category,
    toggle_category_favorite,
    save_video, get_videos, get_video_by_id, update_video, delete_video,
    soft_delete_video, restore_video, permanent_delete_video, get_trash_count,
    get_calendar_events, save_calendar_event, delete_calendar_event,
    get_notes, save_note, delete_note, get_connection,
    is_vault_password_set, set_vault_password, verify_vault_password,
    get_vault_hint, get_private_videos_count, set_video_privacy, batch_set_video_privacy,
    set_category_lock, verify_category_lock, remove_category_lock, change_category_password,
    get_prompts, get_prompt_by_id, create_prompt, update_prompt, delete_prompt,
    toggle_favorite_prompt, get_prompt_stats,
    toggle_video_used, batch_set_videos_used
)
from services.downloader import scrape_video_metadata, download_video, DOWNLOADS_DIR, THUMBNAILS_DIR, extract_media_from_social_url

PROMPTS_DIR = os.path.join(DOWNLOADS_DIR, "prompts")
os.makedirs(PROMPTS_DIR, exist_ok=True)
from services.drive_service import (
    get_drive_status, configure_drive, sync_video_to_drive, sync_prompt_to_drive, test_drive_connection,
    delete_file_from_drive, backup_database_to_drive
)
from services.tiktok_channel import (
    scan_tiktok_channel, ingest_scanned_channel_items, get_channel_bookmarklet_code
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

@app.websocket("/ws/progress")
async def websocket_progress_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send current active tasks immediately upon connection
        await websocket.send_json({"type": "init", "tasks": list(active_tasks.values())})
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

class TikTokChannelIngestRequest(BaseModel):
    items: List[Any]
    channel_url: Optional[str] = ""
    mode: Optional[str] = "30_days"
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

class CategoryUpdateRequest(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_favorite: Optional[int] = None

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
    media_type: Optional[str] = None

class VideoUsedToggleRequest(BaseModel):
    is_used: Optional[bool] = None

class BatchUsedRequest(BaseModel):
    video_ids: List[str]
    is_used: bool

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
    status: Optional[str] = "scheduled"
    notes: Optional[str] = ""

class NoteRequest(BaseModel):
    id: str
    title: str
    content_html: str
    content_text: Optional[str] = ""
    category: Optional[str] = "general"
    linked_video_id: Optional[str] = None
    tags: Optional[List[str]] = []

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
    # Compute active video counts (excluding trashed, and for 'all', only counting uncategorized/new videos)
    for cat in categories:
        if cat["id"] == "all":
            row = conn.execute("""
                SELECT COUNT(*) FROM videos 
                WHERE (status IS NULL OR status != 'trashed')
                  AND (category_id IS NULL OR category_id = 'all' OR category_id = 'default' OR category_id = '' OR category_id NOT IN (SELECT id FROM categories WHERE id != 'all'))
            """).fetchone()
        else:
            row = conn.execute("SELECT COUNT(*) FROM videos WHERE category_id = ? AND (status IS NULL OR status != 'trashed')", (cat["id"],)).fetchone()
        cat["count"] = row[0] if row else 0
    conn.close()
    return categories

@app.post("/api/categories")
async def create_category(req: CategoryCreateRequest):
    return add_category(req.id, req.name, req.icon, req.color)

@app.put("/api/categories/{cat_id}")
async def edit_category(cat_id: str, req: CategoryUpdateRequest):
    if cat_id in ["all", "default"]:
        raise HTTPException(status_code=400, detail="Không thể đổi tên danh mục mặc định.")
    updated = update_category(cat_id, name=req.name, icon=req.icon, color=req.color, is_favorite=req.is_favorite)
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
        res = ingest_scanned_channel_items(
            items=req.items,
            channel_url_or_handle=req.channel_url or "",
            mode=req.mode or "30_days",
            days_limit=req.days_limit or 30,
            start_date=req.start_date,
            end_date=req.end_date
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tiktok/channel/bookmarklet")
async def get_tiktok_bookmarklet_endpoint():
    """Lấy đoạn mã Bookmarklet JavaScript 1-click để quét kênh trực tiếp trên Cốc Cốc / Chrome"""
    host = "localhost:8000"
    code = get_channel_bookmarklet_code(api_host=host)
    return {"success": True, "bookmarklet": code}

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

def _remove_local_media_files(video_data: dict) -> int:
    """Xóa triệt để 100% mọi file video (.mp4, .mkv), thumbnail, file tạm .image của video đã lưu trên Drive"""
    freed_sz = 0
    vid_id = video_data.get("id", "")
    
    # 1. Xóa file cụ thể theo path nếu có
    file_p = video_data.get("file_path")
    thumb_p = video_data.get("local_thumbnail")
    for p in [file_p, thumb_p]:
        if p and os.path.exists(p):
            try:
                freed_sz += os.path.getsize(p)
                os.remove(p)
            except Exception:
                pass
                
    # 2. Quét sạch tất cả file liên quan đến video_id trong downloads/ và thumbnails/
    # (Bao gồm file .image, .jpg, .webp, .temp, .mp4, .part...)
    if vid_id:
        target_prefixes = [f"video_{vid_id}", vid_id]
        for folder in [DOWNLOADS_DIR, THUMBNAILS_DIR]:
            if not os.path.exists(folder):
                continue
            for item in os.listdir(folder):
                item_path = os.path.join(folder, item)
                if os.path.isfile(item_path):
                    if any(prefix in item for prefix in target_prefixes):
                        try:
                            freed_sz += os.path.getsize(item_path)
                            os.remove(item_path)
                        except Exception:
                            pass

    return freed_sz

async def async_sync_drive_and_backup(video_id: str, should_sync: bool):
    """Đồng bộ video và sao lưu database lên Drive bất đồng bộ (chạy nền, không chặn giao diện)"""
    if not should_sync:
        return
    try:
        from services.drive_service import sync_video_to_drive, backup_database_to_drive
        loop = asyncio.get_event_loop()
        vid = get_video_by_id(video_id)
        if not vid:
            return
        
        # Chạy trong threadpool riêng để không làm đơ event loop hoặc tiến trình tải khác
        drive_res = await loop.run_in_executor(None, sync_video_to_drive, vid)
        if drive_res and drive_res.get("success"):
            # CLOUD-FIRST: Xóa sạch triệt để toàn bộ file .mp4, thumbnail, file tạm trong downloads/ và thumbnails/!
            _remove_local_media_files(vid)

            # Cập nhật DB: drive_synced=1, xóa file_path & local_thumbnail
            updated = update_video(video_id, {
                "drive_file_id": drive_res.get("drive_file_id", ""),
                "drive_web_link": drive_res.get("drive_web_link", ""),
                "drive_synced": 1,
                "file_path": "",
                "local_thumbnail": ""
            })

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
    active_tasks[task_id] = {
        "task_id": task_id,
        "url": url,
        "percent": 10,
        "status": "Đang kết nối luồng tải siêu tốc...",
        "speed": "",
        "eta": "",
        "title": "Đang kết nối..."
    }
    await manager.broadcast({"type": "task_update", "task": active_tasks[task_id]})

    loop = asyncio.get_running_loop()
    last_broadcast_time = [0.0]

    def on_progress(p):
        if task_id in active_tasks:
            percent = p.get("percent", 10)
            status_text = p.get("status") or (f"Đang tải {percent}%" if percent < 100 else "Đang xử lý video...")
            if p.get("title") and active_tasks[task_id].get("title") == "Đang kết nối...":
                active_tasks[task_id]["title"] = p.get("title")
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
        active_tasks[task_id]["status"] = "Hoàn thành!"
        active_tasks[task_id]["percent"] = 100
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
        print(f"Download error on task {task_id}: {err_msg}")
        if task_id in active_tasks:
            active_tasks[task_id]["status"] = f"Lỗi: {err_msg}"
            active_tasks[task_id]["isError"] = True
            await manager.broadcast({"type": "task_error", "task": active_tasks[task_id], "error": err_msg})
    finally:
        # Giữ lại các task đã hoàn thành hoặc lỗi trong active_tasks để người dùng theo dõi được
        # số lượng: Tổng số, Đang tải, Đã xong, Đang chờ.
        # Task chỉ bị xóa khi người dùng bấm "Xóa đã xong" hoặc gọi /api/download/clear-completed.
        pass

@app.post("/api/download")
async def start_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp URL video.")
    
    import uuid
    task_id = str(uuid.uuid4())[:8]
    active_tasks[task_id] = {
        "task_id": task_id,
        "url": req.url.strip(),
        "percent": 10,
        "status": "Đang kết nối luồng tải siêu tốc...",
        "speed": "",
        "eta": "",
        "title": "Đang kết nối...",
        "isCompleted": False,
        "isError": False
    }
    await manager.broadcast({"type": "task_update", "task": active_tasks[task_id]})

    background_tasks.add_task(
        process_single_download,
        url=req.url.strip(),
        category_id=req.category_id or "all",
        sync_to_drive=bool(req.sync_to_drive),
        task_id=task_id,
        is_private=bool(req.is_private)
    )
    return {"success": True, "task_id": task_id, "message": "Đã thêm vào hàng đợi tải xuống"}

@app.post("/api/batch-download")
async def start_batch_download(req: BatchDownloadRequest, background_tasks: BackgroundTasks):
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
        background_tasks.add_task(
            process_single_download,
            url=u,
            category_id=req.category_id or "all",
            sync_to_drive=bool(req.sync_to_drive),
            task_id=task_id,
            is_private=bool(req.is_private)
        )

    # Phát sóng ngay toàn bộ danh sách để frontend nhận đủ số lượng (ví dụ: 10/10 video)
    await manager.broadcast({"type": "init", "tasks": list(active_tasks.values())})

    return {
        "success": True,
        "task_ids": created_tasks,
        "count": len(created_tasks),
        "message": f"Đã bắt đầu tải hàng loạt {len(created_tasks)} video!"
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
async def list_videos(category_id: Optional[str] = None, search: Optional[str] = None, status: Optional[str] = "active", is_private: Optional[bool] = False, used_status: Optional[str] = None, media_type: Optional[str] = None):
    """Lấy danh sách video/ảnh: status='active' (kho chính), status='trashed' (thùng rác), is_private=True (kho bảo mật), used_status='all'|'used'|'unused', media_type='all'|'video'|'image'"""
    return get_videos(category_id=category_id, search=search, status=status, is_private=is_private, used_status=used_status, media_type=media_type)

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

@app.post("/api/export-to-folder")
async def export_to_folder_endpoint(req: ExportToFolderRequest):
    """Lưu các video đã chọn vào thư mục được chỉ định trên máy tính (hỗ trợ cả file local và file từ Drive)"""
    import shutil
    if not req.video_ids:
        raise HTTPException(status_code=400, detail="Chưa chọn video nào.")
    if not req.target_folder:
        raise HTTPException(status_code=400, detail="Chưa chỉ định thư mục đích.")
        
    target_dir = os.path.abspath(req.target_folder)
    os.makedirs(target_dir, exist_ok=True)
    
    saved_files = []
    errors = []
    
    for vid in req.video_ids:
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
        
        # 1. Nếu file local vẫn còn tồn tại thì copy sang
        local_file = v.get("file_path")
        if local_file and os.path.exists(local_file):
            try:
                shutil.copy2(local_file, dest_video_path)
                saved_files.append(video_filename)
            except Exception as copy_err:
                errors.append(f"Lỗi sao chép {video_filename}: {copy_err}")
                continue
        else:
            # 2. File local đã được dọn (Cloud-First), tải từ Google Drive về thư mục đích
            try:
                from services.drive_service import download_video_from_drive
                downloaded_path = download_video_from_drive(v, dest_video_path)
                if downloaded_path and os.path.exists(downloaded_path):
                    saved_files.append(video_filename)
                else:
                    errors.append(f"Không thể tải video '{v.get('title')}' từ Google Drive.")
            except Exception as drive_dl_err:
                errors.append(f"Lỗi tải từ Drive {v.get('title')}: {drive_dl_err}")
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

    return {
        "success": len(saved_files) > 0,
        "saved_count": len(saved_files),
        "target_folder": target_dir,
        "errors": errors,
        "message": f"Đã lưu thành công {len(saved_files)} video vào: {target_dir}"
    }

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
    """Dọn dẹp triệt để 100% mọi file video, thumbnail, prompt và audio trên máy tính để giải phóng hoàn toàn ổ cứng"""
    freed_count = 0
    freed_bytes = 0

    # 1. Dọn dẹp Video đã đồng bộ lên Drive
    videos = get_videos(status="all")
    for v in videos:
        if v.get("drive_synced") == 1 and v.get("drive_file_id"):
            sz = _remove_local_media_files(v)
            if sz > 0 or v.get("file_path") or v.get("local_thumbnail"):
                freed_bytes += sz
                freed_count += 1
                update_video(v["id"], {"file_path": "", "local_thumbnail": ""})

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

    # 5. Dọn dẹp cả các file rác mồ côi trong downloads và thumbnails
    try:
        active_db_videos = get_videos(status="all")
        active_files = set(v.get("file_path") for v in active_db_videos if v.get("file_path"))
        active_thumbs = set(v.get("local_thumbnail") for v in active_db_videos if v.get("local_thumbnail"))
        
        for item in os.listdir(DOWNLOADS_DIR):
            item_p = os.path.join(DOWNLOADS_DIR, item)
            if os.path.isfile(item_p) and item_p not in active_files:
                try:
                    freed_bytes += os.path.getsize(item_p)
                    os.remove(item_p)
                except Exception:
                    pass
                    
        for item in os.listdir(THUMBNAILS_DIR):
            item_p = os.path.join(THUMBNAILS_DIR, item)
            if os.path.isfile(item_p) and item_p not in active_thumbs:
                try:
                    freed_bytes += os.path.getsize(item_p)
                    os.remove(item_p)
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
        "message": f"Đã dọn dẹp sạch toàn bộ video, prompt, audio và thumbnail trên máy, giải phóng {mb_freed} MB dung lượng ổ cứng!"
    }

@app.post("/api/videos/{video_id}/sync-drive")
async def sync_single_video_drive(video_id: str):
    video = get_video_by_id(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Không tìm thấy video.")
    try:
        res = sync_video_to_drive(video)
        if res.get("success"):
            _remove_local_media_files(video)
            updated = update_video(video_id, {
                "drive_file_id": res.get("drive_file_id", ""),
                "drive_web_link": res.get("drive_web_link", ""),
                "drive_synced": 1,
                "file_path": "",
                "local_thumbnail": ""
            })
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
    
    # 1. Đồng bộ Video
    videos = get_videos()
    synced_count = 0
    skipped_count = 0
    failed_count = 0
    errors = []
    
    for v in videos:
        if v.get("drive_synced") == 1 and v.get("drive_file_id"):
            _remove_local_media_files(v)
            update_video(v["id"], {"file_path": "", "local_thumbnail": ""})
            skipped_count += 1
            continue

        try:
            res = sync_video_to_drive(v)
            if res.get("success"):
                _remove_local_media_files(v)
                updated = update_video(v["id"], {
                    "drive_file_id": res.get("drive_file_id", ""),
                    "drive_web_link": res.get("drive_web_link", ""),
                    "drive_synced": 1,
                    "file_path": "",
                    "local_thumbnail": ""
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

@app.get("/api/drive/thumbnail/{file_id}")
async def get_drive_thumbnail_proxy(file_id: str):
    """Lấy hoặc tải về ảnh thumbnail thật của video Google Drive và trả về dưới dạng file ảnh JPEG"""
    import urllib.request
    cache_dir = os.path.join(DOWNLOADS_DIR, "thumbnails")
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, f"drive_thumb_{file_id}.jpg")
    
    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 1000:
        return FileResponse(cache_path, media_type="image/jpeg")

    # Thử lấy từ Google Drive API nếu có credentials
    try:
        from services.drive_service import get_setting, DRIVE_API_CREDS_KEY
        creds_str = get_setting(DRIVE_API_CREDS_KEY, "")
        if creds_str:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build
            creds_data = json.loads(creds_str)
            creds = service_account.Credentials.from_service_account_info(
                creds_data,
                scopes=['https://www.googleapis.com/auth/drive']
            )
            service = build('drive', 'v3', credentials=creds)
            f_meta = service.files().get(fileId=file_id, fields="thumbnailLink").execute()
            thumb_link = f_meta.get("thumbnailLink")
            if thumb_link:
                # Nâng chất lượng ảnh từ s220 lên s800
                high_res_link = re.sub(r'=s\d+$', '=s800', thumb_link)
                req = urllib.request.Request(high_res_link, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    if resp.status == 200:
                        content = resp.read()
                        with open(cache_path, "wb") as f_out:
                            f_out.write(content)
                        return FileResponse(cache_path, media_type="image/jpeg")
    except Exception as e:
        print(f"Lỗi lấy Drive thumbnail cho file {file_id}: {e}")

    # Fallback nếu không tải được: trả về 404 để frontend dùng iframe fallback
    raise HTTPException(status_code=404, detail="Thumbnail not found")


@app.get("/api/drive/media-info/{file_id}")
async def get_drive_media_info(file_id: str):
    """Lấy thông tin kích thước và tỉ lệ (width, height, duration, mimeType) của file từ Drive hoặc cached thumbnail"""
    width = None
    height = None
    duration = None
    
    # 1. Kiểm tra ảnh thumbnail đã cache
    cache_dir = os.path.join(DOWNLOADS_DIR, "thumbnails")
    cache_path = os.path.join(cache_dir, f"drive_thumb_{file_id}.jpg")
    if os.path.exists(cache_path):
        try:
            from PIL import Image
            with Image.open(cache_path) as img:
                width, height = img.size
        except Exception:
            pass

    # 2. Lấy metadata từ Google Drive API nếu có credentials
    try:
        from services.drive_service import get_setting, DRIVE_API_CREDS_KEY
        creds_str = get_setting(DRIVE_API_CREDS_KEY, "")
        if creds_str:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build
            creds_data = json.loads(creds_str)
            creds = service_account.Credentials.from_service_account_info(
                creds_data,
                scopes=['https://www.googleapis.com/auth/drive']
            )
            service = build('drive', 'v3', credentials=creds)
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

