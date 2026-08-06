@echo off
setlocal
cd /d "%~dp0"
rem Resolve the upstream copilot from PATH entries only.
rem Avoid `where copilot` / calling "copilot" directly: the current directory is
rem searched first by Windows, so a local launcher would shadow the real CLI
rem and recurse into itself forever.
set "REALCMD="
for %%G in ("%PATH:;=" "%") do (
  if not defined REALCMD (
    if exist "%%~G\copilot.exe"  set "REALCMD=%%~G\copilot.exe"
    if exist "%%~G\copilot.cmd"  set "REALCMD=%%~G\copilot.cmd"
    if exist "%%~G\copilot.bat"  set "REALCMD=%%~G\copilot.bat"
  )
)
if not defined REALCMD (
  >&2 echo [Rempeyek Agent OS] copilot is registered but its upstream CLI is not installed.
  exit /b 9009
)
"%REALCMD%" %*
