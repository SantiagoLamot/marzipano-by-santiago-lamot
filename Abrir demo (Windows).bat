@echo off
rem Doble click para abrir la demo en el navegador.
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node servidor.js "." "/marzipano-walk/demo/"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
)
pause
