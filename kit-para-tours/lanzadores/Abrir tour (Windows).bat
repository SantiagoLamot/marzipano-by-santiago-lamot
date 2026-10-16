@echo off
rem Doble click para abrir el tour en el navegador.
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node servidor.js "." "/"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
)
pause
