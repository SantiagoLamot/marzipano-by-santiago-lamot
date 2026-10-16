@echo off
rem Doble click para abrir el editor de tours en el navegador.
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node servidor.js "." "/editor/" --editor
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1" -Ruta "/editor/" -Editor
)
pause
