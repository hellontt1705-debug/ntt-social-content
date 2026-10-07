@echo off
chcp 65001 > nul
title SocialContent Frontend (Vite React)
cd /d "%~dp0"
echo ==============================================================
echo   DANG CHAY FRONTEND (Vite) TAI http://localhost:5173
echo ==============================================================
call npm run dev
pause
