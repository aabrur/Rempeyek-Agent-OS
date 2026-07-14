#!/usr/bin/env node
/* ROADMAP #3 — one-liner progress reporting to telemetry (lower friction → panels get filled).
   Usage:   node scripts/report.cjs <id> "<name>" [progress 0-100] [detail...]
            node scripts/report.cjs <id> "<name>" --type <type> [detail...]
   Wrapper: report.cmd <id> "<name>" [progress|--type <type>] [detail...]

   Default (progress inference, backward compatible):
     progress 0 → task_start · 100 → task_done · other/empty → task_progress
   Explicit --type opens the full vocabulary the dashboard panels read:
     subagent_start · subagent_done  → Subagents / Tasks panel (and, once agents target one
                                         another, the Agent Map)
     comm                            → agent-to-agent communication
     info                            → a non-task marker (registration, note)
   id: claude-code | hermes | openclaw | kilo-code | cline | pi | codex | antigravity

   Examples:
     report hermes "Scan BTC market" 50 "2/4 exchanges done"
     report claude-code "vault-indexer" --type subagent_start "spawned by Stage 5" */
const fs = require("fs");
const path = require("path");

const TYPES = new Set(["task_start", "task_progress", "task_done", "subagent_start", "subagent_done", "comm", "info"]);
const argv = process.argv.slice(2);
const id = argv.shift();
const name = argv.shift();
if (!id || !name) {
  console.error('Usage: report <id> "<name>" [progress 0-100 | --type <type>] [detail...]');
  console.error('Example: report hermes "Scan BTC market" 50 "2/4 exchanges done"');
  console.error(`Types:   ${[...TYPES].join(" | ")}`);
  process.exit(1);
}
let explicitType;
const typeIdx = argv.indexOf("--type");
if (typeIdx !== -1) {
  explicitType = argv[typeIdx + 1];
  argv.splice(typeIdx, 2);
  if (!TYPES.has(explicitType)) { console.error(`--type must be one of: ${[...TYPES].join(" | ")}`); process.exit(1); }
}
const progressArg = explicitType ? undefined : argv.shift();
const detail = argv.join(" ");
const hasProg = progressArg !== undefined && progressArg !== "";
const progress = hasProg ? Number(progressArg) : undefined;
if (hasProg && Number.isNaN(progress)) { console.error(`progress must be a number 0-100, got: ${progressArg}`); process.exit(1); }
const type = explicitType || (progress === 0 ? "task_start" : progress === 100 ? "task_done" : "task_progress");

const evt = { ts: new Date().toISOString(), type, name };
if (detail) evt.detail = detail;
if (progress !== undefined) evt.progress = progress;

const dir = path.join(__dirname, "..", "telemetry");
fs.mkdirSync(dir, { recursive: true });
fs.appendFileSync(path.join(dir, `${id}.jsonl`), JSON.stringify(evt) + "\n", "utf8");
console.log("reported →", `telemetry/${id}.jsonl`, JSON.stringify(evt));
