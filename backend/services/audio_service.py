import os
import subprocess
import json
import uuid
import time
import shutil
from typing import Dict, Any, Optional

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
AUDIO_OUTPUT_DIR = os.path.join(DOWNLOADS_DIR, "audio_processed")
os.makedirs(AUDIO_OUTPUT_DIR, exist_ok=True)


def get_media_info(file_path: str) -> Dict[str, Any]:
    """Lấy thông tin media (thời lượng, codec, dung lượng) bằng ffprobe"""
    if not os.path.exists(file_path):
        return {}
    
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        data = json.loads(res.stdout)
        format_info = data.get("format", {})
        duration = float(format_info.get("duration", 0))
        size = int(format_info.get("size", 0))

        has_video = any(s.get("codec_type") == "video" for s in data.get("streams", []))
        has_audio = any(s.get("codec_type") == "audio" for s in data.get("streams", []))

        audio_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
        audio_codec = audio_stream.get("codec_name", "") if audio_stream else ""
        sample_rate = audio_stream.get("sample_rate", "") if audio_stream else ""

        return {
            "duration": duration,
            "size": size,
            "has_video": has_video,
            "has_audio": has_audio,
            "audio_codec": audio_codec,
            "sample_rate": sample_rate
        }
    except Exception as e:
        print(f"[audio_service] ffprobe error on {file_path}: {e}")
        return {
            "duration": 0,
            "size": os.path.getsize(file_path) if os.path.exists(file_path) else 0,
            "has_video": True,
            "has_audio": True
        }


def extract_audio_from_video(
    input_file: str,
    output_format: str = "mp3",
    bitrate: str = "320k",
    custom_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Trích xuất toàn bộ luồng âm thanh từ video sang MP3 (320k/192k), M4A, hoặc WAV chất lượng cao.
    """
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"File nguồn không tồn tại: {input_file}")

    ext = output_format.lower().strip(".")
    if ext not in ["mp3", "m4a", "wav", "aac"]:
        ext = "mp3"

    uid = uuid.uuid4().hex[:8]
    base_name = custom_name or os.path.splitext(os.path.basename(input_file))[0]
    safe_name = "".join(c for c in base_name if c.isalnum() or c in ("-", "_", " ")).strip()
    if not safe_name:
        safe_name = f"audio_{uid}"
    
    out_filename = f"{safe_name}_{uid}.{ext}"
    out_path = os.path.join(AUDIO_OUTPUT_DIR, out_filename)

    # Xây dựng lệnh FFmpeg
    cmd = ["ffmpeg", "-y", "-i", input_file, "-vn"]

    if ext == "mp3":
        b_rate = bitrate if bitrate in ["320k", "192k", "128k"] else "320k"
        cmd.extend(["-c:a", "libmp3lame", "-b:a", b_rate, "-ar", "44100", "-q:a", "0"])
    elif ext == "m4a" or ext == "aac":
        cmd.extend(["-c:a", "aac", "-b:a", "256k", "-ar", "44100"])
    elif ext == "wav":
        cmd.extend(["-c:a", "pcm_s16le", "-ar", "44100"])
    
    cmd.append(out_path)

    start_time = time.time()
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Lỗi FFmpeg khi trích xuất âm thanh: {proc.stderr[:400]}")

    elapsed = round(time.time() - start_time, 2)
    info = get_media_info(out_path)

    return {
        "success": True,
        "filename": out_filename,
        "file_path": out_path,
        "format": ext,
        "bitrate": bitrate if ext == "mp3" else "256k",
        "duration": info.get("duration", 0),
        "file_size": os.path.getsize(out_path) if os.path.exists(out_path) else 0,
        "elapsed_seconds": elapsed
    }


def adjust_media_volume(
    input_file: str,
    volume_percent: int = 100,
    output_type: str = "video",
    enable_limiter: bool = True,
    custom_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Khuếch đại hoặc giảm âm lượng từ 0% đến 500% BOOST.
    Tích hợp bộ lọc alimiter chống rè/vỡ tiếng khi âm lượng bị đẩy cao.
    output_type:
      - 'video': Xuất video MP4 mới (giữ nguyên hình ảnh bằng -c:v copy, xử lý siêu tốc)
      - 'audio': Xuất file MP3 mới
    """
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"File nguồn không tồn tại: {input_file}")

    volume_percent = max(0, min(500, int(volume_percent)))
    factor = round(volume_percent / 100.0, 3)

    uid = uuid.uuid4().hex[:8]
    base_name = custom_name or os.path.splitext(os.path.basename(input_file))[0]
    safe_name = "".join(c for c in base_name if c.isalnum() or c in ("-", "_", " ")).strip()
    if not safe_name:
        safe_name = f"boosted_{uid}"

    # Bộ lọc audio: volume + alimiter chống vỡ tiếng
    af_filters = []
    if factor == 0:
        af_filters.append("volume=0")
    else:
        af_filters.append(f"volume={factor}")
        if enable_limiter and factor > 1.0:
            # Ngăn audio peaks vượt quá 0dB -> chống rè vỡ tiếng tuyệt đối
            af_filters.append("alimiter=limit=0.95:attack=5:release=50:asc=1")
    
    af_str = ",".join(af_filters)

    cmd = ["ffmpeg", "-y", "-i", input_file]

    if output_type == "video":
        out_filename = f"{safe_name}_vol{volume_percent}pct_{uid}.mp4"
        out_path = os.path.join(AUDIO_OUTPUT_DIR, out_filename)
        # Sử dụng -c:v copy để không phải re-encode hình ảnh -> hoàn tất trong 1-2 giây
        cmd.extend([
            "-c:v", "copy",
            "-af", af_str,
            "-c:a", "aac",
            "-b:a", "256k"
        ])
    else:
        out_filename = f"{safe_name}_vol{volume_percent}pct_{uid}.mp3"
        out_path = os.path.join(AUDIO_OUTPUT_DIR, out_filename)
        cmd.extend([
            "-vn",
            "-af", af_str,
            "-c:a", "libmp3lame",
            "-b:a", "320k",
            "-ar", "44100"
        ])

    cmd.append(out_path)

    start_time = time.time()
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Lỗi FFmpeg khi điều chỉnh âm lượng: {proc.stderr[:400]}")

    elapsed = round(time.time() - start_time, 2)
    info = get_media_info(out_path)

    return {
        "success": True,
        "filename": out_filename,
        "file_path": out_path,
        "output_type": output_type,
        "volume_percent": volume_percent,
        "factor": factor,
        "limiter_enabled": enable_limiter,
        "duration": info.get("duration", 0),
        "file_size": os.path.getsize(out_path) if os.path.exists(out_path) else 0,
        "elapsed_seconds": elapsed
    }
