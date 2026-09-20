import sqlite3
import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
import hashlib

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(os.path.dirname(DB_DIR), "social_content.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA cache_size=10000;")
    conn.execute("PRAGMA temp_store=MEMORY;")
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Categories
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT 'folder',
        color TEXT DEFAULT '#8b5cf6',
        order_num INTEGER DEFAULT 0,
        created_at TEXT
    )
    """)
    
    # 2. Videos
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        title TEXT,
        uploader TEXT,
        uploader_id TEXT,
        uploader_url TEXT,
        platform TEXT,
        source_url TEXT,
        description TEXT,
        hashtags TEXT,
        duration INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        category_id TEXT DEFAULT 'default',
        file_path TEXT,
        file_size INTEGER DEFAULT 0,
        thumbnail_url TEXT,
        local_thumbnail TEXT,
        quality TEXT,
        drive_file_id TEXT,
        drive_web_link TEXT,
        drive_synced INTEGER DEFAULT 0,
        notes TEXT,
        status TEXT DEFAULT 'saved',
        created_at TEXT,
        is_private INTEGER DEFAULT 0,
        is_used INTEGER DEFAULT 0,
        used_at TEXT,
        media_type TEXT DEFAULT 'video'
    )
    """)
    
    # 3. Calendar Events
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        video_id TEXT,
        title TEXT,
        scheduled_date TEXT,
        scheduled_time TEXT,
        platforms TEXT,
        status TEXT DEFAULT 'scheduled',
        notes TEXT,
        created_at TEXT
    )
    """)
    
    # 4. Notes & Scripts
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT,
        content_html TEXT,
        content_text TEXT,
        category TEXT DEFAULT 'general',
        linked_video_id TEXT,
        tags TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """)
    
    # 5. Settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)
    
    # Indexes for ultra-fast queries
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_videos_drive_synced ON videos(drive_synced);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_events(scheduled_date);")
    
    # Migration: ensure trashed_at column exists
    try:
        cursor.execute("ALTER TABLE videos ADD COLUMN trashed_at TEXT;")
    except Exception:
        pass
    
    # Migration: ensure is_private column exists
    try:
        cursor.execute("ALTER TABLE videos ADD COLUMN is_private INTEGER DEFAULT 0;")
    except Exception:
        pass

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_videos_private ON videos(is_private);")

    # Migration: ensure is_used and used_at columns exist
    try:
        cursor.execute("ALTER TABLE videos ADD COLUMN is_used INTEGER DEFAULT 0;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE videos ADD COLUMN used_at TEXT;")
    except Exception:
        pass
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_videos_is_used ON videos(is_used);")

    # Migration: ensure media_type column exists
    try:
        cursor.execute("ALTER TABLE videos ADD COLUMN media_type TEXT DEFAULT 'video';")
    except Exception:
        pass
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_videos_media_type ON videos(media_type);")

    # Migration: ensure category lock and favorite columns exist
    for col, col_type in [
        ("is_locked", "INTEGER DEFAULT 0"),
        ("password_hash", "TEXT"),
        ("password_hint", "TEXT"),
        ("is_favorite", "INTEGER DEFAULT 0"),
        ("favorited_at", "TEXT"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE categories ADD COLUMN {col} {col_type};")
        except Exception:
            pass

    try:
        cursor.execute("UPDATE categories SET favorited_at = created_at WHERE is_favorite = 1 AND (favorited_at IS NULL OR favorited_at = '');")
    except Exception:
        pass


    # Table for app settings (vault password, hint, etc.)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
    );
    """)

    # 6. Prompts Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS prompts (
        id TEXT PRIMARY KEY,
        title TEXT,
        prompt TEXT NOT NULL,
        negative_prompt TEXT,
        media_type TEXT DEFAULT 'image',
        media_url TEXT,
        local_path TEXT,
        thumbnail_url TEXT,
        ai_model TEXT DEFAULT 'Midjourney',
        category TEXT DEFAULT 'general',
        tags TEXT,
        parameters TEXT,
        notes TEXT,
        is_favorite INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_prompts_created ON prompts(created_at DESC);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_prompts_model ON prompts(ai_model);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_prompts_type ON prompts(media_type);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_prompts_favorite ON prompts(is_favorite);")
    
    # Migration: ensure prompt drive sync columns exist
    for col, col_type in [
        ("drive_file_id", "TEXT"),
        ("drive_web_link", "TEXT"),
        ("drive_synced", "INTEGER DEFAULT 0"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE prompts ADD COLUMN {col} {col_type};")
        except Exception:
            pass
    
    # Insert default categories if empty
    cursor.execute("SELECT COUNT(*) FROM categories")
    if cursor.fetchone()[0] == 0:
        default_categories = [
            ("all", "Tất cả Video", "layout-grid", "#6366f1", 0),
        ]
        now = datetime.now().isoformat()
        for cat_id, name, icon, color, order_num in default_categories:
            cursor.execute(
                "INSERT INTO categories (id, name, icon, color, order_num, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (cat_id, name, icon, color, order_num, now)
            )
            
    conn.commit()
    conn.close()

# Helper query methods
def get_all_categories() -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("""
        SELECT id, name, icon, color, order_num, created_at,
               COALESCE(is_locked, 0) as is_locked,
               COALESCE(password_hint, '') as hint,
               COALESCE(is_favorite, 0) as is_favorite,
               COALESCE(favorited_at, '') as favorited_at
        FROM categories 
        ORDER BY 
            CASE WHEN id = 'all' THEN 0 ELSE 1 END ASC,
            COALESCE(is_favorite, 0) DESC,
            CASE WHEN COALESCE(is_favorite, 0) = 1 THEN favorited_at END ASC,
            order_num ASC,
            created_at ASC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_category(cat_id: str, name: str, icon: str = "folder", color: str = "#8b5cf6") -> Dict[str, Any]:
    conn = get_connection()
    now = datetime.now().isoformat()
    conn.execute(
        "INSERT OR REPLACE INTO categories (id, name, icon, color, order_num, created_at, is_locked, is_favorite, favorited_at) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(order_num), 0) + 1 FROM categories), ?, 0, 0, NULL)",
        (cat_id, name, icon, color, now)
    )
    conn.commit()
    row = conn.execute("SELECT id, name, icon, color, order_num, created_at, COALESCE(is_locked, 0) as is_locked, COALESCE(password_hint, '') as hint, COALESCE(is_favorite, 0) as is_favorite, COALESCE(favorited_at, '') as favorited_at FROM categories WHERE id = ?", (cat_id,)).fetchone()
    conn.close()
    return dict(row)

def update_category(cat_id: str, name: Optional[str] = None, icon: Optional[str] = None, color: Optional[str] = None, is_favorite: Optional[int] = None) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    updates = []
    params = []
    if name is not None:
        updates.append("name = ?")
        params.append(name.strip())
    if icon is not None:
        updates.append("icon = ?")
        params.append(icon.strip())
    if color is not None:
        updates.append("color = ?")
        params.append(color.strip())
    if is_favorite is not None:
        fav_val = 1 if is_favorite else 0
        updates.append("is_favorite = ?")
        params.append(fav_val)
        updates.append("favorited_at = ?")
        params.append(datetime.now().isoformat() if fav_val else None)
    if not updates:
        conn.close()
        return None
    params.append(cat_id)
    conn.execute(f"UPDATE categories SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    row = conn.execute("SELECT id, name, icon, color, order_num, created_at, COALESCE(is_locked, 0) as is_locked, COALESCE(password_hint, '') as hint, COALESCE(is_favorite, 0) as is_favorite, COALESCE(favorited_at, '') as favorited_at FROM categories WHERE id = ?", (cat_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def toggle_category_favorite(cat_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT is_favorite FROM categories WHERE id = ?", (cat_id,)).fetchone()
    if not row:
        conn.close()
        return None
    current = row[0] or 0
    new_fav = 0 if current else 1
    now_iso = datetime.now().isoformat() if new_fav else None
    conn.execute("UPDATE categories SET is_favorite = ?, favorited_at = ? WHERE id = ?", (new_fav, now_iso, cat_id))
    conn.commit()
    updated = conn.execute("SELECT id, name, icon, color, order_num, created_at, COALESCE(is_locked, 0) as is_locked, COALESCE(password_hint, '') as hint, COALESCE(is_favorite, 0) as is_favorite, COALESCE(favorited_at, '') as favorited_at FROM categories WHERE id = ?", (cat_id,)).fetchone()
    conn.close()
    return dict(updated) if updated else None

def delete_category(cat_id: str):
    conn = get_connection()
    conn.execute("UPDATE videos SET category_id = 'all' WHERE category_id = ?", (cat_id,))
    conn.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()

# --- CATEGORY LOCK & PASSWORD METHODS ---
def _hash_password(password: str) -> str:
    salt = "social_vault_secret_salt_2026"
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()

def set_category_lock(cat_id: str, password: str, hint: str = "") -> bool:
    if not password or not password.strip():
        return False
    hashed = _hash_password(password.strip())
    conn = get_connection()
    conn.execute(
        "UPDATE categories SET is_locked = 1, password_hash = ?, password_hint = ? WHERE id = ?",
        (hashed, (hint or "").strip(), cat_id)
    )
    conn.commit()
    conn.close()
    return True

def verify_category_lock(cat_id: str, password: str) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT password_hash, is_locked FROM categories WHERE id = ?", (cat_id,)).fetchone()
    conn.close()
    if not row:
        return False
    if not row["is_locked"]:
        return True
    if not row["password_hash"]:
        return False
    return row["password_hash"] == _hash_password(password.strip())

def remove_category_lock(cat_id: str, password: str) -> bool:
    if not verify_category_lock(cat_id, password):
        return False
    conn = get_connection()
    conn.execute(
        "UPDATE categories SET is_locked = 0, password_hash = NULL, password_hint = NULL WHERE id = ?",
        (cat_id,)
    )
    conn.commit()
    conn.close()
    return True

def change_category_password(cat_id: str, current_password: str, new_password: str, hint: str = "") -> bool:
    if not verify_category_lock(cat_id, current_password):
        return False
    return set_category_lock(cat_id, new_password, hint)

def is_vault_password_set() -> bool:
    conn = get_connection()
    row = conn.execute("SELECT value FROM app_settings WHERE key = 'vault_password'").fetchone()
    conn.close()
    return bool(row and row[0])

def set_vault_password(password: str, hint: str = "") -> bool:
    if not password or not password.strip():
        return False
    hashed = _hash_password(password.strip())
    now = datetime.now().isoformat()
    conn = get_connection()
    conn.execute("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('vault_password', ?, ?)", (hashed, now))
    conn.execute("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('vault_hint', ?, ?)", (hint.strip(), now))
    conn.commit()
    conn.close()
    return True

def verify_vault_password(password: str) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT value FROM app_settings WHERE key = 'vault_password'").fetchone()
    conn.close()
    if not row or not row[0]:
        return False
    return row[0] == _hash_password(password.strip())

def get_vault_hint() -> str:
    conn = get_connection()
    row = conn.execute("SELECT value FROM app_settings WHERE key = 'vault_hint'").fetchone()
    conn.close()
    return row[0] if row and row[0] else ""

def get_private_videos_count() -> int:
    conn = get_connection()
    row = conn.execute("SELECT COUNT(*) FROM videos WHERE is_private = 1 AND (status IS NULL OR status != 'trashed')").fetchone()
    conn.close()
    return row[0] if row else 0

def set_video_privacy(video_id: str, is_private: bool) -> bool:
    conn = get_connection()
    conn.execute("UPDATE videos SET is_private = ? WHERE id = ?", (1 if is_private else 0, video_id))
    conn.commit()
    conn.close()
    return True

def batch_set_video_privacy(video_ids: List[str], is_private: bool) -> int:
    if not video_ids:
        return 0
    conn = get_connection()
    placeholders = ",".join("?" for _ in video_ids)
    cursor = conn.execute(f"UPDATE videos SET is_private = ? WHERE id IN ({placeholders})", [1 if is_private else 0] + video_ids)
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected

def save_video(video_data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    now = datetime.now().isoformat()
    hashtags_json = json.dumps(video_data.get("hashtags", []))
    
    conn.execute("""
        INSERT OR REPLACE INTO videos (
            id, title, uploader, uploader_id, uploader_url, platform,
            source_url, description, hashtags, duration, view_count, like_count,
            category_id, file_path, file_size, thumbnail_url, local_thumbnail,
            quality, drive_file_id, drive_web_link, drive_synced, notes, status, created_at, is_private,
            is_used, used_at, media_type
        ) VALUES (
            :id, :title, :uploader, :uploader_id, :uploader_url, :platform,
            :source_url, :description, :hashtags, :duration, :view_count, :like_count,
            :category_id, :file_path, :file_size, :thumbnail_url, :local_thumbnail,
            :quality, :drive_file_id, :drive_web_link, :drive_synced, :notes, :status, :created_at, :is_private,
            :is_used, :used_at, :media_type
        )
    """, {
        "id": video_data["id"],
        "title": video_data.get("title", "Không có tiêu đề"),
        "uploader": video_data.get("uploader", "Chưa rõ"),
        "uploader_id": video_data.get("uploader_id", ""),
        "uploader_url": video_data.get("uploader_url", ""),
        "platform": video_data.get("platform", "other"),
        "source_url": video_data.get("source_url", ""),
        "description": video_data.get("description", ""),
        "hashtags": hashtags_json,
        "duration": video_data.get("duration", 0),
        "view_count": video_data.get("view_count", 0),
        "like_count": video_data.get("like_count", 0),
        "category_id": video_data.get("category_id", "all"),
        "file_path": video_data.get("file_path", ""),
        "file_size": video_data.get("file_size", 0),
        "thumbnail_url": video_data.get("thumbnail_url", ""),
        "local_thumbnail": video_data.get("local_thumbnail", ""),
        "quality": video_data.get("quality", "best"),
        "drive_file_id": video_data.get("drive_file_id", ""),
        "drive_web_link": video_data.get("drive_web_link", ""),
        "drive_synced": video_data.get("drive_synced", 0),
        "notes": video_data.get("notes", ""),
        "status": video_data.get("status", "saved"),
        "created_at": video_data.get("created_at", now),
        "is_private": 1 if video_data.get("is_private") else 0,
        "is_used": 1 if video_data.get("is_used") else 0,
        "used_at": video_data.get("used_at"),
        "media_type": video_data.get("media_type", "video")
    })
    conn.commit()
    row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_data["id"],)).fetchone()
    conn.close()
    result = dict(row)
    result["hashtags"] = json.loads(result["hashtags"] or "[]")
    return result

def get_videos(category_id: Optional[str] = None, search: Optional[str] = None, status: Optional[str] = "active", is_private: Optional[bool] = False, used_status: Optional[str] = None, media_type: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    query = "SELECT * FROM videos WHERE 1=1"
    params = []
    
    # Lọc trạng thái: "active" (bình thường), "trashed" (trong thùng rác), "all" (tất cả)
    if status == "active":
        query += " AND (status IS NULL OR status != 'trashed')"
    elif status == "trashed":
        query += " AND status = 'trashed'"
        
    if status == "trashed":
        if category_id and category_id != "all":
            query += " AND category_id = ?"
            params.append(category_id)
    else:
        if category_id and category_id != "all":
            query += " AND category_id = ?"
            params.append(category_id)
        else:
            # Khi xem "all" (Tất cả Video / Video mới tải về chưa phân loại):
            # Chỉ hiển thị các video mới tải về chưa phân loại hoặc chưa chuyển sang danh mục nào khác
            query += " AND (category_id IS NULL OR category_id = 'all' OR category_id = 'default' OR category_id = '' OR category_id NOT IN (SELECT id FROM categories WHERE id != 'all'))"
        
    if search:
        query += " AND (title LIKE ? OR description LIKE ? OR uploader LIKE ? OR hashtags LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s, s])

    # Lọc theo trạng thái đã sử dụng
    if used_status == "used":
        query += " AND is_used = 1"
    elif used_status == "unused":
        query += " AND (is_used IS NULL OR is_used = 0)"

    # Lọc theo loại phương tiện (video / image)
    if media_type and media_type != "all":
        query += " AND (media_type = ? OR (media_type IS NULL AND ? = 'video'))"
        params.extend([media_type, media_type])
        
    if status == "trashed":
        query += " ORDER BY trashed_at DESC, created_at DESC"
    else:
        query += " ORDER BY created_at DESC"
        
    rows = conn.execute(query, params).fetchall()
    conn.close()
    
    result = []
    for r in rows:
        item = dict(r)
        item["hashtags"] = json.loads(item["hashtags"] or "[]")
        result.append(item)
    return result

def get_trash_count() -> int:
    """Đếm tổng số lượng video đang nằm trong thùng rác"""
    conn = get_connection()
    row = conn.execute("SELECT COUNT(*) FROM videos WHERE status = 'trashed'").fetchone()
    conn.close()
    return row[0] if row else 0

def soft_delete_video(video_id: str) -> Optional[Dict[str, Any]]:
    """Xóa tạm: Chuyển video vào thùng rác (không xóa file)"""
    conn = get_connection()
    now = datetime.now().isoformat()
    conn.execute("UPDATE videos SET status = 'trashed', trashed_at = ? WHERE id = ?", (now, video_id))
    conn.commit()
    conn.close()
    return get_video_by_id(video_id)

def restore_video(video_id: str) -> Optional[Dict[str, Any]]:
    """Khôi phục video từ thùng rác về kho chính"""
    conn = get_connection()
    conn.execute("UPDATE videos SET status = 'saved', trashed_at = NULL WHERE id = ?", (video_id,))
    conn.commit()
    conn.close()
    return get_video_by_id(video_id)

def get_video_by_id(video_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
    conn.close()
    if not row:
        return None
    item = dict(row)
    item["hashtags"] = json.loads(item["hashtags"] or "[]")
    return item

def update_video(video_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    allowed_fields = [
        "title", "description", "category_id", "notes", "status", "trashed_at",
        "hashtags", "drive_file_id", "drive_web_link", "drive_synced",
        "file_path", "local_thumbnail", "file_size", "quality", "thumbnail_url",
        "is_used", "used_at", "media_type"
    ]
    set_clauses = []
    params = []
    for key, value in updates.items():
        if key in allowed_fields:
            if key == "hashtags" and isinstance(value, list):
                value = json.dumps(value)
            set_clauses.append(f"{key} = ?")
            params.append(value)
            
    if not set_clauses:
        conn.close()
        return get_video_by_id(video_id)
        
    params.append(video_id)
    conn.execute(f"UPDATE videos SET {', '.join(set_clauses)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return get_video_by_id(video_id)

def permanent_delete_video(video_id: str) -> Optional[Dict[str, Any]]:
    """Xóa vĩnh viễn: Xóa file trên máy tính và xóa bản ghi khỏi DB"""
    video = get_video_by_id(video_id)
    if not video:
        return None
        
    # Xóa file video và thumbnail trên máy tính
    if video.get("file_path") and os.path.exists(video["file_path"]):
        try:
            os.remove(video["file_path"])
        except Exception as e:
            print(f"Error removing local file: {e}")
            
    if video.get("local_thumbnail") and os.path.exists(video["local_thumbnail"]):
        try:
            os.remove(video["local_thumbnail"])
        except Exception as e:
            print(f"Error removing local thumbnail: {e}")
            
    conn = get_connection()
    conn.execute("DELETE FROM videos WHERE id = ?", (video_id,))
    conn.execute("DELETE FROM calendar_events WHERE video_id = ?", (video_id,))
    conn.commit()
    conn.close()
    return video

def delete_video(video_id: str) -> bool:
    """Giữ hàm tương thích cũ (gọi soft_delete_video)"""
    res = soft_delete_video(video_id)
    return bool(res)

def toggle_video_used(video_id: str, is_used: Optional[bool] = None) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    current = conn.execute("SELECT is_used FROM videos WHERE id = ?", (video_id,)).fetchone()
    if not current:
        conn.close()
        return None
    
    current_val = current["is_used"] or 0
    if is_used is None:
        target_val = 0 if current_val == 1 else 1
    else:
        target_val = 1 if is_used else 0
        
    used_at = datetime.now().isoformat() if target_val == 1 else None
    conn.execute("UPDATE videos SET is_used = ?, used_at = ? WHERE id = ?", (target_val, used_at, video_id))
    conn.commit()
    conn.close()
    return get_video_by_id(video_id)

def batch_set_videos_used(video_ids: List[str], is_used: bool) -> int:
    if not video_ids:
        return 0
    conn = get_connection()
    target_val = 1 if is_used else 0
    used_at = datetime.now().isoformat() if target_val == 1 else None
    placeholders = ",".join("?" for _ in video_ids)
    cursor = conn.execute(
        f"UPDATE videos SET is_used = ?, used_at = ? WHERE id IN ({placeholders})",
        [target_val, used_at] + video_ids
    )
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected

# Calendar Methods
def get_calendar_events() -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("""
        SELECT c.*, v.title as video_title, v.thumbnail_url, v.local_thumbnail, v.file_path, v.platform
        FROM calendar_events c
        LEFT JOIN videos v ON c.video_id = v.id
        ORDER BY c.scheduled_date ASC, c.scheduled_time ASC
    """).fetchall()
    conn.close()
    
    events = []
    for r in rows:
        ev = dict(r)
        ev["platforms"] = json.loads(ev["platforms"] or "[]")
        events.append(ev)
    return events

def save_calendar_event(event_data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    now = datetime.now().isoformat()
    platforms_json = json.dumps(event_data.get("platforms", ["tiktok", "youtube_shorts"]))
    
    conn.execute("""
        INSERT OR REPLACE INTO calendar_events (
            id, video_id, title, scheduled_date, scheduled_time, platforms, status, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        event_data["id"],
        event_data.get("video_id"),
        event_data.get("title", ""),
        event_data.get("scheduled_date"),
        event_data.get("scheduled_time", "19:00"),
        platforms_json,
        event_data.get("status", "scheduled"),
        event_data.get("notes", ""),
        event_data.get("created_at", now)
    ))
    conn.commit()
    conn.close()
    return event_data

def delete_calendar_event(event_id: str) -> bool:
    conn = get_connection()
    conn.execute("DELETE FROM calendar_events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()
    return True

# Notes / Scripts Methods
def get_notes() -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("""
        SELECT n.*, v.title as video_title
        FROM notes n
        LEFT JOIN videos v ON n.linked_video_id = v.id
        ORDER BY n.updated_at DESC
    """).fetchall()
    conn.close()
    
    notes = []
    for r in rows:
        n = dict(r)
        n["tags"] = json.loads(n["tags"] or "[]")
        notes.append(n)
    return notes

def save_note(note_data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    now = datetime.now().isoformat()
    tags_json = json.dumps(note_data.get("tags", []))
    
    conn.execute("""
        INSERT OR REPLACE INTO notes (
            id, title, content_html, content_text, category, linked_video_id, tags, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM notes WHERE id = ?), ?))
    """, (
        note_data["id"],
        note_data.get("title", "Ghi chú không tên"),
        note_data.get("content_html", ""),
        note_data.get("content_text", ""),
        note_data.get("category", "general"),
        note_data.get("linked_video_id"),
        tags_json,
        now,
        note_data["id"],
        now
    ))
    conn.commit()
    conn.close()
    return note_data

def delete_note(note_id: str) -> bool:
    conn = get_connection()
    conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()
    return True

# Settings Methods
def get_setting(key: str, default: str = "") -> str:
    conn = get_connection()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row[0] if row else default

def set_setting(key: str, value: str):
    conn = get_connection()
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
    conn.close()

# 6. Prompts Methods
def get_prompts(
    search: str = "",
    media_type: str = "",
    ai_model: str = "",
    category: str = "",
    is_favorite: Optional[bool] = None
) -> List[Dict[str, Any]]:
    conn = get_connection()
    query = "SELECT * FROM prompts WHERE 1=1"
    params = []
    
    if search:
        s = f"%{search.strip()}%"
        query += " AND (title LIKE ? OR prompt LIKE ? OR tags LIKE ? OR negative_prompt LIKE ? OR ai_model LIKE ?)"
        params.extend([s, s, s, s, s])
        
    if media_type and media_type != "all":
        query += " AND media_type = ?"
        params.append(media_type.strip())
        
    if ai_model and ai_model != "all":
        query += " AND LOWER(ai_model) = LOWER(?)"
        params.append(ai_model.strip())
        
    if category and category != "all":
        query += " AND category = ?"
        params.append(category.strip())
        
    if is_favorite is not None:
        query += " AND is_favorite = ?"
        params.append(1 if is_favorite else 0)
        
    query += " ORDER BY created_at DESC"
    
    rows = conn.execute(query, params).fetchall()
    conn.close()
    
    prompts = []
    for r in rows:
        p = dict(r)
        try:
            p["tags"] = json.loads(p["tags"] or "[]")
        except Exception:
            p["tags"] = [t.strip() for t in (p["tags"] or "").split(",") if t.strip()]
        prompts.append(p)
    return prompts

def get_prompt_by_id(prompt_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
    conn.close()
    if not row:
        return None
    p = dict(row)
    try:
        p["tags"] = json.loads(p["tags"] or "[]")
    except Exception:
        p["tags"] = [t.strip() for t in (p["tags"] or "").split(",") if t.strip()]
    return p

def create_prompt(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    prompt_id = data.get("id") or f"pmt_{int(datetime.now().timestamp()*1000)}_{os.urandom(3).hex()}"
    now = datetime.now().isoformat()
    tags = data.get("tags", [])
    if isinstance(tags, list):
        tags_json = json.dumps(tags, ensure_ascii=False)
    else:
        tags_json = json.dumps([t.strip() for t in str(tags).split(",") if t.strip()], ensure_ascii=False)
        
    conn.execute("""
        INSERT INTO prompts (
            id, title, prompt, negative_prompt, media_type, media_url,
            local_path, thumbnail_url, ai_model, category, tags,
            parameters, notes, is_favorite, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        prompt_id,
        data.get("title", ""),
        data.get("prompt", ""),
        data.get("negative_prompt", ""),
        data.get("media_type", "image"),
        data.get("media_url", ""),
        data.get("local_path", ""),
        data.get("thumbnail_url", data.get("media_url", "")),
        data.get("ai_model", "Midjourney"),
        data.get("category", "general"),
        tags_json,
        data.get("parameters", ""),
        data.get("notes", ""),
        1 if data.get("is_favorite") else 0,
        now,
        now
    ))
    conn.commit()
    conn.close()
    return get_prompt_by_id(prompt_id)

def update_prompt(prompt_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    now = datetime.now().isoformat()
    updates = ["updated_at = ?"]
    params = [now]
    
    allowed_fields = [
        "title", "prompt", "negative_prompt", "media_type", "media_url",
        "local_path", "thumbnail_url", "ai_model", "category",
        "parameters", "notes", "is_favorite",
        "drive_file_id", "drive_web_link", "drive_synced"
    ]
    
    for f in allowed_fields:
        if f in data:
            updates.append(f"{f} = ?")
            if f == "is_favorite":
                params.append(1 if data[f] else 0)
            else:
                params.append(data[f])
                
    if "tags" in data:
        tags = data["tags"]
        if isinstance(tags, list):
            tags_json = json.dumps(tags, ensure_ascii=False)
        else:
            tags_json = json.dumps([t.strip() for t in str(tags).split(",") if t.strip()], ensure_ascii=False)
        updates.append("tags = ?")
        params.append(tags_json)
        
    params.append(prompt_id)
    conn.execute(f"UPDATE prompts SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return get_prompt_by_id(prompt_id)

def delete_prompt(prompt_id: str) -> Optional[str]:
    conn = get_connection()
    row = conn.execute("SELECT local_path FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
    local_path = row[0] if row and row[0] else None
    conn.execute("DELETE FROM prompts WHERE id = ?", (prompt_id,))
    conn.commit()
    conn.close()
    return local_path

def toggle_favorite_prompt(prompt_id: str) -> Optional[bool]:
    conn = get_connection()
    row = conn.execute("SELECT is_favorite FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
    if not row:
        conn.close()
        return None
    new_fav = 0 if row[0] else 1
    conn.execute("UPDATE prompts SET is_favorite = ?, updated_at = ? WHERE id = ?", (new_fav, datetime.now().isoformat(), prompt_id))
    conn.commit()
    conn.close()
    return bool(new_fav)

def get_prompt_stats() -> Dict[str, Any]:
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) FROM prompts").fetchone()[0]
    images = conn.execute("SELECT COUNT(*) FROM prompts WHERE media_type = 'image'").fetchone()[0]
    videos = conn.execute("SELECT COUNT(*) FROM prompts WHERE media_type = 'video'").fetchone()[0]
    favorites = conn.execute("SELECT COUNT(*) FROM prompts WHERE is_favorite = 1").fetchone()[0]
    models = [r[0] for r in conn.execute("SELECT DISTINCT ai_model FROM prompts WHERE ai_model IS NOT NULL AND ai_model != ''").fetchall()]
    conn.close()
    return {
        "total": total,
        "images": images,
        "videos": videos,
        "favorites": favorites,
        "models": models
    }
