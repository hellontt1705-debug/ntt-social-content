import sqlite3
import json
import os
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
import hashlib

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(os.path.dirname(DB_DIR), "social_content.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=60.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA busy_timeout=60000;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA cache_size=10000;")
        conn.execute("PRAGMA temp_store=MEMORY;")
    except Exception:
        pass
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
        created_at TEXT,
        parent_id TEXT DEFAULT NULL
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

    # Migration: ensure computer export tracking columns exist
    for col, col_type in [
        ("is_saved_to_computer", "INTEGER DEFAULT 0"),
        ("local_export_count", "INTEGER DEFAULT 0"),
        ("last_exported_at", "TEXT"),
        ("last_export_folder", "TEXT"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE videos ADD COLUMN {col} {col_type};")
        except Exception:
            pass
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_videos_saved_computer ON videos(is_saved_to_computer);")

    # Migration: ensure is_learned, learned_at, learn_notes columns exist for tutorial/learning tracking
    for col, col_type in [
        ("is_learned", "INTEGER DEFAULT 0"),
        ("learned_at", "TEXT"),
        ("learn_notes", "TEXT"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE videos ADD COLUMN {col} {col_type};")
        except Exception:
            pass
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_videos_is_learned ON videos(is_learned);")

    # Migration: ensure category lock, favorite and parent_id columns exist
    for col, col_type in [
        ("is_locked", "INTEGER DEFAULT 0"),
        ("password_hash", "TEXT"),
        ("password_hint", "TEXT"),
        ("is_favorite", "INTEGER DEFAULT 0"),
        ("favorited_at", "TEXT"),
        ("parent_id", "TEXT DEFAULT NULL"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE categories ADD COLUMN {col} {col_type};")
        except Exception:
            pass

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);")
    except Exception:
        pass

    try:
        cursor.execute("UPDATE categories SET favorited_at = created_at WHERE is_favorite = 1 AND (favorited_at IS NULL OR favorited_at = '');")
    except Exception:
        pass


    # Migration: ensure calendar_events columns exist for content planner
    for col, col_type in [
        ("published_at", "TEXT"),
        ("published_url", "TEXT"),
        ("manual_note", "TEXT"),
        ("caption", "TEXT"),
        ("hashtags", "TEXT"),
        ("timezone", "TEXT DEFAULT '(UTC+7) Asia/Ho_Chi_Minh'"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE calendar_events ADD COLUMN {col} {col_type};")
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

    # 7. Social Channels Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS social_channels (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        name TEXT NOT NULL,
        handle TEXT,
        url TEXT,
        avatar_url TEXT,
        email TEXT,
        orientation TEXT,
        status TEXT DEFAULT 'active',
        followers_count INTEGER DEFAULT 0,
        following_count INTEGER DEFAULT 0,
        likes_count INTEGER DEFAULT 0,
        posts_count INTEGER DEFAULT 0,
        views_count INTEGER DEFAULT 0,
        bio TEXT,
        notes TEXT,
        last_synced_at TEXT,
        created_at TEXT,
        updated_at TEXT
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_channels_platform ON social_channels(platform);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_channels_status ON social_channels(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_channels_created ON social_channels(created_at DESC);")
    
    try:
        cursor.execute("ALTER TABLE social_channels ADD COLUMN has_new_videos INTEGER DEFAULT 0;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE social_channels ADD COLUMN new_videos_count INTEGER DEFAULT 0;")
    except Exception:
        pass
    
    # 7. Channel Followers
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS channel_followers (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        handle TEXT,
        url TEXT,
        avatar_url TEXT,
        created_at TEXT
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_followers_channel ON channel_followers(channel_id);")

    # 7.1 Channel Categories Table (Phân cấp loại danh mục cha - con)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS channel_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT 'folder',
        color TEXT DEFAULT '#8b5cf6',
        order_num INTEGER DEFAULT 0,
        parent_id TEXT DEFAULT NULL,
        created_at TEXT
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_channel_cats_parent ON channel_categories(parent_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_channel_cats_order ON channel_categories(order_num);")

    # Migration: category_id for social_channels
    try:
        cursor.execute("ALTER TABLE social_channels ADD COLUMN category_id TEXT DEFAULT 'default';")
    except Exception:
        pass
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_channels_category ON social_channels(category_id);")
    
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

    # Insert initial social channels if empty (using user's real examples)
    cursor.execute("SELECT COUNT(*) FROM social_channels")
    if cursor.fetchone()[0] == 0:
        now = datetime.now().isoformat()
        default_channels = [
            (
                "channel_yt_kotyatnitsa", "youtube", "Котятница (Toby Everfield)", "@kotyatnitsa",
                "https://www.youtube.com/@TobyEverfield", "", "",
                "Kênh video ngắn giải trí & động vật hài hước", "active",
                334000, 0, 0, 3000, 0,
                "Plzz help dear .....xem thêm", "", now, now, now
            ),
            (
                "channel_tt_tuyetnhi", "tiktok", "Tuyết Nhi", "@tuyetnhi01ne",
                "https://www.tiktok.com/@tuyetnhi01ne", "", "",
                "Sáng tạo nội dung cá nhân, vlog đời sống & ẩm thực", "active",
                83, 25, 25, 1, 0,
                "Mọi người follow ủng hộ, yêu thương mình với ạ 🥰", "", now, now, now
            ),
            (
                "channel_ig_nger_tt", "instagram", "Tuấn Tàii", "@nger_tt",
                "https://www.instagram.com/nger_tt/", "", "",
                "Hình ảnh & phong cách cá nhân", "active",
                14, 545, 0, 0, 0,
                "Tuấn Tàii (@nger_tt)", "", now, now, now
            ),
            (
                "channel_tt_chipoiiii", "tiktok", "@chipoiiii17", "@chipoiiii17",
                "https://www.tiktok.com/@chipoiiii17", "", "hellaboomt.1705@gmail.com",
                "Kênh làm video Affiliate marketing", "active",
                0, 0, 0, 0, 0,
                "", "", now, now, now
            ),
            (
                "channel_tt_ivannger", "tiktok", "@ivannger", "@ivannger",
                "https://www.tiktok.com/@ivannger", "", "tuantainguyen13579@gmail.com",
                "Học và chia sẻ edit video, phát triển bản thân", "active",
                0, 0, 0, 0, 0,
                "", "", now, now, now
            ),
            (
                "channel_tt_ntt1djuly", "tiktok", "@ntt.1djuly", "@ntt.1djuly",
                "https://www.tiktok.com/@ntt.1djuly", "", "hello.ntt1705@gmail.com",
                "Chưa có định hướng cụ thể", "need_orientation",
                0, 0, 0, 0, 0,
                "", "", now, now, now
            ),
            (
                "channel_tt_heynttne", "tiktok", "@heynttne", "@heynttne",
                "https://www.tiktok.com/@heynttne", "", "ngtuantai0107@gmail.com",
                "Xây dựng và sáng tạo nội dung về game", "active",
                0, 0, 0, 0, 0,
                "", "", now, now, now
            ),
        ]
        for ch in default_channels:
            cursor.execute("""
                INSERT INTO social_channels (
                    id, platform, name, handle, url, avatar_url, email, orientation,
                    status, followers_count, following_count, likes_count, posts_count,
                    views_count, bio, notes, last_synced_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, ch)

    # Insert default channel categories if empty (Loại danh mục cha -> Danh mục con)
    cursor.execute("SELECT COUNT(*) FROM channel_categories")
    if cursor.fetchone()[0] == 0:
        now = datetime.now().isoformat()
        default_channel_cats = [
            ("cat_official", "Kênh Chính & Thương Hiệu", "award", "#6366f1", 1, None),
            ("cat_official_personal", "Kênh Cá Nhân", "user", "#818cf8", 2, "cat_official"),
            ("cat_official_business", "Kênh Doanh Nghiệp", "briefcase", "#a5b4fc", 3, "cat_official"),
            ("cat_content", "Nội Dung & Giải Trí", "film", "#ec4899", 4, None),
            ("cat_content_animation", "Hoạt hình & Đời thường", "smile", "#f472b6", 5, "cat_content"),
            ("cat_content_music", "Nhạc & Âm thanh", "music", "#fb7185", 6, "cat_content"),
            ("cat_content_game", "Game & Stream", "gamepad", "#f43f5e", 7, "cat_content"),
            ("cat_affiliate", "Affiliate & Bán Hàng", "shoppingBag", "#f59e0b", 8, None),
            ("cat_affiliate_fashion", "Gái nhảy AFF & Thời trang", "sparkles", "#fbbf24", 9, "cat_affiliate"),
            ("cat_affiliate_review", "Review & Tiện ích", "star", "#fcd34d", 10, "cat_affiliate"),
            ("cat_skills", "Học Tập & Kỹ Năng", "book", "#10b981", 11, None),
            ("cat_skills_edit", "Học Edit & Design", "video", "#34d399", 12, "cat_skills"),
            ("cat_skills_ai", "AI & Công Nghệ", "zap", "#6ee7b7", 13, "cat_skills"),
            ("cat_satellite", "Kênh Vệ Tinh & Thử Nghiệm", "globe", "#38bdf8", 14, None),
            ("cat_satellite_reup", "Reup & Thử Nghiệm", "refreshCw", "#7dd3fc", 15, "cat_satellite"),
            ("cat_satellite_unplanned", "Chưa Định Hướng", "helpCircle", "#bae6fd", 16, "cat_satellite"),
        ]
        for c_id, c_name, c_icon, c_color, c_order, c_parent in default_channel_cats:
            cursor.execute("""
                INSERT INTO channel_categories (id, name, icon, color, order_num, parent_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (c_id, c_name, c_icon, c_color, c_order, c_parent, now))

        # Khởi tạo phân loại thông minh cho các kênh hiện có chưa phân loại
        try:
            cursor.execute("UPDATE social_channels SET category_id = 'cat_content_music' WHERE (category_id IS NULL OR category_id = 'default') AND (orientation LIKE '%nhạc%' OR name LIKE '%101%')")
            cursor.execute("UPDATE social_channels SET category_id = 'cat_content_animation' WHERE (category_id IS NULL OR category_id = 'default') AND orientation LIKE '%hoạt hình%'")
            cursor.execute("UPDATE social_channels SET category_id = 'cat_content_game' WHERE (category_id IS NULL OR category_id = 'default') AND orientation LIKE '%game%'")
            cursor.execute("UPDATE social_channels SET category_id = 'cat_skills_ai' WHERE (category_id IS NULL OR category_id = 'default') AND orientation LIKE '%AI%'")
            cursor.execute("UPDATE social_channels SET category_id = 'cat_skills_edit' WHERE (category_id IS NULL OR category_id = 'default') AND orientation LIKE '%edit%'")
            cursor.execute("UPDATE social_channels SET category_id = 'cat_affiliate_fashion' WHERE (category_id IS NULL OR category_id = 'default') AND (orientation LIKE '%AFF%' OR orientation LIKE '%nhảy%')")
            cursor.execute("UPDATE social_channels SET category_id = 'cat_satellite_unplanned' WHERE (category_id IS NULL OR category_id = 'default') AND orientation LIKE '%chưa biết%'")
            cursor.execute("UPDATE social_channels SET category_id = 'cat_official_personal' WHERE (category_id IS NULL OR category_id = 'default') AND orientation LIKE '%phát triển%'")
        except Exception:
            pass

    # 8. Resource Categories Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS resource_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT 'folder',
        color TEXT DEFAULT '#8b5cf6',
        order_num INTEGER DEFAULT 0,
        created_at TEXT
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_res_cats_order ON resource_categories(order_num);")

    # 9. Resources Table (Links, Notes, Google Docs/Sheets, AI Prompt Hubs, Drive links)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        description TEXT DEFAULT '',
        category_id TEXT DEFAULT 'default',
        type TEXT DEFAULT 'website',
        tags TEXT DEFAULT '[]',
        icon TEXT DEFAULT '',
        favicon_url TEXT DEFAULT '',
        image_url TEXT DEFAULT '',
        is_favorite INTEGER DEFAULT 0,
        pinned INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resources_favorite ON resources(is_favorite);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resources_created ON resources(created_at DESC);")

    try:
        cursor.execute("ALTER TABLE resources ADD COLUMN image_url TEXT DEFAULT '';")
    except Exception:
        pass

    conn.commit()

    # Insert default resource categories if empty
    now = datetime.now().isoformat()
    default_res_cats = [
        ("rc_ready_prompts", "sẵn prompt đủ loại", "folder", "#10b981", 1),
        ("rc_prompt_hubs", "Kho Prompt & AI Hub", "sparkles", "#8b5cf6", 2),
        ("rc_google_docs", "Tài Liệu Google (Docs & Sheets)", "fileText", "#3b82f6", 3),
        ("rc_tools", "Công Cụ & Tiện Ích AI", "hardDrive", "#f59e0b", 4),
    ]
    for cid, name, icon, color, order_num in default_res_cats:
        cursor.execute(
            "INSERT OR IGNORE INTO resource_categories (id, name, icon, color, order_num, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (cid, name, icon, color, order_num, now)
        )

    # Insert default resources if empty
    cursor.execute("SELECT COUNT(*) FROM resources")
    if cursor.fetchone()[0] == 0:
        now = datetime.now().isoformat()
        default_res = [
            (
                "res_lootprompt",
                "Prompts by Deniz Akkabak — AI Prompt Database",
                "https://lootprompt.com/#",
                "Kho cơ sở dữ liệu các câu lệnh Prompt AI chuyên nghiệp được phân loại chi tiết theo từng chủ đề, phong cách, hiệu ứng và công cụ tạo ảnh/video.",
                "rc_prompt_hubs",
                "prompt_hub",
                json.dumps(["AI Prompt", "Database", "Deniz Akkabak", "Midjourney", "Flux"]),
                "sparkles",
                "",
                1,
                1,
                now,
                now
            ),
            (
                "res_openpromptlib",
                "OpenPromptLib — Thư viện Prompt AI chất lượng cao",
                "https://openpromptlib.com/",
                "Thư viện tổng hợp prompt tuyển chọn cho Midjourney, Stable Diffusion, ChatGPT với cộng đồng chia sẻ rộng lớn.",
                "rc_prompt_hubs",
                "prompt_hub",
                json.dumps(["Prompt Library", "Community", "Free Prompts"]),
                "sparkles",
                "",
                1,
                1,
                now,
                now
            ),
            (
                "res_food_mini",
                "Food Miniature Prompts",
                "https://docs.google.com/document/d/food-miniature-prompts",
                "Tập hợp các prompt tạo ảnh ẩm thực đồ ăn thu nhỏ (miniature food) siêu thực, hiệu ứng macro chi tiết và bối cảnh sống động.",
                "rc_ready_prompts",
                "doc",
                json.dumps(["Google Docs", "Ẩm thực", "Miniature", "Prompt AI"]),
                "fileText",
                "",
                0,
                0,
                now,
                now
            ),
            (
                "res_childhood_pdf",
                "Childhood_Animation_Guide.pdf - Google Drive",
                "https://drive.google.com/file/d/childhood-animation-guide",
                "Cẩm nang hướng dẫn tạo hoạt hình phong cách tuổi thơ, hướng dẫn storyboard và prompt animate từng phân cảnh.",
                "rc_ready_prompts",
                "pdf",
                json.dumps(["Google Drive", "PDF", "Animation Guide", "Hoạt hình"]),
                "fileText",
                "",
                0,
                0,
                now,
                now
            ),
            (
                "res_freeze_time",
                "Hiệu ứng dừng thời gian (Time Freeze)",
                "https://docs.google.com/document/d/hieu-ung-dung-thoi-gian",
                "Kịch bản và prompt tạo chuyển động video hiệu ứng đóng băng thời gian, các vật thể dừng lơ lửng giữa không trung.",
                "rc_ready_prompts",
                "doc",
                json.dumps(["Google Docs", "VFX", "Time Freeze", "Prompt Video"]),
                "fileText",
                "",
                0,
                0,
                now,
                now
            ),
            (
                "res_60_motion",
                "60 câu lệnh tạo chuyển động video AI",
                "https://docs.google.com/document/d/60-cau-lenh-chuyen-dong-video-ai",
                "Trọn bộ 60 câu lệnh camera movements: pan, tilt, zoom, dolly, orbit và motion rate cho Runway, Pika, Kling, Luma.",
                "rc_ready_prompts",
                "doc",
                json.dumps(["Google Docs", "Video AI", "Camera Prompts", "Kling", "Luma"]),
                "fileText",
                "",
                1,
                0,
                now,
                now
            ),
            (
                "res_keemfinity",
                "Keemfinity_tách rời bộ phận",
                "https://docs.google.com/document/d/keemfinity-tach-roi-bo-phan",
                "Kỹ thuật phân rã và tách rời các bộ phận mô hình 3D, animation phân mảnh độc đáo.",
                "rc_ready_prompts",
                "doc",
                json.dumps(["Google Docs", "Keemfinity", "Exploded View"]),
                "fileText",
                "",
                0,
                0,
                now,
                now
            ),
            (
                "res_mini_rescue",
                "MINI RESCUE",
                "https://docs.google.com/document/d/mini-rescue",
                "Kịch bản tình huống giải cứu mini, các động vật nhỏ hoặc nhân vật đồ chơi trong môi trường thực tế.",
                "rc_ready_prompts",
                "doc",
                json.dumps(["Google Docs", "Kịch bản", "Mini Rescue"]),
                "fileText",
                "",
                0,
                0,
                now,
                now
            ),
            (
                "res_spiderman",
                "Spiderman in NYC",
                "https://lootprompt.com/prompt/spiderman-in-nyc",
                "Prompt hành động cinematic Spider-man đu tơ giữa các tòa nhà chọc trời New York lúc hoàng hôn.",
                "rc_ready_prompts",
                "prompt_hub",
                json.dumps(["Spiderman", "Cinematic", "New York"]),
                "sparkles",
                "",
                0,
                0,
                now,
                now
            ),
            (
                "res_dreamcore",
                "Dreamcore & Liminal Spaces",
                "https://openpromptlib.com/prompt/dreamcore",
                "Prompt nghệ thuật phong cách không gian siêu thực mộng mơ, cảm giác nostalgic và kỳ ảo.",
                "rc_ready_prompts",
                "prompt_hub",
                json.dumps(["Dreamcore", "Aesthetic", "Surreal"]),
                "sparkles",
                "",
                0,
                0,
                now,
                now
            ),
            (
                "res_chatbot_prompt",
                "Chia sẻ Chatbot tạo Prompt tự động | Master Prompt AI",
                "https://chatgpt.com/g/chatbot-auto-prompt",
                "Chatbot AI hỗ trợ tự động gợi ý, tối ưu và viết cấu trúc prompt chi tiết theo từng ý tưởng nội dung video/hình ảnh.",
                "rc_ready_prompts",
                "chatbot",
                json.dumps(["Chatbot", "Auto Prompt", "ChatGPT GPTs"]),
                "sparkles",
                "",
                1,
                0,
                now,
                now
            ),
            (
                "res_higgsfield",
                "Higgsfield with MCP_claude",
                "https://docs.google.com/document/d/higgsfield-with-mcp-claude",
                "Hướng dẫn cài đặt và tích hợp MCP server kết nối Claude với nền tảng tạo video Higgsfield AI.",
                "rc_ready_prompts",
                "doc",
                json.dumps(["Google Docs", "Higgsfield", "MCP", "Claude"]),
                "fileText",
                "",
                0,
                0,
                now,
                now
            )
        ]
        for r in default_res:
            cursor.execute("""
                INSERT INTO resources (
                    id, title, url, description, category_id, type, tags, icon,
                    favicon_url, is_favorite, pinned, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, r)

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
               COALESCE(favorited_at, '') as favorited_at,
               parent_id
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

def add_category(cat_id: str, name: str, icon: str = "folder", color: str = "#8b5cf6", parent_id: Optional[str] = None) -> Dict[str, Any]:
    conn = get_connection()
    now = datetime.now().isoformat()
    clean_parent = parent_id.strip() if parent_id and parent_id.strip() and parent_id != "__none__" else None
    conn.execute(
        "INSERT OR REPLACE INTO categories (id, name, icon, color, order_num, created_at, is_locked, is_favorite, favorited_at, parent_id) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(order_num), 0) + 1 FROM categories), ?, 0, 0, NULL, ?)",
        (cat_id, name, icon, color, now, clean_parent)
    )
    conn.commit()
    row = conn.execute("SELECT id, name, icon, color, order_num, created_at, COALESCE(is_locked, 0) as is_locked, COALESCE(password_hint, '') as hint, COALESCE(is_favorite, 0) as is_favorite, COALESCE(favorited_at, '') as favorited_at, parent_id FROM categories WHERE id = ?", (cat_id,)).fetchone()
    conn.close()
    return dict(row)

def update_category(cat_id: str, name: Optional[str] = None, icon: Optional[str] = None, color: Optional[str] = None, is_favorite: Optional[int] = None, parent_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
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
    if parent_id is not None:
        clean_parent = parent_id.strip() if parent_id and parent_id.strip() and parent_id != "__none__" else None
        updates.append("parent_id = ?")
        params.append(clean_parent)
    if not updates:
        conn.close()
        return None
    params.append(cat_id)
    conn.execute(f"UPDATE categories SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    row = conn.execute("SELECT id, name, icon, color, order_num, created_at, COALESCE(is_locked, 0) as is_locked, COALESCE(password_hint, '') as hint, COALESCE(is_favorite, 0) as is_favorite, COALESCE(favorited_at, '') as favorited_at, parent_id FROM categories WHERE id = ?", (cat_id,)).fetchone()
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
    updated = conn.execute("SELECT id, name, icon, color, order_num, created_at, COALESCE(is_locked, 0) as is_locked, COALESCE(password_hint, '') as hint, COALESCE(is_favorite, 0) as is_favorite, COALESCE(favorited_at, '') as favorited_at, parent_id FROM categories WHERE id = ?", (cat_id,)).fetchone()
    conn.close()
    return dict(updated) if updated else None

def delete_category(cat_id: str):
    conn = get_connection()
    conn.execute("UPDATE videos SET category_id = 'all' WHERE category_id = ?", (cat_id,))
    conn.execute("UPDATE categories SET parent_id = NULL WHERE parent_id = ?", (cat_id,))
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
            is_used, used_at, media_type, is_saved_to_computer, local_export_count, last_exported_at, last_export_folder
        ) VALUES (
            :id, :title, :uploader, :uploader_id, :uploader_url, :platform,
            :source_url, :description, :hashtags, :duration, :view_count, :like_count,
            :category_id, :file_path, :file_size, :thumbnail_url, :local_thumbnail,
            :quality, :drive_file_id, :drive_web_link, :drive_synced, :notes, :status, :created_at, :is_private,
            :is_used, :used_at, :media_type, :is_saved_to_computer, :local_export_count, :last_exported_at, :last_export_folder
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
        "media_type": video_data.get("media_type", "video"),
        "is_saved_to_computer": 1 if video_data.get("is_saved_to_computer") else 0,
        "local_export_count": video_data.get("local_export_count", 0),
        "last_exported_at": video_data.get("last_exported_at"),
        "last_export_folder": video_data.get("last_export_folder")
    })
    conn.commit()
    row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_data["id"],)).fetchone()
    conn.close()
    result = dict(row)
    result["hashtags"] = json.loads(result["hashtags"] or "[]")
    return result

def get_videos(category_id: Optional[str] = None, search: Optional[str] = None, status: Optional[str] = "active", is_private: Optional[bool] = False, used_status: Optional[str] = None, media_type: Optional[str] = None, learned_status: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    query = "SELECT * FROM videos WHERE 1=1"
    params = []
    
    # Lọc trạng thái: "active" (bình thường), "trashed" (trong thùng rác), "all" (tất cả)
    if status == "active":
        query += " AND (status IS NULL OR status != 'trashed')"
    elif status == "trashed":
        query += " AND status = 'trashed'"
        
    if status == "trashed":
        if category_id and category_id not in ["all", "*"]:
            query += " AND (category_id = ? OR category_id IN (SELECT id FROM categories WHERE parent_id = ?))"
            params.extend([category_id, category_id])
    else:
        if category_id == "*":
            # Lấy toàn bộ video trong toàn bộ danh mục mà không áp dụng bộ lọc phân loại
            pass
        elif category_id and category_id != "all":
            query += " AND (category_id = ? OR category_id IN (SELECT id FROM categories WHERE parent_id = ?))"
            params.extend([category_id, category_id])
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

    # Lọc theo trạng thái học tập (learned / unlearned)
    if learned_status == "learned":
        query += " AND is_learned = 1"
    elif learned_status == "unlearned":
        query += " AND (is_learned IS NULL OR is_learned = 0)"

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
        "is_used", "used_at", "media_type",
        "is_saved_to_computer", "local_export_count", "last_exported_at", "last_export_folder",
        "is_learned", "learned_at", "learn_notes"
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

def toggle_video_learned(video_id: str, is_learned: Optional[bool] = None, learn_notes: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Đánh dấu hoặc bỏ đánh dấu video đã xem/học làm video edit CapCut"""
    conn = get_connection()
    current = conn.execute("SELECT is_learned, learn_notes FROM videos WHERE id = ?", (video_id,)).fetchone()
    if not current:
        conn.close()
        return None
    
    current_val = current["is_learned"] or 0
    if is_learned is None:
        target_val = 0 if current_val == 1 else 1
    else:
        target_val = 1 if is_learned else 0
        
    learned_at = datetime.now().isoformat() if target_val == 1 else None
    
    if learn_notes is not None:
        conn.execute("UPDATE videos SET is_learned = ?, learned_at = ?, learn_notes = ? WHERE id = ?", (target_val, learned_at, learn_notes, video_id))
    else:
        conn.execute("UPDATE videos SET is_learned = ?, learned_at = ? WHERE id = ?", (target_val, learned_at, video_id))
        
    conn.commit()
    conn.close()
    return get_video_by_id(video_id)

def batch_set_videos_learned(video_ids: List[str], is_learned: bool) -> int:
    """Đánh dấu hoặc bỏ đánh dấu hàng loạt video đã xem/học làm"""
    if not video_ids:
        return 0
    conn = get_connection()
    target_val = 1 if is_learned else 0
    learned_at = datetime.now().isoformat() if target_val == 1 else None
    placeholders = ",".join("?" for _ in video_ids)
    cursor = conn.execute(
        f"UPDATE videos SET is_learned = ?, learned_at = ? WHERE id IN ({placeholders})",
        [target_val, learned_at] + video_ids
    )
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected

def reset_video_saved_status(video_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    conn.execute("""
        UPDATE videos 
        SET is_saved_to_computer = 0, 
            local_export_count = 0, 
            last_exported_at = NULL, 
            last_export_folder = NULL 
        WHERE id = ?
    """, (video_id,))
    conn.commit()
    conn.close()
    return get_video_by_id(video_id)

def batch_reset_videos_saved_status(video_ids: List[str]) -> int:
    if not video_ids:
        return 0
    conn = get_connection()
    placeholders = ",".join("?" for _ in video_ids)
    cursor = conn.execute(
        f"""
        UPDATE videos 
        SET is_saved_to_computer = 0, 
            local_export_count = 0, 
            last_exported_at = NULL, 
            last_export_folder = NULL 
        WHERE id IN ({placeholders})
        """,
        video_ids
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
            id, video_id, title, scheduled_date, scheduled_time, platforms, status, notes, created_at,
            published_at, published_url, manual_note, caption, hashtags, timezone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        event_data["id"],
        event_data.get("video_id"),
        event_data.get("title", ""),
        event_data.get("scheduled_date"),
        event_data.get("scheduled_time", "19:00"),
        platforms_json,
        event_data.get("status", "PLANNED"),
        event_data.get("notes", ""),
        event_data.get("created_at", now),
        event_data.get("published_at"),
        event_data.get("published_url"),
        event_data.get("manual_note"),
        event_data.get("caption"),
        event_data.get("hashtags"),
        event_data.get("timezone", "(UTC+7) Asia/Ho_Chi_Minh")
    ))
    conn.commit()
    conn.close()
    return event_data

def confirm_calendar_event_published(event_id: str, published_at: str, published_url: str = "", manual_note: str = "") -> Dict[str, Any]:
    conn = get_connection()
    conn.execute("""
        UPDATE calendar_events
        SET status = 'PUBLISHED_MANUALLY',
            published_at = ?,
            published_url = ?,
            manual_note = ?
        WHERE id = ?
    """, (published_at, published_url, manual_note, event_id))
    conn.commit()
    row = conn.execute("""
        SELECT c.*, v.title as video_title, v.thumbnail_url, v.local_thumbnail, v.file_path, v.platform
        FROM calendar_events c
        LEFT JOIN videos v ON c.video_id = v.id
        WHERE c.id = ?
    """, (event_id,)).fetchone()
    conn.close()
    if row:
        ev = dict(row)
        ev["platforms"] = json.loads(ev.get("platforms") or "[]")
        return ev
    return {}

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

# ==========================================
# Social Channels Management
# ==========================================

def get_social_channels(platform: Optional[str] = None, status: Optional[str] = None, search: Optional[str] = None, category_id: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    query = """
        SELECT sc.*, 
               cc.name as category_name, 
               cc.icon as category_icon, 
               cc.color as category_color, 
               cc.parent_id as category_parent_id,
               parent_cc.name as parent_category_name
        FROM social_channels sc
        LEFT JOIN channel_categories cc ON sc.category_id = cc.id
        LEFT JOIN channel_categories parent_cc ON cc.parent_id = parent_cc.id
        WHERE 1=1
    """
    params = []
    
    if platform and platform != "all":
        query += " AND sc.platform = ?"
        params.append(platform.lower())
        
    if status and status != "all":
        query += " AND sc.status = ?"
        params.append(status)

    if category_id and category_id != "all":
        if category_id in ["default", "uncategorized"]:
            query += " AND (sc.category_id IS NULL OR sc.category_id = 'default' OR sc.category_id = '' OR sc.category_id NOT IN (SELECT id FROM channel_categories))"
        else:
            query += " AND (sc.category_id = ? OR sc.category_id IN (SELECT id FROM channel_categories WHERE parent_id = ?))"
            params.extend([category_id, category_id])
        
    if search:
        s = f"%{search}%"
        query += " AND (sc.name LIKE ? OR sc.handle LIKE ? OR sc.email LIKE ? OR sc.orientation LIKE ? OR sc.notes LIKE ?)"
        params.extend([s, s, s, s, s])
        
    query += " ORDER BY sc.created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_social_channel_by_id(channel_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("""
        SELECT sc.*, 
               cc.name as category_name, 
               cc.icon as category_icon, 
               cc.color as category_color, 
               cc.parent_id as category_parent_id,
               parent_cc.name as parent_category_name
        FROM social_channels sc
        LEFT JOIN channel_categories cc ON sc.category_id = cc.id
        LEFT JOIN channel_categories parent_cc ON cc.parent_id = parent_cc.id
        WHERE sc.id = ?
    """, (channel_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def create_social_channel(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    channel_id = data.get("id") or f"channel_{int(datetime.now().timestamp() * 1000)}"
    now = datetime.now().isoformat()
    cat_id = data.get("category_id") or "default"
    
    conn.execute("""
        INSERT INTO social_channels (
            id, platform, name, handle, url, avatar_url, email, orientation,
            status, followers_count, following_count, likes_count, posts_count,
            views_count, bio, notes, last_synced_at, created_at, updated_at, category_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        channel_id,
        data.get("platform", "other").lower(),
        data.get("name", "Unnamed Channel"),
        data.get("handle", ""),
        data.get("url", ""),
        data.get("avatar_url", ""),
        data.get("email", ""),
        data.get("orientation", ""),
        data.get("status", "active"),
        int(data.get("followers_count") or 0),
        int(data.get("following_count") or 0),
        int(data.get("likes_count") or 0),
        int(data.get("posts_count") or 0),
        int(data.get("views_count") or 0),
        data.get("bio", ""),
        data.get("notes", ""),
        data.get("last_synced_at") or now,
        now,
        now,
        cat_id
    ))
    conn.commit()
    conn.close()
    return get_social_channel_by_id(channel_id)

def update_social_channel(channel_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    now = datetime.now().isoformat()
    updates = ["updated_at = ?"]
    params = [now]
    
    allowed_fields = [
        "platform", "name", "handle", "url", "avatar_url", "email",
        "orientation", "status", "followers_count", "following_count",
        "likes_count", "posts_count", "views_count", "bio", "notes",
        "last_synced_at", "has_new_videos", "new_videos_count", "category_id"
    ]
    
    for f in allowed_fields:
        if f in data:
            updates.append(f"{f} = ?")
            val = data[f]
            if f in ["followers_count", "following_count", "likes_count", "posts_count", "views_count", "has_new_videos", "new_videos_count"]:
                val = int(val) if val is not None else 0
            elif f == "platform" and isinstance(val, str):
                val = val.lower()
            params.append(val)
            
    params.append(channel_id)
    conn.execute(f"UPDATE social_channels SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return get_social_channel_by_id(channel_id)

def delete_social_channel(channel_id: str) -> bool:
    conn = get_connection()
    conn.execute("DELETE FROM social_channels WHERE id = ?", (channel_id,))
    conn.commit()
    conn.close()
    return True

def get_social_channels_stats() -> Dict[str, Any]:
    conn = get_connection()
    total = conn.execute("SELECT COUNT(*) FROM social_channels").fetchone()[0]
    oriented = conn.execute("SELECT COUNT(*) FROM social_channels WHERE status = 'active'").fetchone()[0]
    need_orientation = conn.execute("SELECT COUNT(*) FROM social_channels WHERE status IN ('need_orientation', 'planning')").fetchone()[0]
    total_followers = conn.execute("SELECT COALESCE(SUM(followers_count), 0) FROM social_channels").fetchone()[0]
    
    platform_rows = conn.execute("SELECT platform, COUNT(*) as cnt, COALESCE(SUM(followers_count), 0) as followers FROM social_channels GROUP BY platform").fetchall()
    by_platform = {r["platform"]: {"count": r["cnt"], "followers": r["followers"]} for r in platform_rows}
    
    conn.close()
    return {
        "total": total,
        "oriented": oriented,
        "need_orientation": need_orientation,
        "total_followers": total_followers,
        "by_platform": by_platform
    }

# ==========================================
# Channel Followers Management
# ==========================================

def get_channel_followers(channel_id: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM channel_followers WHERE channel_id = ? ORDER BY created_at ASC", (channel_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def save_channel_followers(channel_id: str, followers: List[Dict[str, Any]], replace: bool = True) -> int:
    conn = get_connection()
    now = datetime.now().isoformat()
    
    if replace:
        conn.execute("DELETE FROM channel_followers WHERE channel_id = ?", (channel_id,))
        
    inserted = 0
    for idx, f in enumerate(followers):
        display_name = (f.get("displayName") or f.get("display_name") or f.get("name") or "").strip()
        handle = (f.get("handle") or f.get("username") or "").strip()
        url = (f.get("url") or f.get("profile_url") or "").strip()
        avatar_url = (f.get("avatar_url") or f.get("avatar") or "").strip()
        
        if not display_name and not handle:
            continue
            
        fid = f"cf_{int(datetime.now().timestamp() * 1000)}_{idx}"
        conn.execute("""
            INSERT INTO channel_followers (id, channel_id, display_name, handle, url, avatar_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (fid, channel_id, display_name or handle, handle, url, avatar_url, now))
        inserted += 1
        
    conn.commit()
    conn.close()
    return inserted

def clear_channel_followers(channel_id: str) -> bool:
    conn = get_connection()
    conn.execute("DELETE FROM channel_followers WHERE channel_id = ?", (channel_id,))
    conn.commit()
    conn.close()
    return True

# ==========================================
# Channel Categories Management (Phân Cấp Danh Mục Kênh)
# ==========================================

def get_channel_categories() -> List[Dict[str, Any]]:
    """Lấy danh sách phân cấp danh mục kênh kèm số lượng kênh trực tiếp và tổng kênh cả mục con"""
    conn = get_connection()
    rows = conn.execute("""
        SELECT id, name, icon, color, order_num, parent_id, created_at
        FROM channel_categories
        ORDER BY order_num ASC, created_at ASC
    """).fetchall()
    
    # Tính số lượng kênh thuộc từng danh mục
    count_rows = conn.execute("""
        SELECT COALESCE(category_id, 'default') as cat_id, COUNT(*) as cnt
        FROM social_channels
        GROUP BY category_id
    """).fetchall()
    counts_map = {r["cat_id"]: r["cnt"] for r in count_rows}
    
    cats = [dict(r) for r in rows]
    children_map = {}
    valid_ids = set()
    for c in cats:
        valid_ids.add(c["id"])
        pid = c.get("parent_id")
        if pid:
            children_map.setdefault(pid, []).append(c["id"])
            
    for c in cats:
        cid = c["id"]
        direct = counts_map.get(cid, 0)
        c["direct_count"] = direct
        sub_cnt = sum(counts_map.get(sub_id, 0) for sub_id in children_map.get(cid, []))
        c["count"] = direct + sub_cnt
        
    conn.close()
    return cats

def add_channel_category(name: str, icon: str = "folder", color: str = "#8b5cf6", parent_id: Optional[str] = None, cat_id: Optional[str] = None) -> Dict[str, Any]:
    """Thêm một danh mục kênh mới (có thể là loại danh mục chính hoặc thuộc một loại danh mục khác)"""
    conn = get_connection()
    now = datetime.now().isoformat()
    if not cat_id:
        clean_name = re.sub(r'[^a-zA-Z0-9]', '_', name.lower().strip())
        cat_id = f"ch_cat_{clean_name}_{int(datetime.now().timestamp())}"
    clean_parent = parent_id.strip() if parent_id and parent_id.strip() and parent_id not in ["__none__", "none", ""] else None
    
    cursor = conn.cursor()
    cursor.execute("SELECT COALESCE(MAX(order_num), 0) + 1 FROM channel_categories")
    next_order = cursor.fetchone()[0]
    
    cursor.execute("""
        INSERT INTO channel_categories (id, name, icon, color, order_num, parent_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (cat_id, name.strip(), icon or "folder", color or "#8b5cf6", next_order, clean_parent, now))
    conn.commit()
    row = conn.execute("SELECT * FROM channel_categories WHERE id = ?", (cat_id,)).fetchone()
    conn.close()
    res = dict(row)
    res["count"] = 0
    res["direct_count"] = 0
    return res

def update_channel_category(cat_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Cập nhật tên, icon, màu sắc hoặc chuyển đổi loại danh mục cha"""
    conn = get_connection()
    updates = []
    params = []
    if "name" in data and data["name"] is not None:
        updates.append("name = ?")
        params.append(data["name"].strip())
    if "icon" in data and data["icon"] is not None:
        updates.append("icon = ?")
        params.append(data["icon"].strip())
    if "color" in data and data["color"] is not None:
        updates.append("color = ?")
        params.append(data["color"].strip())
    if "parent_id" in data:
        pid = data["parent_id"]
        clean_parent = pid.strip() if pid and pid.strip() and pid not in ["__none__", "none", ""] else None
        if clean_parent != cat_id:
            updates.append("parent_id = ?")
            params.append(clean_parent)
    if "order_num" in data and data["order_num"] is not None:
        updates.append("order_num = ?")
        params.append(int(data["order_num"]))
        
    if not updates:
        conn.close()
        return None
        
    params.append(cat_id)
    conn.execute(f"UPDATE channel_categories SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    row = conn.execute("SELECT * FROM channel_categories WHERE id = ?", (cat_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_channel_category(cat_id: str) -> bool:
    """Xóa danh mục kênh, chuyển các kênh về mặc định và giải phóng các mục con lên cấp cha"""
    conn = get_connection()
    conn.execute("UPDATE social_channels SET category_id = 'default' WHERE category_id = ?", (cat_id,))
    conn.execute("UPDATE channel_categories SET parent_id = NULL WHERE parent_id = ?", (cat_id,))
    conn.execute("DELETE FROM channel_categories WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()
    return True

def batch_update_channel_category(channel_ids: List[str], category_id: str) -> int:
    """Gán hoặc đổi danh mục hàng loạt cho nhiều kênh cùng lúc"""
    conn = get_connection()
    now = datetime.now().isoformat()
    updated = 0
    for cid in channel_ids:
        conn.execute("UPDATE social_channels SET category_id = ?, updated_at = ? WHERE id = ?", (category_id, now, cid))
        updated += 1
    conn.commit()
    conn.close()
    return updated

# --- RESOURCE & LINK VAULT ---

def get_resource_categories() -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("""
        SELECT rc.*, COUNT(r.id) as resource_count
        FROM resource_categories rc
        LEFT JOIN resources r ON rc.id = r.category_id
        GROUP BY rc.id
        ORDER BY rc.order_num ASC, rc.created_at ASC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def save_resource_category(cat_data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    now = datetime.now().isoformat()
    cid = cat_data.get("id") or f"rc_{int(datetime.now().timestamp() * 1000)}"
    name = (cat_data.get("name") or "Thư mục mới").strip()
    icon = cat_data.get("icon") or "folder"
    color = cat_data.get("color") or "#8b5cf6"
    order_num = cat_data.get("order_num", 0)

    conn.execute("""
        INSERT INTO resource_categories (id, name, icon, color, order_num, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            icon = excluded.icon,
            color = excluded.color,
            order_num = excluded.order_num
    """, (cid, name, icon, color, order_num, now))
    conn.commit()
    conn.close()
    return {"id": cid, "name": name, "icon": icon, "color": color, "order_num": order_num}

def delete_resource_category(cat_id: str) -> bool:
    conn = get_connection()
    # Move existing resources to default
    conn.execute("UPDATE resources SET category_id = 'default' WHERE category_id = ?", (cat_id,))
    conn.execute("DELETE FROM resource_categories WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()
    return True

def get_resources(category_id: Optional[str] = None, search: Optional[str] = None, res_type: Optional[str] = None, favorite_only: bool = False) -> List[Dict[str, Any]]:
    conn = get_connection()
    query = """
        SELECT r.*, rc.name as category_name, rc.color as category_color
        FROM resources r
        LEFT JOIN resource_categories rc ON r.category_id = rc.id
        WHERE 1=1
    """
    params = []

    if category_id and category_id != "all":
        query += " AND r.category_id = ?"
        params.append(category_id)

    if res_type and res_type != "all":
        query += " AND r.type = ?"
        params.append(res_type)

    if favorite_only:
        query += " AND (r.is_favorite = 1 OR r.pinned = 1)"

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query += " AND (LOWER(r.title) LIKE ? OR LOWER(r.url) LIKE ? OR LOWER(r.description) LIKE ? OR LOWER(r.tags) LIKE ?)"
        params.extend([term, term, term, term])

    query += " ORDER BY r.pinned DESC, r.is_favorite DESC, r.updated_at DESC, r.created_at DESC"

    rows = conn.execute(query, tuple(params)).fetchall()
    conn.close()

    result = []
    for r in rows:
        item = dict(r)
        try:
            item["tags"] = json.loads(item["tags"] or "[]")
        except Exception:
            item["tags"] = []
        result.append(item)
    return result

def save_resource(res_data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    now = datetime.now().isoformat()
    rid = res_data.get("id") or f"res_{int(datetime.now().timestamp() * 1000)}"
    title = (res_data.get("title") or "Liên kết không tên").strip()
    url = (res_data.get("url") or "").strip()
    description = (res_data.get("description") or "").strip()
    category_id = res_data.get("category_id") or "default"
    res_type = res_data.get("type") or "website"
    raw_tags = res_data.get("tags", [])
    if isinstance(raw_tags, list):
        tags_json = json.dumps(raw_tags)
    elif isinstance(raw_tags, str):
        tags_json = raw_tags
    else:
        tags_json = "[]"
    icon = res_data.get("icon") or ""
    favicon_url = res_data.get("favicon_url") or ""
    image_url = (res_data.get("image_url") or "").strip()
    is_favorite = 1 if res_data.get("is_favorite") else 0
    pinned = 1 if res_data.get("pinned") else 0

    conn.execute("""
        INSERT INTO resources (
            id, title, url, description, category_id, type, tags, icon,
            favicon_url, image_url, is_favorite, pinned, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            url = excluded.url,
            description = excluded.description,
            category_id = excluded.category_id,
            type = excluded.type,
            tags = excluded.tags,
            icon = excluded.icon,
            favicon_url = excluded.favicon_url,
            image_url = excluded.image_url,
            is_favorite = excluded.is_favorite,
            pinned = excluded.pinned,
            updated_at = excluded.updated_at
    """, (rid, title, url, description, category_id, res_type, tags_json, icon, favicon_url, image_url, is_favorite, pinned, now, now))
    conn.commit()
    conn.close()

    res_data["id"] = rid
    res_data["image_url"] = image_url
    res_data["updated_at"] = now
    return res_data

def delete_resource(res_id: str) -> bool:
    conn = get_connection()
    conn.execute("DELETE FROM resources WHERE id = ?", (res_id,))
    conn.commit()
    conn.close()
    return True

def toggle_favorite_resource(res_id: str) -> Dict[str, Any]:
    conn = get_connection()
    row = conn.execute("SELECT is_favorite FROM resources WHERE id = ?", (res_id,)).fetchone()
    if not row:
        conn.close()
        raise ValueError("Resource not found")
    new_fav = 0 if row["is_favorite"] == 1 else 1
    conn.execute("UPDATE resources SET is_favorite = ?, updated_at = ? WHERE id = ?", (new_fav, datetime.now().isoformat(), res_id))
    conn.commit()
    conn.close()
    return {"id": res_id, "is_favorite": new_fav}

def batch_move_resources(res_ids: List[str], target_category_id: str) -> int:
    if not res_ids:
        return 0
    conn = get_connection()
    now = datetime.now().isoformat()
    placeholders = ",".join(["?"] * len(res_ids))
    params = [target_category_id, now] + res_ids
    cursor = conn.execute(f"UPDATE resources SET category_id = ?, updated_at = ? WHERE id IN ({placeholders})", tuple(params))
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count

def batch_delete_resources(res_ids: List[str]) -> int:
    if not res_ids:
        return 0
    conn = get_connection()
    placeholders = ",".join(["?"] * len(res_ids))
    cursor = conn.execute(f"DELETE FROM resources WHERE id IN ({placeholders})", tuple(res_ids))
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count

def batch_toggle_favorite_resources(res_ids: List[str], is_favorite: int) -> int:
    if not res_ids:
        return 0
    conn = get_connection()
    now = datetime.now().isoformat()
    placeholders = ",".join(["?"] * len(res_ids))
    params = [1 if is_favorite else 0, now] + res_ids
    cursor = conn.execute(f"UPDATE resources SET is_favorite = ?, updated_at = ? WHERE id IN ({placeholders})", tuple(params))
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count

def batch_toggle_pin_resources(res_ids: List[str], pinned: int) -> int:
    if not res_ids:
        return 0
    conn = get_connection()
    now = datetime.now().isoformat()
    placeholders = ",".join(["?"] * len(res_ids))
    params = [1 if pinned else 0, now] + res_ids
    cursor = conn.execute(f"UPDATE resources SET pinned = ?, updated_at = ? WHERE id IN ({placeholders})", tuple(params))
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count

def batch_save_resources(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not items:
        return []
    import time
    import uuid
    conn = get_connection()
    now = datetime.now().isoformat()
    saved = []
    
    with conn:
        for idx, res_data in enumerate(items):
            rid = res_data.get("id") or f"res_{int(time.time() * 1000)}_{idx}_{uuid.uuid4().hex[:6]}"
            title = (res_data.get("title") or "Liên kết không tên").strip()
            url = (res_data.get("url") or "").strip()
            description = (res_data.get("description") or "").strip()
            category_id = res_data.get("category_id") or "default"
            res_type = res_data.get("type") or "website"
            raw_tags = res_data.get("tags", [])
            if isinstance(raw_tags, list):
                tags_json = json.dumps(raw_tags)
            elif isinstance(raw_tags, str):
                tags_json = raw_tags
            else:
                tags_json = "[]"
            icon = res_data.get("icon") or ""
            favicon_url = res_data.get("favicon_url") or ""
            image_url = (res_data.get("image_url") or "").strip()
            is_favorite = 1 if res_data.get("is_favorite") else 0
            pinned = 1 if res_data.get("pinned") else 0

            conn.execute("""
                INSERT INTO resources (
                    id, title, url, description, category_id, type, tags, icon,
                    favicon_url, image_url, is_favorite, pinned, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    url = excluded.url,
                    description = excluded.description,
                    category_id = excluded.category_id,
                    type = excluded.type,
                    tags = excluded.tags,
                    icon = excluded.icon,
                    favicon_url = excluded.favicon_url,
                    image_url = excluded.image_url,
                    is_favorite = excluded.is_favorite,
                    pinned = excluded.pinned,
                    updated_at = excluded.updated_at
            """, (rid, title, url, description, category_id, res_type, tags_json, icon, favicon_url, image_url, is_favorite, pinned, now, now))

            res_copy = dict(res_data)
            res_copy["id"] = rid
            res_copy["image_url"] = image_url
            res_copy["updated_at"] = now
            saved.append(res_copy)

    conn.close()
    return saved




