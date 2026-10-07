import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from services.drive_service import get_drive_api_service

service = get_drive_api_service()
file_id = "1tNovD0Xs-690IHIoKpfw-gSDBRVDjz3P"

try:
    f = service.files().get(fileId=file_id, fields="id, name, mimeType, thumbnailLink, webViewLink, webContentLink, permissions").execute()
    print("Drive file meta:", json.dumps(f, indent=2))
except Exception as e:
    print("Error:", e)
