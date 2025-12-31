@echo off
title Tahmil Plus - Public Link 🚀
color 0a
cls

echo.
echo [STARTING] Launching Cloudflare Tunnel...
echo.

:: Kill any stuck process
taskkill /F /IM cloudflared.exe >nul 2>&1

:: Check if file exists
if not exist cloudflared.exe (
    echo [ERROR] cloudflared.exe not found!
    echo [FIX] Downloading it again...
    powershell -Command "Invoke-WebRequest -Uri https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe -OutFile cloudflared.exe"
)

echo [INFO] Generating Link...
echo.
echo ========================================================
echo      Look for "https://....trycloudflare.com" below
echo ========================================================
echo.

cloudflared.exe tunnel --url http://localhost:3000

pause
