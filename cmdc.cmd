@echo off
setlocal
cd /d "%~dp0"
rem Resolve the upstream cmdc from PATH entries only.
rem Avoid `where cmdc` / calling "cmdc" directly: the current directory is
rem searched first by Windows, so a local launcher would shadow the real CLI
rem and recurse into itself forever.
set "REALCMD="
for %%G in ("%PATH:;=" "%") do (
  if not defined REALCMD (
    if exist "%%~G\cmdc.exe"  set "REALCMD=%%~G\cmdc.exe"
    if exist "%%~G\cmdc.cmd"  set "REALCMD=%%~G\cmdc.cmd"
    if exist "%%~G\cmdc.bat"  set "REALCMD=%%~G\cmdc.bat"
  )
)
if not defined REALCMD (
  >&2 echo [Rempeyek Agent OS] cmdc is registered but its upstream CLI is not installed.
  exit /b 9009
)
"%REALCMD%" %*
