@echo off
chcp 65001 > nul
title SocialContent OS - Studio Launcher

echo ==============================================================
echo        KHOI DONG SOCIALCONTENT OS - STUDIO
echo ==============================================================
echo.

set APP_DIR=%~dp0
cd /d "%APP_DIR%"

:: 1. Kiem tra moi truong Python va Node.js
where python > nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Khong tim thay Python trong PATH. Vui long cai dat Python 3.10+ va tich vao "Add to PATH".
    pause
    exit /b 1
)

where npm > nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Khong tim thay Node.js/npm trong PATH. Vui long cai dat Node.js 18+.
    pause
    exit /b 1
)

:: 2. Tu dong giai phong port 8000 va 5173 neu co tien trinh cu dang chay ngam
echo [*] Kiem tra va giai phong port cu (8000, 5173)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":8000 " ^| findstr "LISTENING"') do (
    taskkill /f /t /pid %%a > nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":5173 " ^| findstr "LISTENING"') do (
    taskkill /f /t /pid %%a > nul 2>&1
)

:: 3. Khoi dong Backend API (FastAPI)
echo [1/3] Dang khoi dong Backend API (FastAPI)...
start "SocialContent Backend" "%APP_DIR%backend\run_backend.bat"

timeout /t 2 /nobreak > nul

:: 4. Khoi dong Frontend (Vite React)
echo [2/3] Dang khoi dong Frontend (Vite React)...
start "SocialContent Frontend" "%APP_DIR%frontend\run_frontend.bat"

echo [3/3] Dang cho he thong khoi dong va mo trinh duyet...
timeout /t 6 /nobreak > nul

:: 5. Mo trinh duyet
start http://localhost:5173

echo.
echo ==============================================================
echo  HE THONG DA KHOI DONG THANH CONG!
echo  - Giao dien Web App: http://localhost:5173
echo  - Backend API ^& Docs: http://127.0.0.1:8000/docs
echo.
echo  Luu y:
echo  - Hai cua so Backend va Frontend dang chay song song.
echo  - De tat he thong: chay file stop_app.bat hoac dong 2 cua so do.
echo ==============================================================
echo.
pause
