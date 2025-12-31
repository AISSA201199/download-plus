@echo off
title Tahmil Plus - Permanent Link (Ngrok)
color 0a
cls

echo.
echo ========================================================
echo     🚀 Starting Permanent Link...
echo     📌 Your Link: https://social-probably-liger.ngrok-free.app
echo ========================================================
echo.

:: Kill any stuck process
taskkill /F /IM ngrok.exe >nul 2>&1

echo [INFO] Connecting to Ngrok...
echo.

ngrok.exe http --url=social-probably-liger.ngrok-free.app 3000

pause
