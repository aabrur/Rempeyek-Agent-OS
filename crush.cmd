@echo off
setlocal
cd /d "%~dp0"
rem Resolve the upstream crush from PATH entries only.
rem Avoid `where crush` / calling "crush" directly: the current directory is
rem searched first by Windows, so a local launcher would shadow the real CLI
rem and recurse into itself forever.
set "REALCMD="
for %%G in ("%PATH:;=" "%") do (
  if not defined REALCMD (
    if exist "%%~G\crush.exe"  set "REALCMD=%%~G\crush.exe"
    if exist "%%~G\crush.cmd"  set "REALCMD=%%~G\crush.cmd"
    if exist "%%~G\crush.bat"  set "REALCMD=%%~G\crush.bat"
  )
)
if not defined REALCMD (
  >&2 echo [Rempeyek Agent OS] crush is registered but its upstream CLI is not installed.
  exit /b 9009
)
"%REALCMD%" %*
