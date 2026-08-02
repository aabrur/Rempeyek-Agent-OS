@echo off
setlocal
cd /d "C:\Users\abrur\AppData\Local\Rempeyek-Agent-OS"
where "cursor" >nul 2>nul
if errorlevel 1 (
  >&2 echo [Rempeyek Agent OS] cursor is registered but its upstream CLI is not installed.
  exit /b 9009
)
"cursor" %*
