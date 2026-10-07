@echo off
chcp 65001 > nul
title SocialContent Desktop Floating Widget
cd /d "%~dp0"
echo ==============================================================
echo   DANG CHAY CỬA SỔ NỔI WIDGET (TU DONG BAT CLIPBOARD)
echo ==============================================================
start pythonw desktop_widget.py
exit
