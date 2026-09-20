import os
import json
import shutil
from typing import Dict, Any, Optional
from services.db import get_setting, set_setting, update_prompt

# Google API client imports (handled gracefully if not yet configured)
try:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    from google.oauth2 import service_account
    from google.oauth2.credentials import Credentials
    GOOGLE_API_AVAILABLE = True
except ImportError:
    GOOGLE_API_AVAILABLE = False

DRIVE_SYNC_FOLDER_KEY = "drive_desktop_folder"
DRIVE_MODE_KEY = "drive_mode" # "desktop" or "api" or "gas" or "local_only"
DRIVE_API_CREDS_KEY = "drive_api_credentials_json"
DRIVE_TARGET_FOLDER_ID_KEY = "drive_target_folder_id"
DRIVE_GAS_URL_KEY = "drive_gas_url"

def get_drive_status() -> Dict[str, Any]:
    mode = get_setting(DRIVE_MODE_KEY, "desktop")
    desktop_folder = get_setting(DRIVE_SYNC_FOLDER_KEY, "")
    has_api_creds = bool(get_setting(DRIVE_API_CREDS_KEY, ""))
    target_folder_id = get_setting(DRIVE_TARGET_FOLDER_ID_KEY, "")
    gas_url = get_setting(DRIVE_GAS_URL_KEY, "")
    
    desktop_folder_exists = os.path.exists(desktop_folder) if desktop_folder else False
    
    is_ready = (
        (mode == "desktop" and desktop_folder_exists) or 
        (mode == "api" and has_api_creds) or
        (mode == "gas" and bool(gas_url))
    )
    
    return {
        "mode": mode,
        "desktop_folder": desktop_folder,
        "desktop_folder_exists": desktop_folder_exists,
        "google_api_available": GOOGLE_API_AVAILABLE,
        "has_api_creds": has_api_creds,
        "target_folder_id": target_folder_id,
        "gas_url": gas_url,
        "is_ready": is_ready
    }

def configure_drive(
    mode: str,
    desktop_folder: Optional[str] = None,
    api_creds_json: Optional[str] = None,
    target_folder_id: Optional[str] = None,
    gas_url: Optional[str] = None
) -> Dict[str, Any]:
    set_setting(DRIVE_MODE_KEY, mode)
    if desktop_folder is not None:
        set_setting(DRIVE_SYNC_FOLDER_KEY, desktop_folder.strip())
    if api_creds_json is not None:
        set_setting(DRIVE_API_CREDS_KEY, api_creds_json.strip())
    if target_folder_id is not None:
        set_setting(DRIVE_TARGET_FOLDER_ID_KEY, target_folder_id.strip())
    if gas_url is not None:
        set_setting(DRIVE_GAS_URL_KEY, gas_url.strip())
    return get_drive_status()

def _post_to_gas(gas_url: str, payload: dict, retries: int = 3, timeout: int = 120) -> dict:
    """Gửi POST an toàn tới Google Apps Script với cơ chế tự động thử lại khi server bận"""
    import requests
    import time
    
    last_err = None
    for attempt in range(retries):
        try:
            resp = requests.post(gas_url, json=payload, timeout=timeout, allow_redirects=True)
            if resp.status_code == 200:
                raw_text = resp.text.strip()
                if not raw_text:
                    raise RuntimeError("Google Apps Script trả về phản hồi rỗng (0 bytes). Đang thử lại...")
                try:
                    data = resp.json()
                except Exception:
                    raise RuntimeError(f"Apps Script phản hồi không đúng định dạng JSON: {raw_text[:200]}")
                if not data.get("success"):
                    raise RuntimeError(data.get("error", "Apps Script xử lý thất bại."))
                return data
            else:
                raise RuntimeError(f"Google Apps Script trả về mã HTTP {resp.status_code}")
        except Exception as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(2)
            else:
                raise last_err

def sync_video_to_drive(video_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Đồng bộ video và metadata sang Google Drive (Desktop Folder hoặc Drive API)
    """
    status = get_drive_status()
    mode = status["mode"]

    # Kiểm tra nếu video đã được đồng bộ lên Drive rồi thì bỏ qua, không tải lặp lại
    if video_data.get("drive_synced") == 1 and video_data.get("drive_file_id"):
        return {
            "success": True,
            "mode": mode,
            "drive_file_id": video_data.get("drive_file_id"),
            "drive_web_link": video_data.get("drive_web_link", ""),
            "already_synced": True,
            "message": "Video này đã có trên Google Drive, đã bỏ qua không lưu lặp lại!"
        }

    local_file = video_data.get("file_path")
    
    if not local_file or not os.path.exists(local_file):
        raise FileNotFoundError(f"Không tìm thấy file video tại: {local_file}")
        
    filename = os.path.basename(local_file)
    meta_filename = os.path.splitext(filename)[0] + "_metadata.json"

    # MODE 1: Google Drive Desktop Folder (Ổ G:\ hoặc thư mục Drive)
    if mode == "desktop":
        target_dir = status["desktop_folder"]
        if not target_dir or not os.path.exists(target_dir):
            raise RuntimeError("Thư mục Google Drive Desktop chưa được cấu hình hoặc không tồn tại.")
        
        # Subfolder by category (e.g. Game, Nhac, TamTrang)
        category_folder = os.path.join(target_dir, video_data.get("category_id", "General"))
        os.makedirs(category_folder, exist_ok=True)
        
        dest_video_path = os.path.join(category_folder, filename)
        dest_meta_path = os.path.join(category_folder, meta_filename)
        
        # Copy video to Google Drive sync folder
        shutil.copy2(local_file, dest_video_path)
        
        # Write metadata JSON along with video
        with open(dest_meta_path, "w", encoding="utf-8") as f:
            json.dump(video_data, f, ensure_ascii=False, indent=2)
            
        return {
            "success": True,
            "mode": "desktop",
            "drive_path": dest_video_path,
            "drive_file_id": f"local_drive_{filename}",
            "drive_web_link": f"file:///{dest_video_path.replace(os.sep, '/')}",
            "message": "Đã lưu vào thư mục Google Drive thành công!"
        }

    # MODE 2: Google Drive API
    elif mode == "api":
        if not GOOGLE_API_AVAILABLE:
            raise RuntimeError("Thư viện google-api-python-client chưa được cài đặt.")
            
        creds_json_str = get_setting(DRIVE_API_CREDS_KEY, "")
        if not creds_json_str:
            raise RuntimeError("Chưa cung cấp Google Drive API Credentials.")
            
        try:
            creds_data = json.loads(creds_json_str)
            # Check if service account or user credentials
            if "type" in creds_data and creds_data["type"] == "service_account":
                creds = service_account.Credentials.from_service_account_info(
                    creds_data,
                    scopes=['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']
                )
            else:
                creds = Credentials.from_authorized_user_info(
                    creds_data,
                    scopes=['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']
                )
                
            service = build('drive', 'v3', credentials=creds)
            
            # Target folder
            folder_id = get_setting(DRIVE_TARGET_FOLDER_ID_KEY, "")
            file_metadata = {'name': f"{video_data.get('title', 'video')}_{filename}"}
            if folder_id:
                file_metadata['parents'] = [folder_id]
                
            media = MediaFileUpload(local_file, mimetype='video/mp4', resumable=True)
            uploaded_file = service.files().create(
                body=file_metadata,
                media_body=media,
                supportsAllDrives=True,
                fields='id, webViewLink, webContentLink'
            ).execute()
            
            return {
                "success": True,
                "mode": "api",
                "drive_file_id": uploaded_file.get('id'),
                "drive_web_link": uploaded_file.get('webViewLink'),
                "message": "Đã upload video lên Google Drive qua API thành công!"
            }
        except Exception as e:
            err_str = str(e)
            if "storageQuotaExceeded" in err_str or "Service Accounts do not have storage quota" in err_str:
                raise RuntimeError(
                    "Google chặn upload do tài khoản Bot (Service Account) không có dung lượng cá nhân (0 MB) khi tải vào 'Drive của tôi'.\n"
                    "👉 CÁCH KHẮC PHỤC:\n"
                    "1. Sử dụng thư mục trong 'Bộ nhớ dùng chung' (Shared Drive) rồi thêm bot vào làm Người quản lý nội dung; HOẶC\n"
                    "2. Khuyên dùng: Dùng chế độ 'Thư mục Máy tính (Desktop Sync)' kết hợp ứng dụng Google Drive for Desktop để đồng bộ trực tiếp bằng 5TB của bạn."
                )
            raise RuntimeError(f"Lỗi khi upload lên Google Drive: {err_str}")

    # MODE 3: Google Apps Script Web App (Tải trực tiếp lên Cloud không qua Bot)
    elif mode == "gas":
        import base64
        import requests
        gas_url = get_setting(DRIVE_GAS_URL_KEY, "")
        if not gas_url:
            raise RuntimeError("Chưa cấu hình URL Google Apps Script Web App.")
        with open(local_file, "rb") as f:
            file_b64 = base64.b64encode(f.read()).decode("utf-8")
        payload = {
            "folder_id": get_setting(DRIVE_TARGET_FOLDER_ID_KEY, "1rCzVtTIKWI_QeU8LWMefuZ0A9NYvpVeS"),
            "filename": f"{video_data.get('title', 'video')}_{filename}",
            "mime_type": "video/mp4",
            "file_base64": file_b64,
            "metadata": video_data
        }
        res_data = _post_to_gas(gas_url, payload, retries=3, timeout=120)
        return {
            "success": True,
            "mode": "gas",
            "drive_file_id": res_data.get("drive_file_id", ""),
            "drive_web_link": res_data.get("drive_web_link", ""),
            "message": "Đã lưu thẳng lên Google Drive qua Apps Script thành công!"
        }

    else:
        return {
            "success": False,
            "mode": "local_only",
            "message": "Chế độ lưu trữ hiện tại chỉ dùng ổ cứng Local."
        }

def delete_file_from_drive(video_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Xóa file video và metadata trên Google Drive khi người dùng xóa vĩnh viễn trong thùng rác
    """
    status = get_drive_status()
    mode = status["mode"]
    drive_file_id = video_data.get("drive_file_id")
    local_file = video_data.get("file_path", "")
    filename = os.path.basename(local_file) if local_file else ""
    full_drive_filename = f"{video_data.get('title', 'video')}_{filename}" if filename else ""

    # MODE 1: Google Drive Desktop Folder
    if mode == "desktop":
        target_dir = status["desktop_folder"]
        if target_dir and os.path.exists(target_dir):
            category_folder = os.path.join(target_dir, video_data.get("category_id", "General"))
            dest_video_path = os.path.join(category_folder, filename)
            meta_filename = os.path.splitext(filename)[0] + "_metadata.json"
            dest_meta_path = os.path.join(category_folder, meta_filename)
            try:
                if os.path.exists(dest_video_path):
                    os.remove(dest_video_path)
                if os.path.exists(dest_meta_path):
                    os.remove(dest_meta_path)
            except Exception as e:
                print(f"Error deleting desktop drive file: {e}")
        return {"success": True, "mode": "desktop"}

    # MODE 2: Google Drive API
    elif mode == "api":
        if GOOGLE_API_AVAILABLE and drive_file_id and not drive_file_id.startswith("local_drive_"):
            try:
                creds_json_str = get_setting(DRIVE_API_CREDS_KEY, "")
                if creds_json_str:
                    creds_data = json.loads(creds_json_str)
                    if creds_data.get("type") == "service_account":
                        creds = service_account.Credentials.from_service_account_info(
                            creds_data,
                            scopes=['https://www.googleapis.com/auth/drive']
                        )
                    else:
                        creds = Credentials.from_authorized_user_info(
                            creds_data,
                            scopes=['https://www.googleapis.com/auth/drive']
                        )
                    service = build('drive', 'v3', credentials=creds)
                    service.files().delete(fileId=drive_file_id, supportsAllDrives=True).execute()
            except Exception as e:
                print(f"Error deleting file from Google Drive API: {e}")
        return {"success": True, "mode": "api"}

    # MODE 3: Google Apps Script Web App
    elif mode == "gas":
        gas_url = get_setting(DRIVE_GAS_URL_KEY, "")
        if gas_url:
            payload = {
                "action": "delete_file",
                "folder_id": get_setting(DRIVE_TARGET_FOLDER_ID_KEY, "1rCzVtTIKWI_QeU8LWMefuZ0A9NYvpVeS"),
                "file_id": drive_file_id or "",
                "filename": full_drive_filename,
                "raw_filename": filename,
                "video_title": video_data.get("title", "")
            }
            try:
                res_data = _post_to_gas(gas_url, payload, retries=2, timeout=45)
                return {
                    "success": True,
                    "mode": "gas",
                    "details": res_data
                }
            except Exception as e:
                print(f"Error calling Apps Script to delete file: {e}")
        return {"success": True, "mode": "gas"}

    return {"success": True, "mode": "local_only"}

def backup_database_to_drive() -> Dict[str, Any]:
    """
    Sao lưu file database SQLite (social_content.db) lên Google Drive
    """
    from datetime import datetime
    status = get_drive_status()
    mode = status["mode"]
    db_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "social_content.db")
    
    if not os.path.exists(db_file):
        raise FileNotFoundError("Không tìm thấy file database social_content.db")
        
    backup_name = "social_content.db"
    
    if mode == "desktop":
        target_dir = status["desktop_folder"]
        if not target_dir or not os.path.exists(target_dir):
            raise RuntimeError("Thư mục Google Drive Desktop chưa tồn tại hoặc chưa cấu hình.")
        backup_folder = os.path.join(target_dir, "database_backup")
        os.makedirs(backup_folder, exist_ok=True)
        dest_db = os.path.join(backup_folder, backup_name)
        shutil.copy2(db_file, dest_db)
        return {
            "success": True,
            "mode": "desktop",
            "path": dest_db,
            "message": f"Đã sao lưu database vào: {dest_db}"
        }
    elif mode == "api":
        if not GOOGLE_API_AVAILABLE:
            raise RuntimeError("Google API chưa sẵn sàng")
        creds_json_str = get_setting(DRIVE_API_CREDS_KEY, "")
        if not creds_json_str:
            raise RuntimeError("Chưa cung cấp Google Drive API credentials")
        try:
            creds_data = json.loads(creds_json_str)
            if "type" in creds_data and creds_data["type"] == "service_account":
                creds = service_account.Credentials.from_service_account_info(
                    creds_data, scopes=['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']
                )
            else:
                creds = Credentials.from_authorized_user_info(
                    creds_data, scopes=['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']
                )
            service = build('drive', 'v3', credentials=creds)
            folder_id = get_setting(DRIVE_TARGET_FOLDER_ID_KEY, "")
            file_meta = {'name': backup_name}
            if folder_id:
                file_meta['parents'] = [folder_id]
            media = MediaFileUpload(db_file, mimetype='application/x-sqlite3', resumable=True)
            uploaded = service.files().create(
                body=file_meta,
                media_body=media,
                supportsAllDrives=True,
                fields='id, webViewLink'
            ).execute()
            return {
                "success": True,
                "mode": "api",
                "drive_file_id": uploaded.get('id'),
                "drive_web_link": uploaded.get('webViewLink'),
                "message": "Đã tải bản sao lưu database lên Google Drive thành công!"
            }
        except Exception as e:
            err_str = str(e)
            if "storageQuotaExceeded" in err_str or "Service Accounts do not have storage quota" in err_str:
                raise RuntimeError(
                    "Google chặn upload do tài khoản Bot (Service Account) không có dung lượng cá nhân (0 MB) khi tải vào 'Drive của tôi'.\n"
                    "👉 CÁCH KHẮC PHỤC:\n"
                    "1. Sử dụng thư mục trong 'Bộ nhớ dùng chung' (Shared Drive) rồi thêm bot vào làm Người quản lý nội dung; HOẶC\n"
                    "2. Khuyên dùng: Dùng chế độ 'Thư mục Máy tính (Desktop Sync)' kết hợp ứng dụng Google Drive for Desktop để đồng bộ trực tiếp bằng 5TB của bạn."
                )
            raise RuntimeError(f"Lỗi khi upload database lên Google Drive: {err_str}")
    elif mode == "gas":
        import base64
        import requests
        gas_url = get_setting(DRIVE_GAS_URL_KEY, "")
        if not gas_url:
            raise RuntimeError("Chưa cấu hình URL Google Apps Script Web App.")
        with open(db_file, "rb") as f:
            file_b64 = base64.b64encode(f.read()).decode("utf-8")
        payload = {
            "folder_id": get_setting(DRIVE_TARGET_FOLDER_ID_KEY, "1rCzVtTIKWI_QeU8LWMefuZ0A9NYvpVeS"),
            "filename": backup_name,
            "mime_type": "application/x-sqlite3",
            "file_base64": file_b64
        }
        res_data = _post_to_gas(gas_url, payload, retries=3, timeout=120)
        return {
            "success": True,
            "mode": "gas",
            "drive_file_id": res_data.get("drive_file_id", ""),
            "drive_web_link": res_data.get("drive_web_link", ""),
            "message": "Đã tải bản sao lưu database lên Google Drive qua Apps Script thành công!"
        }
    else:
        return {"success": False, "message": "Chế độ lưu trữ hiện tại chỉ là Local."}

def test_drive_connection(
    mode: Optional[str] = None,
    desktop_folder: Optional[str] = None,
    api_creds_json: Optional[str] = None,
    target_folder_id: Optional[str] = None,
    gas_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Quét và kiểm tra kết nối Google Drive (Desktop hoặc API)
    Có thể truyền trực tiếp tham số mới để test trước khi lưu, hoặc test cấu hình hiện tại trong DB.
    """
    current_status = get_drive_status()
    selected_mode = mode or current_status["mode"]

    # 1. TEST MODE DESKTOP
    if selected_mode == "desktop":
        folder = desktop_folder if desktop_folder is not None else current_status["desktop_folder"]
        if not folder or not folder.strip():
            return {
                "success": False,
                "mode": "desktop",
                "error": "Chưa nhập đường dẫn thư mục Google Drive trên máy tính."
            }
        if not os.path.exists(folder):
            return {
                "success": False,
                "mode": "desktop",
                "error": f"Thư mục không tồn tại trên máy tính: {folder}"
            }
        test_file = os.path.join(folder, ".social_os_write_test.tmp")
        try:
            with open(test_file, "w") as f:
                f.write("test")
            os.remove(test_file)
            return {
                "success": True,
                "mode": "desktop",
                "folder_path": folder,
                "message": f"Kết nối thư mục Desktop thành công! Thư mục '{folder}' hoạt động tốt và có quyền ghi."
            }
        except Exception as e:
            return {
                "success": False,
                "mode": "desktop",
                "error": f"Không có quyền ghi vào thư mục: {str(e)}"
            }

    # 2. TEST MODE GOOGLE APPS SCRIPT
    elif selected_mode == "gas":
        import requests
        url = gas_url if (gas_url and gas_url.strip()) else get_setting(DRIVE_GAS_URL_KEY, "")
        if not url or not url.strip():
            return {
                "success": False,
                "mode": "gas",
                "error": "Chưa nhập URL Google Apps Script Web App."
            }
        try:
            resp = requests.get(url.strip(), timeout=45)
            if resp.status_code == 200:
                return {
                    "success": True,
                    "mode": "gas",
                    "message": "Kết nối Google Apps Script thành công! Sẵn sàng upload thẳng lên Drive 5 TB của bạn."
                }
            else:
                return {
                    "success": False,
                    "mode": "gas",
                    "error": f"Lỗi phản hồi từ Google Apps Script (Mã {resp.status_code})"
                }
        except Exception as e:
            return {
                "success": False,
                "mode": "gas",
                "error": f"Không thể kết nối đến URL Web App: {str(e)}"
            }

    # 3. TEST MODE API
    elif selected_mode == "api":
        if not GOOGLE_API_AVAILABLE:
            return {
                "success": False,
                "mode": "api",
                "error": "Chưa cài đặt thư viện google-api-python-client."
            }

        creds_str = api_creds_json if (api_creds_json and api_creds_json.strip()) else get_setting(DRIVE_API_CREDS_KEY, "")
        if not creds_str:
            return {
                "success": False,
                "mode": "api",
                "error": "Chưa nạp file Service Account JSON hoặc Credentials."
            }

        try:
            creds_data = json.loads(creds_str)
        except Exception as json_err:
            return {
                "success": False,
                "mode": "api",
                "error": f"Nội dung file JSON không đúng định dạng: {str(json_err)}"
            }

        try:
            if "type" in creds_data and creds_data["type"] == "service_account":
                creds = service_account.Credentials.from_service_account_info(
                    creds_data,
                    scopes=['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']
                )
            else:
                creds = Credentials.from_authorized_user_info(
                    creds_data,
                    scopes=['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']
                )

            service = build('drive', 'v3', credentials=creds)

            # Test basic API call
            about = service.about().get(fields="user, storageQuota").execute()
            bot_email = creds_data.get("client_email", "N/A")
            project_id = creds_data.get("project_id", "N/A")

            result_details = {
                "bot_email": bot_email,
                "project_id": project_id,
            }

            # List folders shared with this bot
            shared_folders = []
            try:
                list_res = service.files().list(
                    q="mimeType='application/vnd.google-apps.folder' and trashed=false",
                    fields="files(id, name, capabilities)",
                    pageSize=10,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True
                ).execute()
                shared_folders = list_res.get("files", [])
            except Exception:
                pass

            folder_id = target_folder_id.strip() if target_folder_id is not None else get_setting(DRIVE_TARGET_FOLDER_ID_KEY, "")
            folder_info = None

            if folder_id:
                try:
                    folder_info = service.files().get(
                        fileId=folder_id,
                        fields="id, name, mimeType, capabilities, trashed",
                        supportsAllDrives=True
                    ).execute()
                except Exception:
                    # If direct lookup fails, check if shared_folders contains it with case/typo difference
                    if shared_folders:
                        for sf in shared_folders:
                            # Compare loosely (case-insensitive or common I/l and 0/O confusion)
                            norm_input = folder_id.lower().replace('l', 'i').replace('o', '0')
                            norm_sf = sf['id'].lower().replace('l', 'i').replace('o', '0')
                            if norm_input == norm_sf or len(shared_folders) == 1:
                                folder_info = sf
                                folder_id = sf['id']
                                set_setting(DRIVE_TARGET_FOLDER_ID_KEY, folder_id)
                                break
            elif shared_folders:
                # If no folder_id given but user shared a folder with bot, auto-use it!
                folder_info = shared_folders[0]
                folder_id = folder_info['id']
                set_setting(DRIVE_TARGET_FOLDER_ID_KEY, folder_id)

            if folder_info:
                if folder_info.get("trashed"):
                    return {
                        "success": False,
                        "mode": "api",
                        "details": result_details,
                        "error": f"Thư mục '{folder_info.get('name')}' đang nằm trong Thùng rác (Trash)."
                    }

                can_add = folder_info.get("capabilities", {}).get("canAddChildren", False)
                result_details["folder_name"] = folder_info.get("name", "Unknown Folder")
                result_details["folder_id"] = folder_id
                result_details["can_write"] = can_add

                if not can_add:
                    return {
                        "success": False,
                        "mode": "api",
                        "details": result_details,
                        "error": f"Bot đã tìm thấy thư mục '{folder_info.get('name')}' nhưng CHƯA CÓ QUYỀN GHI. Hãy vào Google Drive chia sẻ thư mục cho bot {bot_email} với quyền 'Người chỉnh sửa' (Editor)."
                    }

                return {
                    "success": True,
                    "mode": "api",
                    "details": result_details,
                    "message": f"Kết nối hoàn hảo! Đã xác thực bot ({bot_email}) và kết nối thành công tới thư mục: \"{folder_info.get('name')}\"."
                }
            elif folder_id:
                return {
                    "success": False,
                    "mode": "api",
                    "details": result_details,
                    "error": f"Không tìm thấy thư mục ID '{folder_id}'. Bạn hãy đảm bảo đã vào Google Drive ➔ Chia sẻ thư mục đó cho bot: {bot_email} (quyền Người chỉnh sửa)."
                }
            else:
                return {
                    "success": True,
                    "mode": "api",
                    "details": result_details,
                    "message": f"Kết nối Google Drive API thành công! Bot ({bot_email}) đã sẵn sàng hoạt động."
                }

            return {
                "success": True,
                "mode": "api",
                "details": result_details,
                "message": f"Kết nối Google Drive API thành công! Bot ({bot_email}) đã sẵn sàng hoạt động."
            }
        except Exception as e:
            return {
                "success": False,
                "mode": "api",
                "error": f"Lỗi xác thực Google Drive API: {str(e)}"
            }

    return {
        "success": False,
        "mode": selected_mode,
        "error": "Chế độ không hợp lệ."
    }

def download_video_from_drive(video_data: Dict[str, Any], dest_path: str) -> str:
    """
    Tải video từ Google Drive về máy khi người dùng yêu cầu xuất file mà file local đã được dọn dẹp (Cloud-First)
    """
    drive_file_id = video_data.get("drive_file_id")
    status = get_drive_status()
    mode = status["mode"]
    
    # 1. Thử qua GAS nếu đang ở chế độ gas
    if mode == "gas":
        gas_url = get_setting(DRIVE_GAS_URL_KEY, "")
        if gas_url and drive_file_id:
            try:
                import base64
                payload = {
                    "action": "get_file",
                    "file_id": drive_file_id
                }
                res_data = _post_to_gas(gas_url, payload, retries=2, timeout=60)
                if res_data.get("success") and res_data.get("file_base64"):
                    file_bytes = base64.b64decode(res_data["file_base64"])
                    with open(dest_path, "wb") as f:
                        f.write(file_bytes)
                    return dest_path
            except Exception as e:
                print(f"Error downloading via GAS get_file: {e}")

    # 2. Thử qua Google Drive API
    if GOOGLE_API_AVAILABLE and drive_file_id and not drive_file_id.startswith("local_drive_"):
        try:
            creds_json_str = get_setting(DRIVE_API_CREDS_KEY, "")
            if creds_json_str:
                creds_data = json.loads(creds_json_str)
                if creds_data.get("type") == "service_account":
                    creds = service_account.Credentials.from_service_account_info(
                        creds_data, scopes=['https://www.googleapis.com/auth/drive']
                    )
                else:
                    creds = Credentials.from_authorized_user_info(
                        creds_data, scopes=['https://www.googleapis.com/auth/drive']
                    )
                service = build('drive', 'v3', credentials=creds)
                request = service.files().get_media(fileId=drive_file_id)
                with open(dest_path, "wb") as f:
                    from googleapiclient.http import MediaIoBaseDownload
                    downloader = MediaIoBaseDownload(f, request)
                    done = False
                    while not done:
                        status_dl, done = downloader.next_chunk()
                return dest_path
        except Exception as e:
            print(f"Error downloading via Drive API: {e}")

    # 3. Thử tải qua direct uc link
    if drive_file_id:
        try:
            import requests
            dl_url = f"https://drive.google.com/uc?export=download&id={drive_file_id}"
            res = requests.get(dl_url, stream=True, timeout=60)
            if res.status_code == 200 and "html" not in res.headers.get("content-type", "").lower():
                with open(dest_path, "wb") as f:
                    for chunk in res.iter_content(chunk_size=32768):
                        if chunk:
                            f.write(chunk)
                return dest_path
        except Exception as e:
            print(f"Error downloading via direct uc link: {e}")

    return ""


def sync_prompt_to_drive(prompt_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Đồng bộ ảnh/video của Prompt và metadata câu lệnh lên Google Drive (Apps Script / Desktop / API)
    """
    status = get_drive_status()
    mode = status["mode"]

    local_file = prompt_data.get("local_path")
    if not local_file or not os.path.exists(local_file):
        media_url = prompt_data.get("media_url", "")
        if media_url and "/prompts/" in media_url:
            fname = os.path.basename(media_url)
            cand = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloads", "prompts", fname)
            if os.path.exists(cand):
                local_file = cand

    if not local_file or not os.path.exists(local_file):
        raise FileNotFoundError(f"Không tìm thấy file media của prompt trên máy cục bộ để đồng bộ")

    filename = os.path.basename(local_file)
    meta_filename = os.path.splitext(filename)[0] + "_prompt_meta.json"

    ext = os.path.splitext(filename)[1].lower()
    mime_type = "image/jpeg"
    if ext in [".png"]:
        mime_type = "image/png"
    elif ext in [".webp"]:
        mime_type = "image/webp"
    elif ext in [".gif"]:
        mime_type = "image/gif"
    elif ext in [".mp4", ".mkv", ".webm", ".mov"]:
        mime_type = "video/mp4"

    # MODE 1: Google Drive Desktop Folder
    if mode == "desktop":
        target_dir = status["desktop_folder"]
        if not target_dir or not os.path.exists(target_dir):
            raise RuntimeError("Thư mục Google Drive Desktop chưa được cấu hình hoặc không tồn tại.")
        
        prompt_folder = os.path.join(target_dir, "PromptVault")
        os.makedirs(prompt_folder, exist_ok=True)

        dest_media_path = os.path.join(prompt_folder, filename)
        dest_meta_path = os.path.join(prompt_folder, meta_filename)

        shutil.copy2(local_file, dest_media_path)
        with open(dest_meta_path, "w", encoding="utf-8") as f:
            json.dump(prompt_data, f, ensure_ascii=False, indent=2)

        # Xóa file local trong downloads/prompts để giải phóng ổ cứng
        try:
            if os.path.abspath(local_file) != os.path.abspath(dest_media_path):
                os.remove(local_file)
        except Exception:
            pass

        drive_file_id = f"local_drive_{filename}"
        drive_web_link = f"file:///{dest_media_path.replace(os.sep, '/')}"

        update_prompt(prompt_data["id"], {
            "drive_file_id": drive_file_id,
            "drive_web_link": drive_web_link,
            "drive_synced": 1,
            "local_path": dest_media_path
        })

        return {
            "success": True,
            "mode": "desktop",
            "drive_file_id": drive_file_id,
            "drive_web_link": drive_web_link,
            "message": "Đã lưu vào thư mục Google Drive Desktop (PromptVault) thành công và dọn sạch file tạm!"
        }

    # MODE 2: Google Apps Script Web App (Upload thẳng qua GAS)
    elif mode == "gas":
        import base64
        gas_url = get_setting(DRIVE_GAS_URL_KEY, "")
        if not gas_url:
            raise RuntimeError("Chưa cấu hình URL Google Apps Script Web App.")

        with open(local_file, "rb") as f:
            file_b64 = base64.b64encode(f.read()).decode("utf-8")

        prompt_id = prompt_data.get("id", "pmt")
        drive_name = f"Prompt_{prompt_id}_{filename}"
        target_folder = get_setting(DRIVE_TARGET_FOLDER_ID_KEY, "1rCzVtTIKWI_QeU8LWMefuZ0A9NYvpVeS")

        payload = {
            "folder_id": target_folder,
            "filename": drive_name,
            "mime_type": mime_type,
            "file_base64": file_b64,
            "metadata": prompt_data
        }

        res_data = _post_to_gas(gas_url, payload, retries=3, timeout=120)
        drive_file_id = res_data.get("drive_file_id", "")
        drive_web_link = res_data.get("drive_web_link", "")

        # Đường dẫn trực tiếp từ Google Drive CDN
        cdn_media_url = (
            f"https://drive.google.com/file/d/{drive_file_id}/preview"
            if mime_type.startswith("video")
            else f"https://lh3.googleusercontent.com/d/{drive_file_id}"
        )

        # Đối với video trên Google Drive, link lh3.../d/ là trang HTML nên dùng proxy endpoint để lấy ảnh thật
        thumb_url = f"/api/drive/thumbnail/{drive_file_id}" if mime_type.startswith("video") else f"https://lh3.googleusercontent.com/d/{drive_file_id}"

        # Cập nhật DB: drive_synced=1, xóa local_path, trỏ media_url sang Drive CDN
        update_prompt(prompt_data["id"], {
            "drive_file_id": drive_file_id,
            "drive_web_link": drive_web_link,
            "drive_synced": 1,
            "local_path": "",
            "media_url": cdn_media_url,
            "thumbnail_url": thumb_url
        })

        # CLOUD-FIRST: Xóa sạch file cục bộ trên máy tính sau khi đã an toàn trên Drive
        try:
            if local_file and os.path.exists(local_file):
                os.remove(local_file)
        except Exception as del_err:
            print(f"Xóa file prompt local thất bại: {del_err}")

        return {
            "success": True,
            "mode": "gas",
            "drive_file_id": drive_file_id,
            "drive_web_link": drive_web_link,
            "media_url": cdn_media_url,
            "message": "Đã lưu thẳng ảnh/video Prompt lên Google Drive thành công và xóa sạch file máy local!"
        }

    # MODE 3: Google Drive API
    elif mode == "api":
        if not GOOGLE_API_AVAILABLE:
            raise RuntimeError("Thư viện google-api-python-client chưa được cài đặt.")
        creds_json_str = get_setting(DRIVE_API_CREDS_KEY, "")
        if not creds_json_str:
            raise RuntimeError("Chưa cung cấp Google Drive API Credentials.")

        creds_data = json.loads(creds_json_str)
        if "type" in creds_data and creds_data["type"] == "service_account":
            creds = service_account.Credentials.from_service_account_info(
                creds_data,
                scopes=['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']
            )
        else:
            creds = Credentials.from_authorized_user_info(
                creds_data,
                scopes=['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']
            )
            
        service = build('drive', 'v3', credentials=creds)
        folder_id = get_setting(DRIVE_TARGET_FOLDER_ID_KEY, "")
        file_metadata = {'name': f"Prompt_{prompt_data.get('id')}_{filename}"}
        if folder_id:
            file_metadata['parents'] = [folder_id]

        media = MediaFileUpload(local_file, mimetype=mime_type, resumable=True)
        uploaded_file = service.files().create(
            body=file_metadata,
            media_body=media,
            supportsAllDrives=True,
            fields='id, webViewLink, webContentLink'
        ).execute()

        drive_file_id = uploaded_file.get('id')
        drive_web_link = uploaded_file.get('webViewLink')

        cdn_media_url = (
            f"https://drive.google.com/file/d/{drive_file_id}/preview"
            if mime_type.startswith("video")
            else f"https://lh3.googleusercontent.com/d/{drive_file_id}"
        )

        thumb_url = f"/api/drive/thumbnail/{drive_file_id}" if mime_type.startswith("video") else f"https://lh3.googleusercontent.com/d/{drive_file_id}"

        update_prompt(prompt_data["id"], {
            "drive_file_id": drive_file_id,
            "drive_web_link": drive_web_link,
            "drive_synced": 1,
            "local_path": "",
            "media_url": cdn_media_url,
            "thumbnail_url": thumb_url
        })

        # CLOUD-FIRST: Xóa file cục bộ
        try:
            if local_file and os.path.exists(local_file):
                os.remove(local_file)
        except Exception as del_err:
            print(f"Xóa file prompt local thất bại: {del_err}")

        return {
            "success": True,
            "mode": "api",
            "drive_file_id": drive_file_id,
            "drive_web_link": drive_web_link,
            "media_url": cdn_media_url,
            "message": "Đã upload Prompt lên Google Drive qua API thành công và giải phóng dung lượng local!"
        }

    else:
        return {
            "success": False,
            "mode": "local_only",
            "message": "Chế độ lưu trữ hiện tại chỉ dùng Local."
        }


def sync_audio_to_drive(audio_path: str, title: str = "") -> Dict[str, Any]:
    """
    Tải file nhạc/âm thanh đã xử lý lên Google Drive và xóa file local để không tốn ổ cứng
    """
    status = get_drive_status()
    mode = status["mode"]
    if not status.get("is_ready"):
        return {"success": False, "message": "Google Drive chưa sẵn sàng"}

    if not audio_path or not os.path.exists(audio_path):
        raise FileNotFoundError(f"Không tìm thấy file audio: {audio_path}")

    filename = os.path.basename(audio_path)
    drive_filename = f"Audio_{title or 'track'}_{filename}" if title else f"Audio_{filename}"

    # MODE 1: Desktop
    if mode == "desktop":
        target_dir = status["desktop_folder"]
        audio_folder = os.path.join(target_dir, "AudioStudio")
        os.makedirs(audio_folder, exist_ok=True)
        dest_path = os.path.join(audio_folder, filename)
        shutil.copy2(audio_path, dest_path)
        try:
            os.remove(audio_path)
        except Exception:
            pass
        return {
            "success": True,
            "mode": "desktop",
            "drive_file_id": f"local_audio_{filename}",
            "drive_web_link": f"file:///{dest_path.replace(os.sep, '/')}",
            "dest_path": dest_path
        }

    # MODE 2: GAS
    elif mode == "gas":
        import base64
        gas_url = get_setting(DRIVE_GAS_URL_KEY, "")
        with open(audio_path, "rb") as f:
            file_b64 = base64.b64encode(f.read()).decode("utf-8")
        payload = {
            "folder_id": get_setting(DRIVE_TARGET_FOLDER_ID_KEY, "1rCzVtTIKWI_QeU8LWMefuZ0A9NYvpVeS"),
            "filename": drive_filename,
            "mime_type": "audio/mpeg",
            "file_base64": file_b64
        }
        res_data = _post_to_gas(gas_url, payload, retries=3, timeout=120)
        try:
            os.remove(audio_path)
        except Exception:
            pass
        return {
            "success": True,
            "mode": "gas",
            "drive_file_id": res_data.get("drive_file_id", ""),
            "drive_web_link": res_data.get("drive_web_link", "")
        }

    # MODE 3: API
    elif mode == "api" and GOOGLE_API_AVAILABLE:
        creds_json_str = get_setting(DRIVE_API_CREDS_KEY, "")
        creds_data = json.loads(creds_json_str)
        if "type" in creds_data and creds_data["type"] == "service_account":
            creds = service_account.Credentials.from_service_account_info(
                creds_data, scopes=['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']
            )
        else:
            creds = Credentials.from_authorized_user_info(
                creds_data, scopes=['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file']
            )
        service = build('drive', 'v3', credentials=creds)
        folder_id = get_setting(DRIVE_TARGET_FOLDER_ID_KEY, "")
        file_metadata = {'name': drive_filename}
        if folder_id:
            file_metadata['parents'] = [folder_id]
        media = MediaFileUpload(audio_path, mimetype='audio/mpeg', resumable=True)
        uploaded = service.files().create(body=file_metadata, media_body=media, supportsAllDrives=True, fields='id, webViewLink').execute()
        try:
            os.remove(audio_path)
        except Exception:
            pass
        return {
            "success": True,
            "mode": "api",
            "drive_file_id": uploaded.get("id"),
            "drive_web_link": uploaded.get("webViewLink")
        }

    return {"success": False, "message": "Không thể upload audio"}

