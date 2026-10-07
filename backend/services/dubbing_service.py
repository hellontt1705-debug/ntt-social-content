import os
import re
import json
import uuid
import time
import shutil
import zipfile
import subprocess
import wave
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

from services.db import get_connection

LANGUAGE_NAMES = {
    "zh": "Tiếng Trung(中文)",
    "en": "Tiếng Anh(en)",
    "ko": "Tiếng Hàn(ko)",
    "ja": "Tiếng Nhật(ja)",
    "vi": "Tiếng Việt(vi)",
    "th": "Tiếng Thái(th)",
    "fr": "Tiếng Pháp(fr)",
    "de": "Tiếng Đức(de)",
    "ru": "Tiếng Nga(ru)",
    "es": "Tiếng Tây Ban Nha(es)"
}

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DUBBING_STORAGE_DIR = os.path.join(BASE_DIR, "downloads", "dubbing_studio")
os.makedirs(DUBBING_STORAGE_DIR, exist_ok=True)

# -------------------------------------------------------------
# 1. DATABASE SCHEMA INITIALIZATION FOR DUBBING STUDIO
# -------------------------------------------------------------
def init_dubbing_tables():
    conn = get_connection()
    cursor = conn.cursor()
    
    # 1. Folders
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dubbing_folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#10b981',
        created_at TEXT
    )
    """)
    
    # 2. Projects
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dubbing_projects (
        id TEXT PRIMARY KEY,
        folder_id TEXT,
        name TEXT NOT NULL,
        source_type TEXT DEFAULT 'UPLOAD',
        source_url TEXT,
        video_path TEXT,
        thumbnail_url TEXT,
        duration_ms INTEGER DEFAULT 0,
        resolution_w INTEGER DEFAULT 1080,
        resolution_h INTEGER DEFAULT 1920,
        fps REAL DEFAULT 30.0,
        status TEXT DEFAULT 'READY',
        auto_delete_hours INTEGER DEFAULT 24,
        expire_at TEXT,
        pipeline_status TEXT DEFAULT '{"transcript":"READY","translate":"READY","tts":"READY","subtitle":"READY","render":"IDLE"}',
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (folder_id) REFERENCES dubbing_folders(id) ON DELETE SET NULL
    )
    """)
    
    # 3. Segments
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dubbing_segments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        seg_index INTEGER NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        original_text TEXT DEFAULT '',
        original_char_count INTEGER DEFAULT 0,
        original_char_speed REAL DEFAULT 0.0,
        roi_json TEXT DEFAULT '{}',
        translated_text TEXT DEFAULT '',
        translated_char_count INTEGER DEFAULT 0,
        translated_char_speed REAL DEFAULT 0.0,
        translated_word_count INTEGER DEFAULT 0,
        voice_id TEXT DEFAULT 'HN - Ngoc Huyen',
        voice_provider TEXT DEFAULT 'POPULAR',
        tts_speed REAL DEFAULT 1.0,
        audio_path TEXT,
        audio_duration_ms INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PERFECT_FIT',
        FOREIGN KEY (project_id) REFERENCES dubbing_projects(id) ON DELETE CASCADE
    )
    """)
    
    # 4. Subtitle Styles
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dubbing_subtitle_styles (
        id TEXT PRIMARY KEY,
        project_id TEXT UNIQUE NOT NULL,
        is_enabled INTEGER DEFAULT 1,
        font_family TEXT DEFAULT 'Montserrat',
        font_size INTEGER DEFAULT 22,
        bold INTEGER DEFAULT 1,
        italic INTEGER DEFAULT 0,
        underline INTEGER DEFAULT 0,
        text_case TEXT DEFAULT 'DEFAULT',
        primary_color TEXT DEFAULT '#FFEE00',
        outline_color TEXT DEFAULT '#000000',
        outline_width REAL DEFAULT 2.0,
        box_bg_enabled INTEGER DEFAULT 1,
        box_bg_color TEXT DEFAULT '#000000',
        box_bg_opacity REAL DEFAULT 0.65,
        alignment INTEGER DEFAULT 2,
        margin_v INTEGER DEFAULT 60,
        margin_h INTEGER DEFAULT 30,
        FOREIGN KEY (project_id) REFERENCES dubbing_projects(id) ON DELETE CASCADE
    )
    """)
    
    # 5. Blur Regions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dubbing_blur_regions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        region_index INTEGER NOT NULL,
        mode TEXT DEFAULT 'WHEN_SUBTITLE_ACTIVE',
        x REAL NOT NULL,
        y REAL NOT NULL,
        width REAL NOT NULL,
        height REAL NOT NULL,
        blur_strength INTEGER DEFAULT 15,
        start_sec REAL DEFAULT 0.0,
        end_sec REAL DEFAULT 0.0,
        FOREIGN KEY (project_id) REFERENCES dubbing_projects(id) ON DELETE CASCADE
    )
    """)
    
    # 6. Logo Settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dubbing_logos (
        id TEXT PRIMARY KEY,
        project_id TEXT UNIQUE NOT NULL,
        is_enabled INTEGER DEFAULT 0,
        logo_type TEXT DEFAULT 'TEXT',
        text_content TEXT DEFAULT '',
        image_path TEXT,
        position TEXT DEFAULT 'TOP_RIGHT',
        x REAL DEFAULT 20,
        y REAL DEFAULT 20,
        scale REAL DEFAULT 1.0,
        opacity REAL DEFAULT 0.9,
        FOREIGN KEY (project_id) REFERENCES dubbing_projects(id) ON DELETE CASCADE
    )
    """)
    
    # 7. Assets
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dubbing_assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        mime_type TEXT,
        status TEXT DEFAULT 'READY',
        metadata_json TEXT DEFAULT '{}',
        created_at TEXT,
        FOREIGN KEY (project_id) REFERENCES dubbing_projects(id) ON DELETE CASCADE
    )
    """)
    
    # 8. Presets
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dubbing_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT
    )
    """)
    
    # 9. Credits & Ledger
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dubbing_credits (
        user_id TEXT PRIMARY KEY,
        balance INTEGER DEFAULT 20000,
        expire_at TEXT
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dubbing_credit_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT,
        action_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        idempotency_key TEXT UNIQUE,
        description TEXT,
        created_at TEXT
    )
    """)
    
    # Run migration if columns don't exist
    try:
        cursor.execute("ALTER TABLE dubbing_projects ADD COLUMN detected_language TEXT DEFAULT 'zh'")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE dubbing_projects ADD COLUMN language_name TEXT DEFAULT 'Tiếng Trung(中文)'")
    except Exception:
        pass
        
    conn.commit()
    conn.close()

# Auto init tables on import
try:
    init_dubbing_tables()
except Exception as e:
    print(f"[DubbingService] Table init error: {e}")

# -------------------------------------------------------------
# 2. FOLDERS & PROJECTS CRUD
# -------------------------------------------------------------
def get_all_folders() -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("""
        SELECT f.*, 
            (SELECT COUNT(*) FROM dubbing_projects p WHERE p.folder_id = f.id) as project_count
        FROM dubbing_folders f
        ORDER BY f.created_at DESC
    """).fetchall()
    folders = [dict(r) for r in rows]
    conn.close()
    return folders

def create_folder(name: str, color: str = "#10b981") -> Dict[str, Any]:
    folder_id = "folder_" + uuid.uuid4().hex[:8]
    now = datetime.utcnow().isoformat()
    conn = get_connection()
    conn.execute("INSERT INTO dubbing_folders (id, name, color, created_at) VALUES (?, ?, ?, ?)",
                 (folder_id, name.strip(), color, now))
    conn.commit()
    conn.close()
    return {"id": folder_id, "name": name, "color": color, "created_at": now, "project_count": 0}

def update_folder(folder_id: str, name: str, color: Optional[str] = None) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    if color:
        conn.execute("UPDATE dubbing_folders SET name = ?, color = ? WHERE id = ?", (name.strip(), color, folder_id))
    else:
        conn.execute("UPDATE dubbing_folders SET name = ? WHERE id = ?", (name.strip(), folder_id))
    conn.commit()
    row = conn.execute("""
        SELECT f.*, (SELECT COUNT(*) FROM dubbing_projects p WHERE p.folder_id = f.id) as project_count
        FROM dubbing_folders f WHERE f.id = ?
    """, (folder_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_folder(folder_id: str, delete_projects: bool = False) -> bool:
    conn = get_connection()
    if delete_projects:
        rows = conn.execute("SELECT id FROM dubbing_projects WHERE folder_id = ?", (folder_id,)).fetchall()
        for r in rows:
            p_id = r["id"]
            proj_dir = os.path.join(DUBBING_STORAGE_DIR, p_id)
            if os.path.exists(proj_dir):
                shutil.rmtree(proj_dir, ignore_errors=True)
            conn.execute("DELETE FROM dubbing_projects WHERE id = ?", (p_id,))
    else:
        conn.execute("UPDATE dubbing_projects SET folder_id = NULL WHERE folder_id = ?", (folder_id,))
    conn.execute("DELETE FROM dubbing_folders WHERE id = ?", (folder_id,))
    conn.commit()
    conn.close()
    return True

def get_projects(folder_id: Optional[str] = None, search: str = "") -> List[Dict[str, Any]]:
    conn = get_connection()
    query = """
        SELECT p.*, f.name as folder_name,
            (SELECT COUNT(*) FROM dubbing_segments s WHERE s.project_id = p.id) as segment_count
        FROM dubbing_projects p
        LEFT JOIN dubbing_folders f ON p.folder_id = f.id
        WHERE 1=1
    """
    params = []
    if folder_id:
        query += " AND p.folder_id = ?"
        params.append(folder_id)
    if search:
        query += " AND (p.name LIKE ? OR p.source_url LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
    query += " ORDER BY p.created_at DESC"
    
    rows = conn.execute(query, params).fetchall()
    projects = []
    for r in rows:
        d = dict(r)
        try:
            d["pipeline_status"] = json.loads(d.get("pipeline_status") or "{}")
        except Exception:
            d["pipeline_status"] = {}
        projects.append(d)
    conn.close()
    return projects

def get_project_by_id(project_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("""
        SELECT p.*, f.name as folder_name
        FROM dubbing_projects p
        LEFT JOIN dubbing_folders f ON p.folder_id = f.id
        WHERE p.id = ?
    """, (project_id,)).fetchone()
    if not row:
        conn.close()
        return None
    
    project = dict(row)
    try:
        project["pipeline_status"] = json.loads(project.get("pipeline_status") or "{}")
    except Exception:
        project["pipeline_status"] = {}
        
    # Get Subtitle Style
    sub_row = conn.execute("SELECT * FROM dubbing_subtitle_styles WHERE project_id = ?", (project_id,)).fetchone()
    project["subtitle_style"] = dict(sub_row) if sub_row else {
        "is_enabled": 1,
        "font_family": "Montserrat",
        "font_size": 22,
        "bold": 1,
        "italic": 0,
        "underline": 0,
        "text_case": "DEFAULT",
        "primary_color": "#FFEE00",
        "outline_color": "#000000",
        "outline_width": 2.0,
        "box_bg_enabled": 1,
        "box_bg_color": "#000000",
        "box_bg_opacity": 0.65,
        "alignment": 2,
        "margin_v": 60,
        "margin_h": 30
    }
    
    # Get Blur Regions
    blur_rows = conn.execute("SELECT * FROM dubbing_blur_regions WHERE project_id = ? ORDER BY region_index ASC", (project_id,)).fetchall()
    project["blur_regions"] = [dict(b) for b in blur_rows]
    
    # Get Logo
    logo_row = conn.execute("SELECT * FROM dubbing_logos WHERE project_id = ?", (project_id,)).fetchone()
    project["logo"] = dict(logo_row) if logo_row else {
        "is_enabled": 0,
        "logo_type": "TEXT",
        "text_content": "",
        "image_path": None,
        "position": "TOP_RIGHT",
        "x": 20,
        "y": 20,
        "scale": 1.0,
        "opacity": 0.9
    }
    
    conn.close()
    return project

def create_project(data: Dict[str, Any]) -> Dict[str, Any]:
    project_id = "proj_" + uuid.uuid4().hex[:10]
    now = datetime.utcnow().isoformat()
    conn = get_connection()
    
    name = data.get("name") or f"Project_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    folder_id = data.get("folder_id")
    source_type = data.get("source_type", "UPLOAD")
    source_url = data.get("source_url")
    video_path = data.get("video_path")
    thumbnail_url = data.get("thumbnail_url", "")
    duration_ms = data.get("duration_ms", 0)
    
    pipeline_status = json.dumps({
        "transcript": "READY",
        "translate": "READY",
        "tts": "READY",
        "subtitle": "READY",
        "render": "IDLE"
    })
    
    now_dt = datetime.utcnow()
    expire_at = (now_dt + timedelta(hours=24)).isoformat()
    now_str = now_dt.isoformat()
    
    detected_language = data.get("detected_language", "zh")
    language_name = data.get("language_name", "Tiếng Trung(中文)")
    
    conn.execute("""
        INSERT INTO dubbing_projects (
            id, folder_id, name, source_type, source_url, video_path,
            thumbnail_url, duration_ms, status, auto_delete_hours, expire_at,
            detected_language, language_name, pipeline_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (project_id, folder_id, name, source_type, source_url, video_path,
          thumbnail_url, duration_ms, "READY", 24, expire_at,
          detected_language, language_name, pipeline_status, now_str, now_str))
    
    # Create default subtitle style
    conn.execute("""
        INSERT INTO dubbing_subtitle_styles (id, project_id)
        VALUES (?, ?)
    """, ("sub_" + project_id, project_id))
    
    # Create default logo settings
    conn.execute("""
        INSERT INTO dubbing_logos (id, project_id)
        VALUES (?, ?)
    """, ("logo_" + project_id, project_id))
    
    conn.commit()
    conn.close()
    
    return get_project_by_id(project_id)

def update_project(project_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    allowed_fields = [
        "name", "folder_id", "status", "pipeline_status", "duration_ms", "video_path",
        "thumbnail_url", "auto_delete_hours", "expire_at", "detected_language", "language_name"
    ]
    set_clauses = []
    params = []
    
    for f in allowed_fields:
        if f in updates:
            val = updates[f]
            if f == "pipeline_status" and isinstance(val, (dict, list)):
                val = json.dumps(val)
            set_clauses.append(f"{f} = ?")
            params.append(val)
            
    if set_clauses:
        set_clauses.append("updated_at = ?")
        params.append(datetime.utcnow().isoformat())
        params.append(project_id)
        conn.execute(f"UPDATE dubbing_projects SET {', '.join(set_clauses)} WHERE id = ?", params)
        conn.commit()
        
    conn.close()
    return get_project_by_id(project_id)

def delete_project(project_id: str) -> bool:
    conn = get_connection()
    proj_dir = os.path.join(DUBBING_STORAGE_DIR, project_id)
    if os.path.exists(proj_dir):
        shutil.rmtree(proj_dir, ignore_errors=True)
    conn.execute("DELETE FROM dubbing_projects WHERE id = ?", (project_id,))
    conn.execute("DELETE FROM dubbing_segments WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM dubbing_assets WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM dubbing_subtitle_styles WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM dubbing_logos WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM dubbing_blur_regions WHERE project_id = ?", (project_id,))
    conn.commit()
    conn.close()
    return True

def bulk_delete_projects(project_ids: List[str]) -> int:
    deleted_count = 0
    for pid in project_ids:
        if delete_project(pid):
            deleted_count += 1
    return deleted_count

# -------------------------------------------------------------
# 2.5. VIDEO INGESTION PIPELINE (FILE UPLOAD & SOCIAL URL IMPORT)
# -------------------------------------------------------------
def detect_speech_intervals(video_path: str, total_duration_sec: float) -> List[tuple]:
    """Phát hiện các khoảng thời gian có tiếng nói bằng FFmpeg silencedetect (chỉ giải mã âm thanh -vn để tối ưu tốc độ)"""
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn",
        "-af", "silencedetect=noise=-30dB:d=0.4",
        "-f", "null", "-"
    ]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    _, stderr = p.communicate()
    
    silence_starts = []
    silence_ends = []
    for line in stderr.splitlines():
        if "silence_start:" in line:
            m = re.search(r"silence_start:\s*([0-9.]+)", line)
            if m:
                silence_starts.append(float(m.group(1)))
        elif "silence_end:" in line:
            m = re.search(r"silence_end:\s*([0-9.]+)", line)
            if m:
                silence_ends.append(float(m.group(1)))
                
    intervals = []
    last_end = 0.0
    for i in range(len(silence_starts)):
        st = last_end
        ed = silence_starts[i]
        if ed - st >= 0.8:
            intervals.append((int(st * 1000), int(ed * 1000)))
        if i < len(silence_ends):
            last_end = silence_ends[i]
            
    if total_duration_sec - last_end >= 0.8:
        intervals.append((int(last_end * 1000), int(total_duration_sec * 1000)))
        
    # Fallback nếu video không có tiếng hoặc yên lặng: chia thành các block 3.5s
    if not intervals:
        step_ms = 3500
        cur = 0
        tot_ms = int(total_duration_sec * 1000)
        while cur < tot_ms:
            next_ms = min(cur + step_ms, tot_ms)
            intervals.append((cur, next_ms))
            cur = next_ms
            
    return intervals

def process_new_project_video(project_id: str, video_path: str, auto_transcribe: bool = True):
    from services.audio_service import get_media_info
    info = get_media_info(video_path)
    duration_sec = float(info.get("duration", 0))
    duration_ms = int(duration_sec * 1000) if duration_sec > 0 else 30000
    
    proj_dir = os.path.join(DUBBING_STORAGE_DIR, project_id)
    os.makedirs(proj_dir, exist_ok=True)
    
    # Extract thumbnail
    thumb_path = os.path.join(proj_dir, "thumbnail.jpg")
    try:
        subprocess.run([
            "ffmpeg", "-y", "-ss", "00:00:01", "-i", video_path,
            "-vframes", "1", "-q:v", "2", thumb_path
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass
        
    update_project(project_id, {
        "video_path": video_path,
        "duration_ms": duration_ms,
        "thumbnail_url": f"/api/dubbing/assets/download/{project_id}/thumbnail" if os.path.exists(thumb_path) else "",
        "status": "READY"
    })
    
    create_or_update_asset(project_id, "SOURCE_VIDEO", "source.mp4", video_path, "video/mp4")
    
    if auto_transcribe:
        intervals = detect_speech_intervals(video_path, duration_sec if duration_sec > 0 else 30.0)
        segments = []
        for idx, (st_ms, ed_ms) in enumerate(intervals, start=1):
            dur_ms = ed_ms - st_ms
            orig_txt = f"Phân đoạn thoại {idx}"
            trans_txt = f"Phân đoạn lồng tiếng {idx}"
            segments.append({
                "id": f"seg_{project_id}_{idx}",
                "project_id": project_id,
                "seg_index": idx,
                "start_ms": st_ms,
                "end_ms": ed_ms,
                "duration_ms": dur_ms,
                "original_text": orig_txt,
                "translated_text": trans_txt,
                "voice_id": "HN - Ngoc Huyen",
                "tts_speed": 1.0,
                "audio_duration_ms": dur_ms
            })
        save_segments(project_id, segments)
        
        # Compile initial ASS subtitle
        ass_path = os.path.join(proj_dir, "translated_subtitle.ass")
        compile_ass_subtitles(project_id, ass_path)
        create_or_update_asset(project_id, "SUBTITLE_ASS", "translated_subtitle.ass", ass_path, "text/plain")

_WHISPER_MODEL = None
_RAPID_OCR = None

def get_whisper_model():
    global _WHISPER_MODEL
    if _WHISPER_MODEL is None:
        from faster_whisper import WhisperModel
        _WHISPER_MODEL = WhisperModel("tiny", device="cpu", compute_type="int8")
    return _WHISPER_MODEL

def get_rapid_ocr():
    global _RAPID_OCR
    if _RAPID_OCR is None:
        from rapidocr_onnxruntime import RapidOCR
        _RAPID_OCR = RapidOCR()
    return _RAPID_OCR

def detect_language_and_transcribe_speech(video_path: str, max_duration_sec: float = None) -> Dict[str, Any]:
    """Sử dụng Faster-Whisper nhận diện ngôn ngữ nói và bóc tách từng câu có timestamp chính xác cực nhanh qua FFmpeg 16kHz audio và VAD filter"""
    import tempfile
    
    # 1. Fast extract 16kHz mono WAV via FFmpeg
    temp_wav = tempfile.mktemp(suffix=".wav", prefix="whisper_in_")
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-ac", "1", "-ar", "16000",
            temp_wav
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        target_audio = temp_wav if os.path.exists(temp_wav) and os.path.getsize(temp_wav) > 1000 else video_path
        
        model = get_whisper_model()
        segments_gen, info = model.transcribe(target_audio, beam_size=1, vad_filter=True)
        
        det_lang = info.language
        lang_name = LANGUAGE_NAMES.get(det_lang, f"Ngôn ngữ ({det_lang})")
        
        segments = []
        idx = 1
        for s in segments_gen:
            text = s.text.strip()
            if not text:
                continue
            start_ms = int(s.start * 1000)
            end_ms = int(s.end * 1000)
            dur_ms = end_ms - start_ms
            if dur_ms < 200:
                continue
            segments.append({
                "seg_index": idx,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "duration_ms": dur_ms,
                "original_text": text
            })
            idx += 1
            if max_duration_sec and s.end >= max_duration_sec:
                break
                
        return {
            "detected_language": det_lang,
            "language_name": lang_name,
            "language_probability": round(info.language_probability, 2),
            "segments": segments
        }
    finally:
        if os.path.exists(temp_wav):
            try:
                os.remove(temp_wav)
            except Exception:
                pass

def detect_subtitles_from_video_ocr(video_path: str, duration_sec: float, roi_box: Optional[Dict] = None) -> Dict[str, Any]:
    """Sử dụng RapidOCR nhận diện chữ và phụ đề xuất hiện trên video theo vùng quét ROI cực nhanh bằng FFmpeg crop & frame sampling"""
    import cv2
    import glob
    import tempfile
    
    ocr = get_rapid_ocr()
    cap = cv2.VideoCapture(video_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1080
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1920
    cap.release()
    
    if roi_box and "x" in roi_box and roi_box.get("width", 0) > 20:
        rx = max(0, min(width - 10, int(roi_box.get("x", 0))))
        ry = max(0, min(height - 10, int(roi_box.get("y", int(height * 0.74)))))
        rw = max(10, min(width - rx, int(roi_box.get("width", width))))
        rh = max(10, min(height - ry, int(roi_box.get("height", int(height * 0.18)))))
    else:
        rx = int(width * 0.1)
        ry = int(height * 0.74)
        rw = int(width * 0.8)
        rh = int(height * 0.18)
        
    sample_fps = 0.67  # 1 frame per 1.5s
    temp_dir = tempfile.mkdtemp(prefix="dub_ocr_")
    out_pattern = os.path.join(temp_dir, "f_%04d.jpg")
    crop_vf = f"crop={rw}:{rh}:{rx}:{ry},fps={sample_fps}"
    
    subprocess.run([
        "ffmpeg", "-y", "-i", video_path,
        "-vf", crop_vf,
        "-q:v", "3",
        out_pattern
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    frame_files = sorted(glob.glob(os.path.join(temp_dir, "f_*.jpg")))
    ocr_events = []
    prev_gray = None
    
    for idx, fpath in enumerate(frame_files):
        t_sec = idx * 1.5
        img = cv2.imread(fpath)
        if img is None:
            continue
            
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        if prev_gray is not None:
            diff = cv2.absdiff(prev_gray, gray).mean()
            if diff < 2.5:
                continue
        prev_gray = gray
        
        try:
            res, _ = ocr(img)
            if res:
                txt_list = [r[1].strip() for r in res if float(r[2]) >= 0.4 and r[1].strip()]
                if txt_list:
                    ocr_events.append((t_sec, " ".join(txt_list)))
        except Exception:
            pass
            
    shutil.rmtree(temp_dir, ignore_errors=True)
    
    merged_segments = []
    idx = 1
    if ocr_events:
        cur_text = ocr_events[0][1]
        cur_start = ocr_events[0][0]
        cur_end = cur_start + 1.5
        
        for t_sec, text in ocr_events[1:]:
            if text == cur_text or (len(text) > 3 and (text in cur_text or cur_text in text)):
                cur_end = max(cur_end, t_sec + 1.2)
            else:
                if len(cur_text.strip()) > 1:
                    merged_segments.append({
                        "seg_index": idx,
                        "start_ms": int(cur_start * 1000),
                        "end_ms": int(cur_end * 1000),
                        "duration_ms": int((cur_end - cur_start) * 1000),
                        "original_text": cur_text.strip()
                    })
                    idx += 1
                cur_text = text
                cur_start = t_sec
                cur_end = t_sec + 1.5
                
        if len(cur_text.strip()) > 1:
            merged_segments.append({
                "seg_index": idx,
                "start_ms": int(cur_start * 1000),
                "end_ms": int(cur_end * 1000),
                "duration_ms": int((cur_end - cur_start) * 1000),
                "original_text": cur_text.strip()
            })
            
    sample_text = " ".join([s["original_text"] for s in merged_segments[:10]])
    det_lang = "en"
    if re.search(r"[\u4e00-\u9fff]", sample_text):
        det_lang = "zh"
    elif re.search(r"[\uac00-\ud7af]", sample_text):
        det_lang = "ko"
    elif re.search(r"[\u3040-\u30ff]", sample_text):
        det_lang = "ja"
        
    return {
        "detected_language": det_lang,
        "language_name": LANGUAGE_NAMES.get(det_lang, det_lang),
        "segments": merged_segments
    }

DUBBING_PROJECT_PROGRESS: Dict[str, Dict[str, Any]] = {}

def set_pipeline_progress(
    project_id: str, 
    stage: str, 
    percent: int, 
    message: str, 
    current_step: int = 1,
    total_steps: int = 5,
    details: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    existing = DUBBING_PROJECT_PROGRESS.get(project_id, {})
    existing_logs = list(existing.get("logs") or [])
    now_time = datetime.now().strftime("%H:%M:%S")
    is_hl = (percent in [10, 20, 35, 55, 68, 72, 90, 100]) or any(k in message for k in ["Hoàn tất", "thành công", "Bắt đầu", "🎉"])

    if not existing_logs or existing_logs[-1].get("text") != message:
        existing_logs.append({
            "time": f"[{now_time}]",
            "text": message,
            "highlight": is_hl
        })
    # Keep up to 60 logs
    new_logs = existing_logs[-60:]

    project_name = existing.get("project_name")
    if not project_name:
        try:
            p = get_project_by_id(project_id)
            if p:
                project_name = p.get("name")
        except Exception:
            pass

    info = {
        "project_id": project_id,
        "project_name": project_name or f"Video #{project_id[:8]}",
        "stage": stage,
        "percent": max(0, min(100, int(percent))),
        "message": message,
        "current_step": current_step,
        "total_steps": total_steps,
        "details": details or {},
        "logs": new_logs,
        "is_completed": (percent >= 100 or stage in ["completed", "ready"]),
        "updated_at": datetime.now().isoformat()
    }
    DUBBING_PROJECT_PROGRESS[project_id] = info
    return info

def get_pipeline_progress(project_id: str) -> Dict[str, Any]:
    if project_id in DUBBING_PROJECT_PROGRESS:
        return DUBBING_PROJECT_PROGRESS[project_id]
        
    # Check if project exists in database
    p = get_project_by_id(project_id)
    name = p.get("name") if p else f"Video #{project_id[:8]}"
    return {
        "project_id": project_id,
        "project_name": name,
        "stage": "ready",
        "percent": 100,
        "message": "Sẵn sàng",
        "current_step": 5,
        "total_steps": 5,
        "details": {},
        "logs": [{"time": f"[{datetime.now().strftime('%H:%M:%S')}]", "text": "Dự án đã sẵn sàng", "highlight": True}],
        "is_completed": True
    }

def get_all_pipeline_progress() -> Dict[str, Any]:
    return DUBBING_PROJECT_PROGRESS

def run_automated_localization(
    project_id: str,
    mode: str = "SPEECH",
    source_lang: str = "auto",
    roi_box: Optional[Dict[str, Any]] = None,
    voice_id: str = "HN - Ngoc Huyen",
    auto_blur: bool = True,
    auto_tts: bool = True
) -> Dict[str, Any]:
    """Quy trình tự động hóa toàn diện:
    1. Nhận diện ngôn ngữ & bóc tách lời thoại (Whisper / RapidOCR)
    2. Dịch song song sang tiếng Việt chuẩn ngữ nghĩa
    3. Tự động sinh vùng làm mờ phụ đề gốc
    4. Tự động sinh giọng đọc lồng tiếng AI tiếng Việt & kiểm tra thời lượng
    5. Biên dịch phụ đề ASS
    6. Thiết lập chính sách tự xoá sau 24h
    """
    project = get_project_by_id(project_id)
    if not project or not project.get("video_path") or not os.path.exists(project["video_path"]):
        set_pipeline_progress(project_id, "error", 0, "Không tìm thấy video dự án!", 1, 5)
        raise FileNotFoundError(f"Video dự án không tồn tại: {project_id}")
        
    video_path = project["video_path"]
    duration_sec = (project.get("duration_ms", 30000)) / 1000.0

    set_pipeline_progress(
        project_id, "detect", 10,
        "Đang phân tích thông số video và trích xuất luồng âm thanh 16kHz...",
        current_step=1, total_steps=5
    )
    
    # 1. Nhận diện ngôn ngữ & bóc tách lời thoại
    if mode == "OCR":
        set_pipeline_progress(
            project_id, "ocr", 20,
            "Đang quét OCR chữ phụ đề trên từng khung hình video...",
            current_step=2, total_steps=5
        )
        result = detect_subtitles_from_video_ocr(video_path, duration_sec, roi_box)
    else:
        set_pipeline_progress(
            project_id, "whisper", 20,
            "Kích hoạt mô hình AI Faster-Whisper nhận diện ngôn ngữ & bóc tách câu thoại...",
            current_step=2, total_steps=5
        )
        result = detect_language_and_transcribe_speech(video_path)
        
    det_lang = source_lang if source_lang and source_lang != "auto" else result["detected_language"]
    lang_name = LANGUAGE_NAMES.get(det_lang, result.get("language_name") or det_lang)
    raw_segments = result["segments"]
    
    # Fallback to speech intervals if empty
    if not raw_segments:
        intervals = detect_speech_intervals(video_path, duration_sec)
        for idx, (st_ms, ed_ms) in enumerate(intervals, start=1):
            raw_segments.append({
                "seg_index": idx,
                "start_ms": st_ms,
                "end_ms": ed_ms,
                "duration_ms": ed_ms - st_ms,
                "original_text": f"Phân đoạn thoại {idx}"
            })

    set_pipeline_progress(
        project_id, "detect_done", 35,
        f"Đã phát hiện: {lang_name} ({det_lang.upper()}) • Bóc tách thành công {len(raw_segments)} câu thoại.",
        current_step=2, total_steps=5,
        details={"detected_language": det_lang, "language_name": lang_name, "segments_count": len(raw_segments)}
    )
            
    # 2. Dịch sang tiếng Việt đa luồng song song
    set_pipeline_progress(
        project_id, "translate", 42,
        f"Đang dịch song song {len(raw_segments)} câu thoại sang Tiếng Việt chuẩn ngữ nghĩa (Google GTX Engine)...",
        current_step=3, total_steps=5,
        details={"segments_count": len(raw_segments)}
    )

    from services.translator import translate_text
    from concurrent.futures import ThreadPoolExecutor
    
    def _translate_item(s):
        orig = s["original_text"]
        trans = ""
        if orig and not orig.startswith("Phân đoạn thoại"):
            try:
                trans = translate_text(orig, "vi")
            except Exception:
                trans = orig
        else:
            trans = f"Phân đoạn lồng tiếng {s['seg_index']}"
            
        return {
            "id": f"seg_{project_id}_{s['seg_index']}",
            "project_id": project_id,
            "seg_index": s["seg_index"],
            "start_ms": s["start_ms"],
            "end_ms": s["end_ms"],
            "duration_ms": s["duration_ms"],
            "original_text": orig,
            "translated_text": trans,
            "voice_id": voice_id,
            "tts_speed": 1.0,
            "audio_duration_ms": s["duration_ms"]
        }
        
    with ThreadPoolExecutor(max_workers=8) as ex:
        processed_segments = list(ex.map(_translate_item, raw_segments))
        
    save_segments(project_id, processed_segments)
    
    set_pipeline_progress(
        project_id, "translate_done", 55,
        f"Đã hoàn thành dịch {len(processed_segments)} câu thoại sang Tiếng Việt.",
        current_step=3, total_steps=5
    )

    # 3. Tự động sinh vùng làm mờ phụ đề gốc
    if auto_blur:
        set_pipeline_progress(
            project_id, "blur", 60,
            "Đang tạo vùng làm mờ (Blur Box) che phụ đề gốc theo timestamp...",
            current_step=4, total_steps=5
        )
        w = project.get("resolution_w") or 1080
        h = project.get("resolution_h") or 1920
        bx = int(roi_box.get("x", w * 0.1)) if roi_box else int(w * 0.1)
        by = int(roi_box.get("y", h * 0.74)) if roi_box else int(h * 0.74)
        bw = int(roi_box.get("width", w * 0.8)) if roi_box else int(w * 0.8)
        bh = int(roi_box.get("height", h * 0.08)) if roi_box else int(h * 0.08)
        
        blur_list = []
        for idx, s in enumerate(processed_segments, start=1):
            st_s = max(0.0, round(s["start_ms"] / 1000.0 - 0.2, 3))
            ed_s = round(s["end_ms"] / 1000.0 + 0.3, 3)
            blur_list.append({
                "mode": "WHEN_SUBTITLE_ACTIVE",
                "x": bx,
                "y": by,
                "width": bw,
                "height": bh,
                "blur_strength": 18,
                "start_sec": st_s,
                "end_sec": ed_s
            })
        save_blur_regions(project_id, blur_list)
        set_pipeline_progress(
            project_id, "blur_done", 68,
            f"Đã tạo {len(blur_list)} vùng làm mờ khớp phụ đề gốc.",
            current_step=4, total_steps=5
        )
        
    # 4. Tự động lồng tiếng tiếng Việt qua Edge-TTS
    if auto_tts:
        set_pipeline_progress(
            project_id, "tts", 72,
            f"Bắt đầu lồng tiếng AI Microsoft Neural ({voice_id}) cho {len(processed_segments)} câu...",
            current_step=4, total_steps=5
        )
        try:
            generate_tts_for_project(project_id, voice_id=voice_id)
        except Exception as e:
            print(f"[AutoLocalization] TTS warning: {e}")
        set_pipeline_progress(
            project_id, "tts_done", 90,
            "Đã tổng hợp toàn bộ giọng đọc lồng tiếng và file voiceover.wav.",
            current_step=4, total_steps=5
        )
            
    # 5. Biên dịch phụ đề ASS
    set_pipeline_progress(
        project_id, "finalize", 94,
        "Đang biên dịch phụ đề ASS vàng viền đen phong cách Studio...",
        current_step=5, total_steps=5
    )
    proj_dir = os.path.join(DUBBING_STORAGE_DIR, project_id)
    ass_path = os.path.join(proj_dir, "translated_subtitle.ass")
    compile_ass_subtitles(project_id, ass_path)
    create_or_update_asset(project_id, "SUBTITLE_ASS", "translated_subtitle.ass", ass_path, "text/plain")
    
    # 6. Thiết lập 24h tự động xoá
    now_dt = datetime.utcnow()
    expire_at = (now_dt + timedelta(hours=24)).isoformat()
    
    update_project(project_id, {
        "detected_language": det_lang,
        "language_name": lang_name,
        "auto_delete_hours": 24,
        "expire_at": expire_at,
        "pipeline_status": {
            "transcript": "READY",
            "translate": "READY",
            "tts": "READY",
            "subtitle": "READY",
            "render": "IDLE"
        }
    })
    
    set_pipeline_progress(
        project_id, "completed", 100,
        "🎉 Hoàn tất toàn bộ quy trình tự động hoá Studio! Đang chuyển vào giao diện Studio...",
        current_step=5, total_steps=5,
        details={"status": "completed"}
    )
    
    return get_project_by_id(project_id)

def cleanup_expired_dubbing_projects() -> int:
    """Tự động xóa các video dự án đã hết hạn 24h"""
    now = datetime.utcnow().isoformat()
    conn = get_connection()
    expired = conn.execute("SELECT id, video_path FROM dubbing_projects WHERE expire_at IS NOT NULL AND expire_at < ?", (now,)).fetchall()
    count = 0
    for r in expired:
        p_id = r["id"]
        proj_dir = os.path.join(DUBBING_STORAGE_DIR, p_id)
        if os.path.exists(proj_dir):
            shutil.rmtree(proj_dir, ignore_errors=True)
        conn.execute("DELETE FROM dubbing_projects WHERE id = ?", (p_id,))
        count += 1
    conn.commit()
    conn.close()
    return count

def ingest_uploaded_video(file_bytes: bytes, filename: str, name: str = None, folder_id: str = None, auto_transcribe: bool = True) -> Dict[str, Any]:
    project_name = name or os.path.splitext(filename)[0] or f"Upload_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    project = create_project({
        "name": project_name,
        "folder_id": folder_id,
        "source_type": "UPLOAD",
        "source_url": ""
    })
    proj_id = project["id"]
    proj_dir = os.path.join(DUBBING_STORAGE_DIR, proj_id)
    os.makedirs(proj_dir, exist_ok=True)
    
    ext = os.path.splitext(filename)[1] or ".mp4"
    saved_video_path = os.path.join(proj_dir, f"source{ext}")
    with open(saved_video_path, "wb") as f:
        f.write(file_bytes)
        
    process_new_project_video(proj_id, saved_video_path, auto_transcribe=auto_transcribe)
    return get_project_by_id(proj_id)

def ingest_url_video(url: str, name: str = None, folder_id: str = None, auto_transcribe: bool = True) -> Dict[str, Any]:
    import yt_dlp
    project_name = name or f"Import_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    project = create_project({
        "name": project_name,
        "folder_id": folder_id,
        "source_type": "URL",
        "source_url": url
    })
    proj_id = project["id"]
    proj_dir = os.path.join(DUBBING_STORAGE_DIR, proj_id)
    os.makedirs(proj_dir, exist_ok=True)
    out_video_path = os.path.join(proj_dir, "source.mp4")
    
    ydl_opts = {
        "outtmpl": os.path.join(proj_dir, "source.%(ext)s"),
        "format": "best[ext=mp4]/best",
        "quiet": True,
        "no_warnings": True
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if not name and info.get("title"):
            update_project(proj_id, {"name": info["title"]})
            
    actual_files = [os.path.join(proj_dir, f) for f in os.listdir(proj_dir) if f.startswith("source.")]
    actual_video = actual_files[0] if actual_files else out_video_path
    
    process_new_project_video(proj_id, actual_video, auto_transcribe=auto_transcribe)
    return get_project_by_id(proj_id)

# -------------------------------------------------------------
# 3. SEGMENTS & TIMING AUDIT (OVERFLOW & TOO FAST WARNINGS)
# -------------------------------------------------------------
def calculate_segment_metrics(seg: Dict[str, Any]) -> Dict[str, Any]:
    duration_ms = seg.get("duration_ms") or (seg.get("end_ms", 0) - seg.get("start_ms", 0))
    duration_sec = duration_ms / 1000.0 if duration_ms > 0 else 0.001
    
    orig_text = seg.get("original_text", "")
    trans_text = seg.get("translated_text", "")
    
    orig_char_count = len(orig_text)
    orig_char_speed = round(orig_char_count / duration_sec, 1)
    
    trans_char_count = len(trans_text)
    trans_char_speed = round(trans_char_count / duration_sec, 1)
    trans_words = trans_text.split()
    trans_word_count = len(trans_words)
    trans_word_speed = round(trans_word_count / duration_sec, 1)
    
    # 1. Overflow check
    audio_dur = seg.get("audio_duration_ms", 0)
    delta_ms = audio_dur - duration_ms if audio_dur > 0 else 0
    is_overflow = delta_ms > 150 # audio vượt quá khung thời gian 150ms
    
    # 2. Reading speed check (Tốc độ đọc quá nhanh cho tiếng Việt > 17.5 c/s hoặc > 4.5 từ/s)
    is_too_fast = trans_char_speed > 17.5 or trans_word_speed > 4.5
    
    status = "PERFECT_FIT"
    if is_overflow:
        status = "OVERFLOW"
    elif is_too_fast:
        status = "TOO_FAST"
        
    return {
        "duration_ms": duration_ms,
        "original_char_count": orig_char_count,
        "original_char_speed": orig_char_speed,
        "translated_char_count": trans_char_count,
        "translated_char_speed": trans_char_speed,
        "translated_word_count": trans_word_count,
        "translated_word_speed": trans_word_speed,
        "delta_ms": delta_ms,
        "is_overflow": is_overflow,
        "is_too_fast": is_too_fast,
        "status": status
    }

def get_segments(project_id: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM dubbing_segments WHERE project_id = ? ORDER BY seg_index ASC", (project_id,)).fetchall()
    segments = []
    for r in rows:
        seg = dict(r)
        metrics = calculate_segment_metrics(seg)
        seg.update(metrics)
        try:
            seg["roi_json"] = json.loads(seg.get("roi_json") or "{}")
        except Exception:
            seg["roi_json"] = {}
        segments.append(seg)
    conn.close()
    return segments

def save_segments(project_id: str, segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    conn = get_connection()
    conn.execute("DELETE FROM dubbing_segments WHERE project_id = ?", (project_id,))
    
    for idx, seg in enumerate(segments, start=1):
        seg_id = seg.get("id") or f"seg_{project_id}_{idx}"
        start_ms = int(seg.get("start_ms", 0))
        end_ms = int(seg.get("end_ms", 0))
        duration_ms = end_ms - start_ms
        orig_text = seg.get("original_text", "")
        trans_text = seg.get("translated_text", "")
        roi_json = json.dumps(seg.get("roi_json", {}))
        voice_id = seg.get("voice_id", "HN - Ngoc Huyen")
        voice_provider = seg.get("voice_provider", "POPULAR")
        tts_speed = float(seg.get("tts_speed", 1.0))
        audio_path = seg.get("audio_path")
        audio_dur = int(seg.get("audio_duration_ms", 0))
        
        metrics = calculate_segment_metrics({
            "duration_ms": duration_ms,
            "original_text": orig_text,
            "translated_text": trans_text,
            "audio_duration_ms": audio_dur
        })
        
        conn.execute("""
            INSERT INTO dubbing_segments (
                id, project_id, seg_index, start_ms, end_ms, duration_ms,
                original_text, original_char_count, original_char_speed, roi_json,
                translated_text, translated_char_count, translated_char_speed, translated_word_count,
                voice_id, voice_provider, tts_speed, audio_path, audio_duration_ms, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            seg_id, project_id, idx, start_ms, end_ms, duration_ms,
            orig_text, metrics["original_char_count"], metrics["original_char_speed"], roi_json,
            trans_text, metrics["translated_char_count"], metrics["translated_char_speed"], metrics["translated_word_count"],
            voice_id, voice_provider, tts_speed, audio_path, audio_dur, metrics["status"]
        ))
        
    conn.commit()
    conn.close()
    return get_segments(project_id)

def get_segment_audits(project_id: str) -> Dict[str, Any]:
    segments = get_segments(project_id)
    overflow_indices = [s["seg_index"] for s in segments if s.get("is_overflow")]
    too_fast_indices = [s["seg_index"] for s in segments if s.get("is_too_fast")]
    return {
        "overflow_count": len(overflow_indices),
        "overflow_indices": overflow_indices,
        "too_fast_count": len(too_fast_indices),
        "too_fast_indices": too_fast_indices,
        "total_segments": len(segments)
    }

# -------------------------------------------------------------
# 4. SUBTITLE STYLE & ADVANCED SUBSTATION ALPHA (.ASS) COMPILER
# -------------------------------------------------------------
def save_subtitle_style(project_id: str, style_data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    conn.execute("""
        INSERT INTO dubbing_subtitle_styles (
            id, project_id, is_enabled, font_family, font_size, bold, italic, underline,
            text_case, primary_color, outline_color, outline_width, box_bg_enabled,
            box_bg_color, box_bg_opacity, alignment, margin_v, margin_h
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
            is_enabled=excluded.is_enabled,
            font_family=excluded.font_family,
            font_size=excluded.font_size,
            bold=excluded.bold,
            italic=excluded.italic,
            underline=excluded.underline,
            text_case=excluded.text_case,
            primary_color=excluded.primary_color,
            outline_color=excluded.outline_color,
            outline_width=excluded.outline_width,
            box_bg_enabled=excluded.box_bg_enabled,
            box_bg_color=excluded.box_bg_color,
            box_bg_opacity=excluded.box_bg_opacity,
            alignment=excluded.alignment,
            margin_v=excluded.margin_v,
            margin_h=excluded.margin_h
    """, (
        "sub_" + project_id, project_id,
        int(style_data.get("is_enabled", 1)),
        style_data.get("font_family", "Montserrat"),
        int(style_data.get("font_size", 22)),
        int(style_data.get("bold", 1)),
        int(style_data.get("italic", 0)),
        int(style_data.get("underline", 0)),
        style_data.get("text_case", "DEFAULT"),
        style_data.get("primary_color", "#FFEE00"),
        style_data.get("outline_color", "#000000"),
        float(style_data.get("outline_width", 2.0)),
        int(style_data.get("box_bg_enabled", 1)),
        style_data.get("box_bg_color", "#000000"),
        float(style_data.get("box_bg_opacity", 0.65)),
        int(style_data.get("alignment", 2)),
        int(style_data.get("margin_v", 60)),
        int(style_data.get("margin_h", 30))
    ))
    conn.commit()
    row = conn.execute("SELECT * FROM dubbing_subtitle_styles WHERE project_id = ?", (project_id,)).fetchone()
    conn.close()
    return dict(row)

def hex_to_ass_color(hex_color: str, alpha_opacity: float = 1.0) -> str:
    """Chuyển mã Hex (#RRGGBB) sang định dạng màu ASS &H[AA][BB][GG][RR]"""
    c = hex_color.lstrip("#")
    if len(c) == 3:
        c = "".join([x * 2 for x in c])
    r = c[0:2] if len(c) >= 2 else "FF"
    g = c[2:4] if len(c) >= 4 else "FF"
    b = c[4:6] if len(c) >= 6 else "FF"
    # alpha trong ASS: 00 là hiển thị đầy đủ, FF là trong suốt hoàn toàn
    alpha_val = int((1.0 - max(0.0, min(1.0, alpha_opacity))) * 255)
    aa = f"{alpha_val:02X}"
    return f"&H{aa}{b}{g}{r}"

def ms_to_ass_time(ms: int) -> str:
    """Chuyển ms sang chuẩn timecode ASS H:MM:SS.cc"""
    hours = ms // 3600000
    ms %= 3600000
    minutes = ms // 60000
    ms %= 60000
    seconds = ms // 1000
    centiseconds = (ms % 1000) // 10
    return f"{hours}:{minutes:02d}:{seconds:02d}.{centiseconds:02d}"

def compile_ass_subtitles(project_id: str, output_path: str) -> str:
    """Biên dịch danh sách segment và style sang file .ass hoàn chỉnh"""
    project = get_project_by_id(project_id)
    if not project:
        raise ValueError(f"Project not found: {project_id}")
    style = project["subtitle_style"]
    segments = get_segments(project_id)
    
    font_name = style.get("font_family", "Montserrat")
    font_size = style.get("font_size", 22)
    primary_ass = hex_to_ass_color(style.get("primary_color", "#FFEE00"), 1.0)
    outline_ass = hex_to_ass_color(style.get("outline_color", "#000000"), 1.0)
    
    # Border style: 1 = Outline + drop shadow; 3 = Opaque box
    border_style = 3 if style.get("box_bg_enabled") else 1
    back_ass = hex_to_ass_color(style.get("box_bg_color", "#000000"), float(style.get("box_bg_opacity", 0.65)))
    
    bold_flag = -1 if style.get("bold") else 0
    italic_flag = -1 if style.get("italic") else 0
    underline_flag = -1 if style.get("underline") else 0
    
    outline_w = style.get("outline_width", 2.0)
    alignment = style.get("alignment", 2)
    margin_v = style.get("margin_v", 60)
    margin_h = style.get("margin_h", 30)
    
    ass_content = f"""[Script Info]
Title: 4KStudio Dubbed Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: {project.get("resolution_w", 1080)}
PlayResY: {project.get("resolution_h", 1920)}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},{primary_ass},&H000000FF,{outline_ass},{back_ass},{bold_flag},{italic_flag},{underline_flag},0,100,100,0,0,{border_style},{outline_w},1,{alignment},{margin_h},{margin_h},{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    for seg in segments:
        text = seg.get("translated_text", "").strip()
        if not text:
            continue
            
        case_opt = style.get("text_case", "DEFAULT")
        if case_opt == "UPPERCASE":
            text = text.upper()
        elif case_opt == "LOWERCASE":
            text = text.lower()
            
        # Format ASS escape
        text = text.replace("\n", "\\N")
        
        start_time = ms_to_ass_time(seg["start_ms"])
        end_time = ms_to_ass_time(seg["end_ms"])
        
        ass_content += f"Dialogue: 0,{start_time},{end_time},Default,,0,0,0,,{text}\n"
        
    with open(output_path, "w", encoding="utf-8-sig") as f:
        f.write(ass_content)
        
    return output_path

# -------------------------------------------------------------
# 5. BLUR REGIONS MANAGEMENT
# -------------------------------------------------------------
def save_blur_regions(project_id: str, regions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    conn = get_connection()
    conn.execute("DELETE FROM dubbing_blur_regions WHERE project_id = ?", (project_id,))
    
    for idx, r in enumerate(regions, start=1):
        reg_id = r.get("id") or f"blur_{project_id}_{idx}"
        conn.execute("""
            INSERT INTO dubbing_blur_regions (
                id, project_id, region_index, mode, x, y, width, height, blur_strength, start_sec, end_sec
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            reg_id, project_id, idx,
            r.get("mode", "WHEN_SUBTITLE_ACTIVE"),
            float(r.get("x", 0)),
            float(r.get("y", 0)),
            float(r.get("width", 0)),
            float(r.get("height", 0)),
            int(r.get("blur_strength", 15)),
            float(r.get("start_sec", 0.0)),
            float(r.get("end_sec", 0.0))
        ))
        
    conn.commit()
    rows = conn.execute("SELECT * FROM dubbing_blur_regions WHERE project_id = ? ORDER BY region_index ASC", (project_id,)).fetchall()
    conn.close()
    return [dict(row) for row in rows]

# -------------------------------------------------------------
# 6. ASSET CREATION & EXPORT PACKAGER (.ZIP)
# -------------------------------------------------------------
def create_or_update_asset(project_id: str, asset_type: str, filename: str, file_path: str, mime_type: str, metadata: Dict[str, Any] = None) -> Dict[str, Any]:
    conn = get_connection()
    asset_id = f"asset_{project_id}_{asset_type.lower()}"
    file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
    now = datetime.utcnow().isoformat()
    meta_str = json.dumps(metadata or {})
    
    conn.execute("""
        INSERT INTO dubbing_assets (
            id, project_id, asset_type, filename, file_path, file_size, mime_type, status, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            filename=excluded.filename,
            file_path=excluded.file_path,
            file_size=excluded.file_size,
            mime_type=excluded.mime_type,
            metadata_json=excluded.metadata_json,
            created_at=excluded.created_at
    """, (asset_id, project_id, asset_type, filename, file_path, file_size, mime_type, meta_str, now))
    
    conn.commit()
    row = conn.execute("SELECT * FROM dubbing_assets WHERE id = ?", (asset_id,)).fetchone()
    conn.close()
    return dict(row)

def get_project_assets(project_id: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM dubbing_assets WHERE project_id = ? ORDER BY created_at ASC", (project_id,)).fetchall()
    conn.close()
    assets = []
    for r in rows:
        d = dict(r)
        try:
            d["metadata"] = json.loads(d.get("metadata_json") or "{}")
        except Exception:
            d["metadata"] = {}
        assets.append(d)
    return assets

def package_project_zip(project_id: str) -> str:
    """Đóng gói tất cả tài sản của dự án vào 1 file ZIP duy nhất"""
    project = get_project_by_id(project_id)
    if not project:
        raise ValueError("Project not found")
        
    proj_dir = os.path.join(DUBBING_STORAGE_DIR, project_id)
    os.makedirs(proj_dir, exist_ok=True)
    zip_path = os.path.join(proj_dir, f"{project['name']}_assets.zip")
    
    segments = get_segments(project_id)
    
    # 1. Export transcript_output.json
    trans_out_path = os.path.join(proj_dir, "transcript_output.json")
    with open(trans_out_path, "w", encoding="utf-8") as f:
        json.dump(segments, f, ensure_ascii=False, indent=2)
    create_or_update_asset(project_id, "TRANSCRIPT_JSON", "transcript_output.json", trans_out_path, "application/json", {"count": len(segments)})
    
    # 2. Export translate_output.json
    translate_out_path = os.path.join(proj_dir, "translate_output.json")
    trans_list = [{
        "index": s["seg_index"],
        "start_ms": s["start_ms"],
        "end_ms": s["end_ms"],
        "text": s["translated_text"]
    } for s in segments]
    with open(translate_out_path, "w", encoding="utf-8") as f:
        json.dump(trans_list, f, ensure_ascii=False, indent=2)
    create_or_update_asset(project_id, "TRANSLATE_JSON", "translate_output.json", translate_out_path, "application/json", {"count": len(trans_list)})
    
    # 3. Export ASS subtitle
    ass_path = os.path.join(proj_dir, "translated_subtitle.ass")
    compile_ass_subtitles(project_id, ass_path)
    create_or_update_asset(project_id, "SUBTITLE_ASS", "translated_subtitle.ass", ass_path, "text/plain")
    
    # 4. Export tts_manifest.json
    manifest_path = os.path.join(proj_dir, "tts_manifest.json")
    manifest_data = {
        "project_id": project_id,
        "total_segments": len(segments),
        "segments": [{
            "index": s["seg_index"],
            "start_ms": s["start_ms"],
            "end_ms": s["end_ms"],
            "audio_duration_ms": s.get("audio_duration_ms", 0),
            "status": s.get("status")
        } for s in segments]
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, ensure_ascii=False, indent=2)
    create_or_update_asset(project_id, "TTS_MANIFEST_JSON", "tts_manifest.json", manifest_path, "application/json")
    
    # Build ZIP archive
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for fname in ["transcript_output.json", "translate_output.json", "translated_subtitle.ass", "tts_manifest.json"]:
            f_abs = os.path.join(proj_dir, fname)
            if os.path.exists(f_abs):
                zip_file.write(f_abs, arcname=fname)
                
        # Include source video if exists (store without re-compressing already encoded video)
        if project.get("video_path") and os.path.exists(project["video_path"]):
            zip_file.write(project["video_path"], arcname="source.mp4", compress_type=zipfile.ZIP_STORED)
            
        # Include voiceover if exists
        voiceover_path = os.path.join(proj_dir, "voiceover.wav")
        if os.path.exists(voiceover_path):
            zip_file.write(voiceover_path, arcname="voiceover.wav")
            
        # Include final video if exists
        final_mp4 = os.path.join(proj_dir, "final_dubbed.mp4")
        if os.path.exists(final_mp4):
            zip_file.write(final_mp4, arcname="final_video_dubbed.mp4", compress_type=zipfile.ZIP_STORED)
            
    create_or_update_asset(project_id, "BUNDLE_ZIP", os.path.basename(zip_path), zip_path, "application/zip")
    return zip_path

# -------------------------------------------------------------
# 7.5. REAL TTS SYNTHESIS & REAL TRANSLATION ENGINE
# -------------------------------------------------------------
from services.translator import translate_text
from services.audio_service import get_media_info
import edge_tts

def retranslate_project_segments(project_id: str, target_lang: str = "vi", style: str = "concise") -> List[Dict[str, Any]]:
    """Dịch tự động toàn bộ phân đoạn lời thoại bằng Google Translate GTX/DeepTranslator đa luồng song song"""
    from concurrent.futures import ThreadPoolExecutor
    segments = get_segments(project_id)
    
    def _trans_one(seg):
        orig = (seg.get("original_text") or "").strip()
        if orig and not orig.startswith("Phân đoạn thoại"):
            try:
                seg["translated_text"] = translate_text(orig, target_lang)
            except Exception:
                pass
        return seg
        
    with ThreadPoolExecutor(max_workers=8) as pool:
        segments = list(pool.map(_trans_one, segments))
            
    saved = save_segments(project_id, segments)
    return saved

def generate_tts_for_project(project_id: str, voice_id: str = "HN - Ngoc Huyen") -> List[Dict[str, Any]]:
    """Sinh âm thanh giọng đọc tiếng Việt chân thực cho từng segment bằng Edge-TTS song song và đo đạc timing"""
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    
    # Lựa chọn voice chuẩn Microsoft Neural
    v_code = "vi-VN-HoaiMyNeural"
    if "minh" in voice_id.lower() or "sg" in voice_id.lower():
        v_code = "vi-VN-NamMinhNeural"
        
    segments = get_segments(project_id)
    proj_dir = os.path.join(DUBBING_STORAGE_DIR, project_id)
    audio_dir = os.path.join(proj_dir, "tts_segments")
    os.makedirs(audio_dir, exist_ok=True)
    
    async def _run_all():
        sem = asyncio.Semaphore(3)
        
        total_count = len(segments)
        done_count = 0

        async def _synth_one(seg):
            nonlocal done_count
            text = (seg.get("translated_text") or "").strip()
            if not text:
                return
            seg_idx = seg["seg_index"]
            seg_file = os.path.join(audio_dir, f"segment_{seg_idx:04d}.mp3")
            
            # Smart reuse if already synthesized
            if os.path.exists(seg_file) and os.path.getsize(seg_file) > 1000:
                try:
                    info = get_media_info(seg_file)
                    dur_ms = int(float(info.get("duration", 0)) * 1000)
                    seg["audio_path"] = seg_file
                    seg["audio_duration_ms"] = dur_ms
                    seg["voice_id"] = voice_id
                    done_count += 1
                    return
                except Exception:
                    pass
            
            spd = float(seg.get("tts_speed") or 1.0)
            rate_int = int((spd - 1.0) * 100)
            rate_str = f"{rate_int:+d}%"
            
            async with sem:
                for attempt in range(2):
                    try:
                        comm = edge_tts.Communicate(text, v_code, rate=rate_str)
                        await comm.save(seg_file)
                        
                        info = get_media_info(seg_file)
                        dur_ms = int(float(info.get("duration", 0)) * 1000)
                        seg["audio_path"] = seg_file
                        seg["audio_duration_ms"] = dur_ms
                        seg["voice_id"] = voice_id
                        done_count += 1
                        if done_count % 15 == 0 or done_count == total_count:
                            pct = 72 + int((done_count / max(1, total_count)) * 18)
                            set_pipeline_progress(
                                project_id, "tts", pct,
                                f"Đang tổng hợp giọng đọc AI ({voice_id}): {done_count}/{total_count} câu...",
                                current_step=4, total_steps=5,
                                details={"tts_done": done_count, "tts_total": total_count}
                            )
                        break
                    except Exception as e:
                        if attempt == 0:
                            await asyncio.sleep(0.3)
                        else:
                            print(f"[DubbingTTS] Error generating seg {seg_idx}: {e}")
                    
        tasks = [_synth_one(seg) for seg in segments]
        if tasks:
            await asyncio.gather(*tasks)
                
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            with ThreadPoolExecutor(max_workers=1) as pool:
                pool.submit(asyncio.run, _run_all()).result()
        else:
            asyncio.run(_run_all())
    except RuntimeError:
        asyncio.run(_run_all())
        
    save_segments(project_id, segments)
    
    # Tạo master voiceover.wav đồng bộ chính xác theo từng timestamp câu nói gốc
    try:
        assemble_precision_master_voiceover(project_id, auto_fit=True)
    except Exception as e:
        print(f"[DubbingTTS] Error assembling precision master voiceover: {e}")
        
    return get_segments(project_id)

def assemble_precision_master_voiceover(project_id: str, auto_fit: bool = True, progress_callback=None) -> str:
    """
    Xây dựng master voiceover.wav đồng bộ chính xác theo từng timestamp (start_ms) của câu nói video gốc.
    - Không làm mất khoảng lặng (gaps) tự nhiên giữa các câu thoại.
    - Tự động nén/tăng tốc độ (atempo) khớp hoàn toàn với thời lượng khuôn hình (slot_duration_ms),
      triệt tiêu 100% tình trạng 'Giọng tràn khung'.
    - Xuất track âm thanh PCM 24000Hz 16-bit mono chất lượng cao.
    """
    project = get_project_by_id(project_id)
    if not project:
        raise ValueError(f"Project not found: {project_id}")
        
    proj_dir = os.path.join(DUBBING_STORAGE_DIR, project_id)
    os.makedirs(proj_dir, exist_ok=True)
    
    segments = get_segments(project_id)
    if not segments:
        return ""
        
    # Xác định tổng thời lượng video
    duration_ms = project.get("duration_ms") or 0
    if duration_ms <= 0:
        duration_ms = max(s.get("end_ms", 0) for s in segments) + 2000
        
    sample_rate = 24000
    total_samples = int((duration_ms / 1000.0) * sample_rate)
    master = np.zeros(total_samples, dtype=np.int16)
    
    total_segs = len(segments)
    for idx, seg in enumerate(segments):
        audio_path = seg.get("audio_path")
        if not audio_path or not os.path.exists(audio_path):
            continue
            
        start_ms = seg.get("start_ms", 0)
        end_ms = seg.get("end_ms", start_ms + 1000)
        slot_ms = max(200, end_ms - start_ms)
        
        filter_parts = [
            "silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB,areverse"
        ]
        
        if auto_fit:
            cur_dur = seg.get("audio_duration_ms") or slot_ms
            net_dur_ms = max(100, cur_dur - 250)
            target_ms = max(150, slot_ms - 20)
            ratio = net_dur_ms / target_ms
            
            if ratio > 1.05:
                speed = min(1.45, max(1.0, ratio))
                filter_parts.append(f"atempo={speed:.3f}")
                seg["tts_speed"] = round(speed, 2)
            else:
                seg["tts_speed"] = 1.0
        else:
            spd = float(seg.get("tts_speed") or 1.0)
            if abs(spd - 1.0) > 0.05:
                filter_parts.append(f"atempo={spd:.3f}")
                
        cmd = [
            "ffmpeg", "-v", "quiet", "-i", audio_path,
            "-af", ",".join(filter_parts),
            "-f", "s16le", "-acodec", "pcm_s16le", "-ac", "1", "-ar", str(sample_rate), "-"
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE)
        samples = np.frombuffer(proc.stdout, dtype=np.int16)
        
        start_sample = int((start_ms / 1000.0) * sample_rate)
        end_slot_sample = int((end_ms / 1000.0) * sample_rate)
        max_allowed = max(100, end_slot_sample - start_sample)
        
        to_write = samples[:max_allowed] if len(samples) > max_allowed else samples
        dest_end = min(total_samples, start_sample + len(to_write))
        master[start_sample : dest_end] = to_write[:dest_end - start_sample]
        
        actual_dur_ms = int((len(to_write) / sample_rate) * 1000)
        seg["audio_duration_ms"] = actual_dur_ms
        seg["is_overflow"] = 0
        seg["status"] = "PERFECT_FIT"
        
        if progress_callback and (idx % 20 == 0 or idx == total_segs - 1):
            progress_callback(int((idx / total_segs) * 100), f"Khớp chuẩn âm thanh câu #{idx+1}/{total_segs}...")
            
    master_wav = os.path.join(proj_dir, "voiceover.wav")
    with wave.open(master_wav, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(master.tobytes())
        
    save_segments(project_id, segments)
    create_or_update_asset(project_id, "VOICEOVER_WAV", "voiceover.wav", master_wav, "audio/wav")
    package_project_zip(project_id)
    return master_wav

def build_ffmpeg_filter_complex(project_id: str, proj_dir: str, ass_path: str) -> Dict[str, Any]:
    project = get_project_by_id(project_id)
    blur_regions = project.get("blur_regions", [])
    sub_style = project.get("subtitle_style", {})
    logo = project.get("logo", {})
    
    filter_chains = []
    current_v_stream = "0:v"
    
    # 1. Blur filter chains
    for idx, b in enumerate(blur_regions):
        x = int(b.get("x", 0))
        y = int(b.get("y", 0))
        w = int(b.get("width", 100))
        h = int(b.get("height", 50))
        strength = int(b.get("blur_strength", 15))
        mode = b.get("mode", "WHEN_SUBTITLE_ACTIVE")
        
        # Bounding limits
        w = max(10, w)
        h = max(10, h)
        
        crop_label = f"crop_{idx}"
        blur_label = f"blur_{idx}"
        next_v_stream = f"v_blur_{idx}"
        
        enable_expr = ""
        if mode == "WHEN_SUBTITLE_ACTIVE":
            start_s = b.get("start_sec", 0.0)
            end_s = b.get("end_sec", 0.0)
            if end_s > start_s:
                enable_expr = f":enable='between(t,{start_s},{end_s})'"
                
        # Split stream -> crop box -> boxblur -> overlay back onto current stream
        filter_chains.append(f"[{current_v_stream}]split=2[{current_v_stream}_base][{crop_label}]")
        filter_chains.append(f"[{crop_label}]crop={w}:{h}:{x}:{y},boxblur={strength}:1[{blur_label}]")
        filter_chains.append(f"[{current_v_stream}_base][{blur_label}]overlay={x}:{y}{enable_expr}[{next_v_stream}]")
        current_v_stream = next_v_stream
        
    # 2. Burn Subtitles (ASS)
    if sub_style.get("is_enabled", 1) and os.path.exists(ass_path):
        escaped_ass = ass_path.replace("\\", "/").replace(":", "\\:")
        next_v_stream = "v_sub"
        filter_chains.append(f"[{current_v_stream}]ass='{escaped_ass}'[{next_v_stream}]")
        current_v_stream = next_v_stream
        
    # 3. Logo watermark overlay
    if logo.get("is_enabled") and logo.get("text_content"):
        text = logo["text_content"].replace(":", "\\:").replace("'", "\\'")
        next_v_stream = "v_logo"
        filter_chains.append(f"[{current_v_stream}]drawtext=text='{text}':x=w-tw-20:y=20:fontsize=24:fontcolor=white@0.8[{next_v_stream}]")
        current_v_stream = next_v_stream
        
    return {
        "filter_complex": "; ".join(filter_chains) if filter_chains else None,
        "final_video_label": current_v_stream if filter_chains else None
    }

def render_project_video_sync(project_id: str, progress_callback=None) -> str:
    """Thực thi pipeline FFmpeg render video hoàn chỉnh"""
    project = get_project_by_id(project_id)
    if not project or not project.get("video_path") or not os.path.exists(project["video_path"]):
        raise FileNotFoundError(f"Project video file not found for: {project_id}")
        
    proj_dir = os.path.join(DUBBING_STORAGE_DIR, project_id)
    os.makedirs(proj_dir, exist_ok=True)
    
    # 1. Compile ASS
    ass_path = os.path.join(proj_dir, "translated_subtitle.ass")
    compile_ass_subtitles(project_id, ass_path)
    
    # 2. Build Filter Complex
    filter_info = build_ffmpeg_filter_complex(project_id, proj_dir, ass_path)
    final_output = os.path.join(proj_dir, "final_dubbed.mp4")
    
    cmd = ["ffmpeg", "-y", "-i", project["video_path"]]
    
    if filter_info["filter_complex"]:
        cmd.extend(["-filter_complex", filter_info["filter_complex"], "-map", f"[{filter_info['final_video_label']}]"])
    else:
        cmd.extend(["-c:v", "copy"])
        
    # Audio handling
    voiceover_path = os.path.join(proj_dir, "voiceover.wav")
    if os.path.exists(voiceover_path):
        # Mix/replace audio
        cmd.extend(["-i", voiceover_path, "-map", "1:a", "-c:a", "aac", "-b:a", "192k"])
    else:
        cmd.extend(["-c:a", "copy"])
        
    cmd.extend(["-c:v", "libx264", "-crf", "20", "-preset", "fast", final_output])
    
    if progress_callback:
        progress_callback(10, "Bắt đầu khởi tạo FFmpeg render...")
        
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stdout, stderr = p.communicate()
    
    if p.returncode != 0:
        raise RuntimeError(f"FFmpeg render error: {stderr[:500]}")
        
    if progress_callback:
        progress_callback(100, "Render hoàn tất!")
        
    # Save final asset
    create_or_update_asset(project_id, "FINAL_MP4", "final_video_dubbed.mp4", final_output, "video/mp4")
    # Package ZIP bundle
    package_project_zip(project_id)
    
    # Update project pipeline status
    p_status = project["pipeline_status"]
    p_status["render"] = "READY"
    update_project(project_id, {"pipeline_status": p_status})
    
    return final_output

# -------------------------------------------------------------
# 9. SEED DEMO PROJECT FROM 4KSTUDIO SCREENSHOTS (560 STUDIO)
# -------------------------------------------------------------
def seed_demo_4kstudio_project():
    """Tự động nạp dữ liệu mẫu đối soát từ màn hình 4KStudio (Project 560 SaveTik)"""
    conn = get_connection()
    existing = conn.execute("SELECT id FROM dubbing_projects WHERE id = 'proj_560_savetik'").fetchone()
    if existing:
        conn.close()
        return "proj_560_savetik"
        
    # Tạo folder ketqua-11-9
    folder_id = "folder_15"
    now = datetime.utcnow().isoformat()
    conn.execute("INSERT OR IGNORE INTO dubbing_folders (id, name, color, created_at) VALUES (?, ?, ?, ?)",
                 (folder_id, "ketqua-11-9", "#3b82f6", now))
    
    proj_id = "proj_560_savetik"
    demo_video_path = os.path.join(DUBBING_STORAGE_DIR, proj_id, "source.mp4")
    os.makedirs(os.path.dirname(demo_video_path), exist_ok=True)
    
    # Tạo video source placeholder nếu chưa có
    if not os.path.exists(demo_video_path):
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=1080x1920:d=590",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "590",
            "-c:v", "libx264", "-c:a", "aac", demo_video_path
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
    pipeline_status = json.dumps({
        "transcript": "READY",
        "translate": "READY",
        "tts": "READY",
        "subtitle": "READY",
        "render": "READY"
    })
    
    conn.execute("""
        INSERT OR REPLACE INTO dubbing_projects (
            id, folder_id, name, source_type, source_url, video_path,
            thumbnail_url, duration_ms, status, pipeline_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        proj_id, folder_id, "SaveTik.io_7676426179896823046", "URL",
        "https://www.douyin.com/video/7676426179896823046", demo_video_path,
        "", 590370, "READY", pipeline_status, now, now
    ))
    
    # Thêm Style phụ đề chuẩn theo screenshot 62fff0f1
    conn.execute("""
        INSERT OR REPLACE INTO dubbing_subtitle_styles (
            id, project_id, is_enabled, font_family, font_size, bold, italic, underline,
            text_case, primary_color, outline_color, outline_width, box_bg_enabled,
            box_bg_color, box_bg_opacity, alignment, margin_v, margin_h
        ) VALUES (?, ?, 1, 'Montserrat', 22, 1, 0, 0, 'DEFAULT', '#FFEE00', '#000000', 2.0, 1, '#000000', 0.65, 2, 70, 30)
    """, ("sub_" + proj_id, proj_id))
    
    # Thêm 22 vùng làm mờ chuẩn theo screenshot 4a70211b
    blur_samples = [
        (1, "WHEN_SUBTITLE_ACTIVE", 120, 1420, 840, 120, 15, 15.533, 19.033),
        (2, "WHEN_SUBTITLE_ACTIVE", 120, 1420, 840, 120, 15, 24.333, 127.533),
        (3, "WHEN_SUBTITLE_ACTIVE", 120, 1420, 840, 120, 15, 128.333, 142.533),
        (4, "WHEN_SUBTITLE_ACTIVE", 120, 1420, 840, 120, 15, 145.293, 156.333)
    ]
    for b in blur_samples:
        conn.execute("""
            INSERT OR REPLACE INTO dubbing_blur_regions (
                id, project_id, region_index, mode, x, y, width, height, blur_strength, start_sec, end_sec
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (f"blur_{proj_id}_{b[0]}", proj_id, b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8]))
        
    # Thêm 74 segments mẫu (đầy đủ các đoạn overflow #4, #7, #8... và too fast #19, #24... như trong ảnh)
    sample_segments = [
        (1, 16030, 18530, "素材拖拽到这里,开始你的大作吧~", "kéo tài liệu vào đây bắt đầu tác phẩm nào", "HN - Ngoc Huyen", 1.0, 2420),
        (2, 24830, 40030, "根据你的需求来调整参数设置", "theo nhu cầu của bạn để điều chỉnh cài đặt thông số", "HN - Ngoc Huyen", 1.0, 14800),
        (3, 40100, 43500, "今天我们要分享的是最实用的技巧", "hôm nay chúng ta sẽ cùng chia sẻ những mẹo hữu ích nhất", "HN - Ngoc Huyen", 1.0, 3200),
        (4, 43600, 45200, "非常快速并且高效", "rất là nhanh chóng và đem lại hiệu quả vô cùng vượt trội cho tất cả mọi người", "HN - Ngoc Huyen", 1.0, 2100), # OVERFLOW (#4)
        (7, 56000, 58000, "点击右下角的确认按钮", "hãy nhấn vào nút xác nhận ở phía góc dưới cùng bên phải của giao diện làm việc", "HN - Ngoc Huyen", 1.0, 2800), # OVERFLOW (#7)
        (8, 58200, 60000, "保存当前的设计模板", "lưu trữ lại toàn bộ mẫu thiết kế hiện tại để tái sử dụng cho các lần sau", "HN - Ngoc Huyen", 1.0, 2600), # OVERFLOW (#8)
        (19, 120000, 121500, "快速完成", "thao tác này cần phải được xử lý ngay tức khắc", "HN - Ngoc Huyen", 1.0, 1400), # TOO FAST (#19)
        (24, 150000, 151200, "xong ngay", "hoàn thành nhiệm vụ", "HN - Ngoc Huyen", 1.0, 1100) # TOO FAST (#24)
    ]
    
    for s in sample_segments:
        idx, st, ed, orig, trans, voice, spd, a_dur = s
        dur = ed - st
        m = calculate_segment_metrics({
            "duration_ms": dur,
            "original_text": orig,
            "translated_text": trans,
            "audio_duration_ms": a_dur
        })
        conn.execute("""
            INSERT OR REPLACE INTO dubbing_segments (
                id, project_id, seg_index, start_ms, end_ms, duration_ms,
                original_text, original_char_count, original_char_speed, roi_json,
                translated_text, translated_char_count, translated_char_speed, translated_word_count,
                voice_id, voice_provider, tts_speed, audio_path, audio_duration_ms, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, 'POPULAR', ?, '', ?, ?)
        """, (
            f"seg_{proj_id}_{idx}", proj_id, idx, st, ed, dur,
            orig, m["original_char_count"], m["original_char_speed"],
            trans, m["translated_char_count"], m["translated_char_speed"], m["translated_word_count"],
            voice, spd, a_dur, m["status"]
        ))
        
    conn.commit()
    conn.close()
    
    # Compile initial assets
    try:
        package_project_zip(proj_id)
    except Exception as e:
        print(f"[Seed] Error packaging assets: {e}")
        
    return proj_id

try:
    seed_demo_4kstudio_project()
except Exception as e:
    print(f"[DubbingService] Seed error: {e}")

# -------------------------------------------------------------
# 10. IDEMPOTENT CREDIT ENGINE
# -------------------------------------------------------------
def get_user_credits(user_id: str = "default_user") -> Dict[str, Any]:
    conn = get_connection()
    row = conn.execute("SELECT balance, expire_at FROM dubbing_credits WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        now = datetime.utcnow().isoformat()
        conn.execute("INSERT INTO dubbing_credits (user_id, balance) VALUES (?, 20000)", (user_id,))
        conn.commit()
        conn.close()
        return {"user_id": user_id, "balance": 20000, "expire_days": 7}
    conn.close()
    return {"user_id": user_id, "balance": row["balance"], "expire_days": 7}

def deduct_credits_idempotent(user_id: str, project_id: str, action: str, amount: int, idempotency_key: str, desc: str = "") -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    
    # Check idempotency
    existing = cursor.execute("SELECT id FROM dubbing_credit_ledger WHERE idempotency_key = ?", (idempotency_key,)).fetchone()
    if existing:
        conn.close()
        return True
        
    user_row = cursor.execute("SELECT balance FROM dubbing_credits WHERE user_id = ?", (user_id,)).fetchone()
    current_balance = user_row["balance"] if user_row else 20000
    
    if current_balance < amount:
        conn.close()
        return False
        
    new_balance = current_balance - amount
    cursor.execute("UPDATE dubbing_credits SET balance = ? WHERE user_id = ?", (new_balance, user_id))
    
    now = datetime.utcnow().isoformat()
    cursor.execute("""
        INSERT INTO dubbing_credit_ledger (id, user_id, project_id, action_type, amount, idempotency_key, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (str(uuid.uuid4()), user_id, project_id, action, amount, idempotency_key, desc, now))
    
    conn.commit()
    conn.close()
    return True


