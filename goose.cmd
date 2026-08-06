@echo off
setlocal
cd /d "%~dp0"
rem Resolve the upstream goose from PATH entries only.
rem Avoid `where goose` / calling "goose" directly: the current directory is
rem searched first by Windows, so a local launcher would shadow the real CLI
rem and recurse into itself forever.
set "REALCMD="
for %%G in ("%PATH:;=" "%") do (
  if not defined REALCMD (
    if exist "%%~G\goose.exe"  set "REALCMD=%%~G\goose.exe"
    if exist "%%~G\goose.cmd"  set "REALCMD=%%~G\goose.cmd"
    if exist "%%~G\goose.bat"  set "REALCMD=%%~G\goose.bat"
  )
)
if not defined REALCMD (
  >&2 echo [Rempeyek Agent OS] goose is registered but its upstream CLI is not installed.
  exit /b 9009
)
"%REALCMD%" %*
