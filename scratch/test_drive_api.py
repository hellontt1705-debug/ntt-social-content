import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from services.drive_service import get_drive_api_service

service = get_drive_api_service()
print("Drive API service:", service)
if service:
    try:
        about = service.about().get(fields="user, storageQuota").execute()
        print("About Drive:", json.dumps(about, indent=2))
    except Exception as e:
        print("Error getting about:", e)
