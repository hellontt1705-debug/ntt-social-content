@echo off
chcp 65001 > nul
title SocialContent OS - Stop Services

echo ==============================================================
echo        DANG DUNG SOCIALCONTENT OS
echo ==============================================================
echo.

echo Dang tat Backend (port 8000) va Frontend (port 5173)...

:: 1. Dong cac cua so cmd co title SocialContent Backend, Frontend, Launcher
taskkill /f /fi "WINDOWTITLE eq SocialContent Backend*" > nul 2>&1
taskkill /f /fi "WINDOWTITLE eq SocialContent Frontend*" > nul 2>&1
taskkill /f /fi "WINDOWTITLE eq SocialContent Studio Launcher*" > nul 2>&1

:: 2. Tat tien trinh chiem port 8000 (bat ke trang thai nao)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":8000 "') do (
    taskkill /f /t /pid %%a > nul 2>&1
)

:: 3. Tat tien trinh chiem port 5173 (bat ke trang thai nao)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":5173 "') do (
    taskkill /f /t /pid %%a > nul 2>&1
)

echo.
echo [OK] Da dung tat ca cac tien trinh thanh cong!
echo.
if "%1" neq "/quiet" (
    pause
)
