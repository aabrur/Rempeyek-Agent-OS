@echo off
setlocal
cd /d "%~dp0"
rem Resolve the upstream grok from PATH entries only.
rem Avoid `where grok` / calling "grok" directly: the current directory is
rem searched first by Windows, so a local launcher would shadow the real CLI
rem and recurse into itself forever.
set "REALCMD="
for %%G in ("%PATH:;=" "%") do (
  if not defined REALCMD (
    if exist "%%~G\grok.exe"  set "REALCMD=%%~G\grok.exe"
    if exist "%%~G\grok.cmd"  set "REALCMD=%%~G\grok.cmd"
    if exist "%%~G\grok.bat"  set "REALCMD=%%~G\grok.bat"
  )
)
if not defined REALCMD (
  >&2 echo [Rempeyek Agent OS] grok is registered but its upstream CLI is not installed.
  exit /b 9009
)
"%REALCMD%" %*
