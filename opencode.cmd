@echo off
setlocal
cd /d "%~dp0"
rem Resolve the upstream opencode from PATH entries only.
rem Avoid `where opencode` / calling "opencode" directly: the current directory is
rem searched first by Windows, so a local launcher would shadow the real CLI
rem and recurse into itself forever.
set "REALCMD="
for %%G in ("%PATH:;=" "%") do (
  if not defined REALCMD (
    if exist "%%~G\opencode.exe"  set "REALCMD=%%~G\opencode.exe"
    if exist "%%~G\opencode.cmd"  set "REALCMD=%%~G\opencode.cmd"
    if exist "%%~G\opencode.bat"  set "REALCMD=%%~G\opencode.bat"
  )
)
if not defined REALCMD (
  >&2 echo [Rempeyek Agent OS] opencode is registered but its upstream CLI is not installed.
  exit /b 9009
)
"%REALCMD%" %*
