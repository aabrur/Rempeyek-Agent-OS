@echo off
REM ROADMAP #3 — one-liner telemetry report wrapper. Usage: report <id> "<task>" [progress] [detail]
node "%~dp0scripts\report.cjs" %*
