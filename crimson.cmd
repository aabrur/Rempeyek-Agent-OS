@echo off
setlocal
cd /d "%~dp0"
rem Resolve the upstream crimson from PATH entries only.
rem Avoid `where crimson` / calling "crimson" directly: the current directory is
rem searched first by Windows, so a local launcher would shadow the real CLI
rem and recurse into itself forever.
set "REALCMD="
for %%G in ("%PATH:;=" "%") do (
  if not defined REALCMD (
    if exist "%%~G\crimson.exe"  set "REALCMD=%%~G\crimson.exe"
    if exist "%%~G\crimson.cmd"  set "REALCMD=%%~G\crimson.cmd"
    if exist "%%~G\crimson.bat"  set "REALCMD=%%~G\crimson.bat"
  )
)
if not defined REALCMD (
  >&2 echo [Rempeyek Agent OS] crimson is registered but its upstream CLI is not installed.
  exit /b 9009
)
"%REALCMD%" %*
