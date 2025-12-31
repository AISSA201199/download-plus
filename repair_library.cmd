@echo off
color 0a
cls
echo ===================================================
echo     YOUTUBE DOWNLOADER - LIBRARY REPAIR TOOL
echo ===================================================
echo.
echo [1/4] STOPPING SERVER...
taskkill /F /IM node.exe >nul 2>&1
echo Done.
echo.

echo [2/4] CHECKING DOWNLOADS FOLDER...
if not exist "downloads" (
    echo Downloads folder missing. Creating it...
    mkdir "downloads"
) else (
    echo Downloads folder exists.
)
echo.

echo [3/4] CLEANING JUNK FILES (.part, .temp)...
del /s /q "downloads\*.part" >nul 2>&1
del /s /q "downloads\*.ytdl" >nul 2>&1
del /s /q "downloads\*.temp" >nul 2>&1
echo Done.
echo.

echo [4/4] RESTARTING SERVER...
echo The application will restart in a new window.
start cmd /k "node server.js"
echo.

echo ===================================================
echo     REPAIR COMPLETE! YOU CAN CLOSE THIS WINDOW
echo ===================================================
timeout /t 5 >nul
exit
