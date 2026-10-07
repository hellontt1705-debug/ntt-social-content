import os, sys, asyncio
if sys.platform == "win32":
    try: sys.stdout.reconfigure(encoding='utf-8')
    except: pass

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from services.downloader import scrape_video_metadata

async def main():
    url = "https://www.tiktok.com/@leeyoungbee/video/7689883422164012308"
    meta = await scrape_video_metadata(url)
    print("Scrape result:")
    for k, v in meta.items():
        if k in ["title", "uploader", "thumbnail_url", "local_thumbnail", "platform"]:
            print(f"  {k}: {v}")

asyncio.run(main())
