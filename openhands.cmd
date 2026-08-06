@echo off
setlocal
cd /d "%~dp0"
rem Resolve the upstream openhands from PATH entries only.
rem Avoid `where openhands` / calling "openhands" directly: the current directory is
rem searched first by Windows, so a local launcher would shadow the real CLI
rem and recurse into itself forever.
set "REALCMD="
for %%G in ("%PATH:;=" "%") do (
  if not defined REALCMD (
    if exist "%%~G\openhands.exe"  set "REALCMD=%%~G\openhands.exe"
    if exist "%%~G\openhands.cmd"  set "REALCMD=%%~G\openhands.cmd"
    if exist "%%~G\openhands.bat"  set "REALCMD=%%~G\openhands.bat"
  )
)
if not defined REALCMD (
  >&2 echo [Rempeyek Agent OS] openhands is registered but its upstream CLI is not installed.
  exit /b 9009
)
"%REALCMD%" %*
