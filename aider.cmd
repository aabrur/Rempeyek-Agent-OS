@echo off
setlocal
cd /d "%~dp0"
rem Resolve the upstream aider from PATH entries only.
rem Avoid `where aider` / calling "aider" directly: the current directory is
rem searched first by Windows, so a local launcher would shadow the real CLI
rem and recurse into itself forever.
set "REALCMD="
for %%G in ("%PATH:;=" "%") do (
  if not defined REALCMD (
    if exist "%%~G\aider.exe"  set "REALCMD=%%~G\aider.exe"
    if exist "%%~G\aider.cmd"  set "REALCMD=%%~G\aider.cmd"
    if exist "%%~G\aider.bat"  set "REALCMD=%%~G\aider.bat"
  )
)
if not defined REALCMD (
  >&2 echo [Rempeyek Agent OS] aider is registered but its upstream CLI is not installed.
  exit /b 9009
)
"%REALCMD%" %*
