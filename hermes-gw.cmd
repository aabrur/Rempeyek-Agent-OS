@echo off
set "HERMES=C:\Users\abrur\AppData\Local\hermes\hermes-agent\venv\Scripts\hermes.exe"
if "%~1"=="run" (
  shift
  goto use
)
if "%~1"=="help" goto use
if "%~1"=="" goto use
for %%a in (%*) do (
  "%HERMES%" gateway %%~a
)
goto :eof
:use
"%HERMES%" gateway %*