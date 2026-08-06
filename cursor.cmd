@echo off
setlocal
cd /d "%~dp0"
rem Resolve the upstream cursor from PATH entries only.
rem Avoid `where cursor` / calling "cursor" directly: the current directory is
rem searched first by Windows, so a local launcher would shadow the real CLI
rem and recurse into itself forever.
set "REALCMD="
for %%G in ("%PATH:;=" "%") do (
  if not defined REALCMD (
    if exist "%%~G\cursor.exe"  set "REALCMD=%%~G\cursor.exe"
    if exist "%%~G\cursor.cmd"  set "REALCMD=%%~G\cursor.cmd"
    if exist "%%~G\cursor.bat"  set "REALCMD=%%~G\cursor.bat"
  )
)
if not defined REALCMD (
  >&2 echo [Rempeyek Agent OS] cursor is registered but its upstream CLI is not installed.
  exit /b 9009
)
"%REALCMD%" %*
