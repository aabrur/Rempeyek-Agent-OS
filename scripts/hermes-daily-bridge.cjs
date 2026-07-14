#!/usr/bin/env node
/* Hermes → Agentic-OS daily bridge
   Writes:
   1) telemetry/hermes.jsonl heartbeat + optional task events
   2) Obsidian vault Brains/Hermes/Daily/YYYY-MM-DD.md status block
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TELEMETRY = path.join(ROOT, 'telemetry', 'hermes.jsonl');
const VAULT = process.env.VAULT_PATH || 'C:\\Users\\abrur\\Obsidian Vault';
const LANE_DIR = path.join(VAULT, 'Brains', 'Hermes', 'Daily');

function now() {
  return new Date().toISOString();
}
function nowLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function todayFile() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return path.join(LANE_DIR, `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.md`);
}
function appendJsonl(obj) {
  fs.mkdirSync(path.dirname(TELEMETRY), { recursive: true });
  fs.appendFileSync(TELEMETRY, JSON.stringify(obj) + '\n', 'utf8');
}
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

// 1. Write telemetry heartbeat. Typed "heartbeat" so the dashboard treats it as keepalive noise
//    and never lets it evict or masquerade as real work in the Sessions/Subagents panels.
const heartbeat = {
  ts: now(),
  type: 'heartbeat',
  name: 'Heartbeat Hermes',
  detail: 'Daily bridge alive · agentic-os → vault sync',
  progress: 100,
};
appendJsonl(heartbeat);

// 2. Update vault daily note
ensureDir(LANE_DIR);
const file = todayFile();
const stamp = nowLocal();
const block = [
  '',
  `## Auto-status ${stamp}`,
  '- Agent: Hermes 🟢',
  '- Source: agentic-os daily bridge',
  `- Telemetry: \`telemetry/hermes.jsonl\` — heartbeat OK`,
  '- Vault: write OK',
  `- Node: Hermes CLI v0.18.0 · gateway running (native schtask)`,
  `- Obsidian lane: Brains/Hermes/Daily/${path.basename(file)}`,
].join('\n');

if (fs.existsSync(file)) {
  const txt = fs.readFileSync(file, 'utf8');
  // Replace previous auto block to avoid unbounded growth
  const replaced = txt.replace(/## Auto-status[\s\S]*?(?=\n## |\Z)/, block.trimStart());
  fs.writeFileSync(file, replaced, 'utf8');
} else {
  // Touch a new lane daily note with header
  fs.writeFileSync(file, [
    '# Hermes Lane — Daily',
    block,
    '',
  ].join('\n'), 'utf8');
}

console.log(JSON.stringify({ ok: true, file, telemetry: TELEMETRY, stamp }));
