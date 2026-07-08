#!/usr/bin/env node
/* ROADMAP #3 — lapor progres 1-baris ke telemetry (turunkan friksi → panel keisi).
   Pakai:  node scripts/report.cjs <id> "<nama task>" [progress 0-100] [detail...]
   Wrapper: report.cmd <id> "<nama task>" [progress] [detail...]
   progress: 0 → task_start · 100 → task_done · lainnya/kosong → task_progress
   id: claude-code | hermes | openclaw | zcode | copilot */
const fs = require("fs");
const path = require("path");

const [, , id, name, progressArg, ...rest] = process.argv;
if (!id || !name) {
  console.error('Usage: report <id> "<task>" [progress 0-100] [detail...]');
  console.error('Contoh: report hermes "Scan market BTC" 50 "2/4 exchange selesai"');
  process.exit(1);
}
const detail = rest.join(" ");
const hasProg = progressArg !== undefined && progressArg !== "";
const progress = hasProg ? Number(progressArg) : undefined;
if (hasProg && Number.isNaN(progress)) { console.error(`progress harus angka 0-100, dapat: ${progressArg}`); process.exit(1); }
const type = progress === 0 ? "task_start" : progress === 100 ? "task_done" : "task_progress";

const evt = { ts: new Date().toISOString(), type, name };
if (detail) evt.detail = detail;
if (progress !== undefined) evt.progress = progress;

const dir = path.join(__dirname, "..", "telemetry");
fs.mkdirSync(dir, { recursive: true });
fs.appendFileSync(path.join(dir, `${id}.jsonl`), JSON.stringify(evt) + "\n", "utf8");
console.log("reported →", `telemetry/${id}.jsonl`, JSON.stringify(evt));
