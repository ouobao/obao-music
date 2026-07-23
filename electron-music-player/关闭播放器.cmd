@echo off
setlocal

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-dev.ps1"
if errorlevel 1 (
  echo.
  echo Failed to stop Electron music player.
  pause
  exit /b 1
)

echo.
pause
exit /b 0
