@echo off
setlocal
cd /d "C:\Users\abrur\AppData\Local\Rempeyek-Agent-OS"
where "opencode" >nul 2>nul
if errorlevel 1 (
  >&2 echo [Rempeyek Agent OS] opencode is registered but its upstream CLI is not installed.
  exit /b 9009
)
"opencode" %*
