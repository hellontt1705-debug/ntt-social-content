import os
import sys
import time
import socket
import subprocess
import webbrowser

APP_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(APP_DIR, "backend")
FRONTEND_DIR = os.path.join(APP_DIR, "frontend")

def is_port_open(port: int) -> bool:
    for host in ("127.0.0.1", "localhost"):
        try:
            s = socket.create_connection((host, port), timeout=0.8)
            s.close()
            return True
        except Exception:
            pass
    return False

def wait_for_port(port: int, name: str, timeout: int = 35) -> bool:
    print(f"[*] Cho {name} khoi dong (port {port})...", end="", flush=True)
    t0 = time.time()
    while time.time() - t0 < timeout:
        if is_port_open(port):
            print(" [OK]")
            return True
        print(".", end="", flush=True)
        time.sleep(1.0)
    print(" [CANH BAO: Qua thoi gian cho]")
    return False

def free_ports():
    print("[*] Don dep va giai phong port 8000, 5173 neu co...")
    if sys.platform == "win32":
        try:
            subprocess.run('taskkill /f /fi "WINDOWTITLE eq SocialContent Backend*"', shell=True, capture_output=True)
            subprocess.run('taskkill /f /fi "WINDOWTITLE eq SocialContent Frontend*"', shell=True, capture_output=True)
            for port in [8000, 5173]:
                cmd = f'for /f "tokens=5" %a in (\'netstat -aon ^| findstr /r /c:":{port} "\') do taskkill /f /t /pid %a'
                subprocess.run(cmd, shell=True, capture_output=True)
        except Exception:
            pass

def main():
    print("=" * 70)
    print("           SOCIALCONTENT OS - ALL-IN-ONE STUDIO LAUNCHER")
    print("=" * 70)
    print()

    free_ports()
    time.sleep(1)

    print("[1/3] Dang khoi dong Backend API (FastAPI)...")
    backend_bat = os.path.join(BACKEND_DIR, "run_backend.bat")
    subprocess.Popen(f'start "SocialContent Backend API (FastAPI)" "{backend_bat}"', shell=True)

    wait_for_port(8000, "Backend API", timeout=35)

    print("[2/3] Dang khoi dong Frontend Studio (Vite React)...")
    frontend_bat = os.path.join(FRONTEND_DIR, "run_frontend.bat")
    subprocess.Popen(f'start "SocialContent Frontend (Vite React)" "{frontend_bat}"', shell=True)

    wait_for_port(5173, "Frontend Studio", timeout=25)

    print("[3/3] He thong da san sang! Dang mo trinh duyet...")
    webbrowser.open("http://localhost:5173")

    print()
    print("=" * 70)
    print(" [THANH CONG] HE THONG DA KHOI DONG THANH CONG!")
    print(" - Giao dien Web Studio: http://localhost:5173")
    print(" - Backend API va Docs:  http://127.0.0.1:8000/docs")
    print()
    print(" [Huong dan su dung]")
    print(" - Hai cua so Backend va Frontend dang chay song song.")
    print(" - De tat he thong: chay file stop_app.bat hoac dong 2 cua so do.")
    print("=" * 70)
    print()
    try:
        input("Nhan Enter de thoat cua so Launcher nay (cac dich vu van chay tiep)...")
    except Exception:
        pass

if __name__ == "__main__":
    main()
