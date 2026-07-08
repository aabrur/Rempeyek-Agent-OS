@echo off
REM ROADMAP #3 — wrapper 1-baris lapor telemetry. Pakai: report <id> "<task>" [progress] [detail]
node "%~dp0scripts\report.cjs" %*
