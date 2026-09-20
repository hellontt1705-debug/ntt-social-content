@echo off
chcp 65001 > nul
title SocialContent OS - Stop Services

echo ==============================================================
echo        DANG DUNG SOCIALCONTENT OS
echo ==============================================================
echo.

echo Dang tat Backend (port 8000) va Frontend (port 5173)...

:: 1. Tat tien trinh Backend chiem port 8000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":8000 " ^| findstr "LISTENING"') do (
    taskkill /f /t /pid %%a > nul 2>&1
)

:: 2. Tat tien trinh Frontend chiem port 5173
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":5173 " ^| findstr "LISTENING"') do (
    taskkill /f /t /pid %%a > nul 2>&1
)

:: 3. Dong cac cua so cmd co title SocialContent neu con sot
taskkill /f /fi "WINDOWTITLE eq SocialContent*" > nul 2>&1

echo [OK] Da dung tat ca cac tien trinh thanh cong!
echo.
pause
