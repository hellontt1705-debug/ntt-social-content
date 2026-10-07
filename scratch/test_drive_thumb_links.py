import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from services.drive_service import get_drive_api_service

service = get_drive_api_service()
file_ids = [
    "1tNovD0Xs-690IHIoKpfw-gSDBRVDjz3P",
    "14a-wji_3_MnMTiYcfMKjPGYPJibltHWT",
    "11bCThNSZmEfIz4uGKQ4UFSQtEeUDCDRv",
    "1GkFZ88TRoEFzRyyPf4GIX-CkKMEVJRof"
]

for fid in file_ids:
    try:
        f = service.files().get(fileId=fid, fields="id, name, thumbnailLink").execute()
        print(f"ID {fid}: {f.get('name')} -> {f.get('thumbnailLink')}")
    except Exception as e:
        print(f"ID {fid} error: {e}")
