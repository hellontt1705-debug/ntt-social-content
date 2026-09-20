@echo off
chcp 65001 > nul
title SocialContent Backend API (FastAPI)
cd /d "%~dp0"
echo ==============================================================
echo   DANG CHAY BACKEND API (FastAPI) TAI http://127.0.0.1:8000
echo ==============================================================
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
