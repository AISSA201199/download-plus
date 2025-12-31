@echo off
echo Stopping old server instances...
taskkill /F /IM node.exe >nul 2>&1
echo Starting YouTube Downloader Server...
echo Please leave this window open!
node server.js
pause
