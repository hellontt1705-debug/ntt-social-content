@echo off
chcp 65001 > nul
title SocialContent Studio Launcher

echo ======================================================================
echo           SOCIALCONTENT OS - ALL-IN-ONE STUDIO LAUNCHER
echo ======================================================================
echo.

set APP_DIR=%~dp0
cd /d "%APP_DIR%"

:: 1. Kiem tra moi truong Python va Node.js
echo [*] Kiem tra moi truong he thong...
where python > nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Khong tim thay Python trong PATH!
    echo Vui long cai dat Python 3.10+ va tich chon "Add to PATH".
    pause
    exit /b 1
)

where npm > nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Khong tim thay Node.js / npm trong PATH!
    echo Vui long cai dat Node.js 18+.
    pause
    exit /b 1
)

where ffmpeg > nul 2>&1
if %errorlevel% neq 0 (
    echo [CANH BAO] Khong tim thay FFmpeg trong PATH. Mot so tinh nang ghep audio/video co the bi anh huong.
)

:: 2. Tu dong kiem tra va cai dat thu vien neu thieu
if not exist "%APP_DIR%frontend\node_modules\" (
    echo [*] Phat hien chua cai dat thu vien Frontend. Dang chay npm install...
    cd /d "%APP_DIR%frontend"
    call npm install
    cd /d "%APP_DIR%"
)

python -c "import fastapi, uvicorn, yt_dlp" > nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Phat hien chua cai dat du thu vien Backend. Dang chay pip install...
    pip install -r "%APP_DIR%backend\requirements.txt"
)

:: 3. Tu dong giai phong tien trinh cu va port 8000, 5173
echo [*] Don dep tien trinh cu va giai phong cong mang (8000, 5173)...
taskkill /f /fi "WINDOWTITLE eq SocialContent Backend*" > nul 2>&1
taskkill /f /fi "WINDOWTITLE eq SocialContent Frontend*" > nul 2>&1

for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":8000 "') do (
    taskkill /f /t /pid %%a > nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":5173 "') do (
    taskkill /f /t /pid %%a > nul 2>&1
)
ping 127.0.0.1 -n 2 > nul

:: 4. Khoi dong Backend API (FastAPI)
echo [1/3] Dang khoi dong Backend API (FastAPI)...
start "SocialContent Backend API (FastAPI)" "%APP_DIR%backend\run_backend.bat"

echo [*] Cho Backend khoi dong (port 8000)...
python "%APP_DIR%backend\wait_port.py" 8000 35
if %errorlevel% equ 0 (
    echo [OK] Backend API da san sang tai http://127.0.0.1:8000 !
) else (
    echo [CANH BAO] Backend khoi dong cham hon du kien. Vui long kiem tra cua so "SocialContent Backend".
)

:: 5. Khoi dong Frontend (Vite React)
echo [2/3] Dang khoi dong Frontend Studio (Vite React)...
start "SocialContent Frontend (Vite React)" "%APP_DIR%frontend\run_frontend.bat"

echo [*] Cho Frontend khoi dong (port 5173)...
python "%APP_DIR%backend\wait_port.py" 5173 25
if %errorlevel% equ 0 (
    echo [OK] Frontend Studio da san sang tai http://localhost:5173 !
) else (
    echo [CANH BAO] Frontend khoi dong cham hon du kien. Vui long kiem tra cua so "SocialContent Frontend".
)

:: 6. Mo trinh duyet
echo [3/3] He thong da san sang! Dang mo trinh duyet...
start http://localhost:5173

echo.
echo ======================================================================
echo  [THANH CONG] HE THONG DA KHOI DONG THANH CONG!
echo  - Giao dien Web Studio: http://localhost:5173
echo  - Backend API va Docs:  http://127.0.0.1:8000/docs
echo.
echo  [Huong dan su dung]
echo  - Hai cua so Backend va Frontend dang chay song song duoi thanh taskbar.
echo  - De tat he thong: chay file stop_app.bat hoac dong 2 cua so do.
echo ======================================================================
echo.
pause
