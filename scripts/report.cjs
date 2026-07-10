#!/usr/bin/env node
/* ROADMAP #3 — one-liner progress reporting to telemetry (lower friction → panels get filled).
   Usage:   node scripts/report.cjs <id> "<task name>" [progress 0-100] [detail...]
   Wrapper: report.cmd <id> "<task name>" [progress] [detail...]
   progress: 0 → task_start · 100 → task_done · other/empty → task_progress
   id: claude-code | hermes | openclaw | zcode | kimi-code | copilot | antigravity */
const fs = require("fs");
const path = require("path");

const [, , id, name, progressArg, ...rest] = process.argv;
if (!id || !name) {
  console.error('Usage: report <id> "<task>" [progress 0-100] [detail...]');
  console.error('Example: report hermes "Scan BTC market" 50 "2/4 exchanges done"');
  process.exit(1);
}
const detail = rest.join(" ");
const hasProg = progressArg !== undefined && progressArg !== "";
const progress = hasProg ? Number(progressArg) : undefined;
if (hasProg && Number.isNaN(progress)) { console.error(`progress must be a number 0-100, got: ${progressArg}`); process.exit(1); }
const type = progress === 0 ? "task_start" : progress === 100 ? "task_done" : "task_progress";

const evt = { ts: new Date().toISOString(), type, name };
if (detail) evt.detail = detail;
if (progress !== undefined) evt.progress = progress;

const dir = path.join(__dirname, "..", "telemetry");
fs.mkdirSync(dir, { recursive: true });
fs.appendFileSync(path.join(dir, `${id}.jsonl`), JSON.stringify(evt) + "\n", "utf8");
console.log("reported →", `telemetry/${id}.jsonl`, JSON.stringify(evt));
