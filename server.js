/* Agentic OS â€” zero-dependency Node server.
   Dashboard live dari Obsidian Vault + launcher gateway agent.
   Jalankan: npm run dev  â†’  http://localhost:4321
   Remote:   set DASH_TOKEN=rahasia  â†’  akses wajib pakai token. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");
const crypto = require("crypto");

/* muat .env (KEY=VALUE per baris; env var asli menang atas isi file) */
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const PORT = process.env.PORT || 4321;
const VAULT = process.env.VAULT_PATH || "C:\\Users\\abrur\\Obsidian Vault";
const CONFIG_PATH = process.env.AGENTS_CONFIG || path.join(__dirname, "agents.config.json");
const TOKEN = process.env.DASH_TOKEN || "";
const PUBLIC = path.join(__dirname, "public");
const IGNORE = new Set([".git", ".obsidian", "Assets", "node_modules"]);
const DAY = 86400000;
const LOG_MAX = 800;
const AVATAR_DIR = path.join(PUBLIC, "avatars");
const TELEMETRY_DIR = path.join(__dirname, "telemetry");
const CLAUDE_PROJECTS = "C:\\Users\\abrur\\.claude\\projects";
for (const d of [AVATAR_DIR, TELEMETRY_DIR]) { try { fs.mkdirSync(d, { recursive: true }); } catch {} }

/* loadConfig: memoize by mtime (B6) + tahan config rusak mid-edit â†’ return last-good (R10) */
let _cfgCache = { mtime: 0, data: null };
function loadConfig() {
  try {
    const st = fs.statSync(CONFIG_PATH);
    if (_cfgCache.data && st.mtimeMs === _cfgCache.mtime) return _cfgCache.data;
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    _cfgCache = { mtime: st.mtimeMs, data };
    return data;
  } catch (e) {
    if (_cfgCache.data) { console.error("[config] parse gagal, pakai last-good:", e.message); return _cfgCache.data; }
    throw e;
  }
}

/* ---------------- vault scan (view: Command Center) ---------------- */
function walk(dir, out = [], base = dir, depth = 0) {
  if (depth > 100) return out;               // R14: cegah rekursi tak henti (nest dalam)
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (IGNORE.has(e.name) || e.name.startsWith(".")) continue;
    if (e.isSymbolicLink()) continue;        // R14: skip symlink/junction â†’ cegah loop
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out, base, depth + 1);
    else if (e.name.endsWith(".md")) {
      let st; try { st = fs.statSync(full); } catch { continue; }
      out.push({ rel: path.relative(base, full).replace(/\\/g, "/"), mtime: st.mtimeMs });
    }
  }
  return out;
}

/* snapshot vault ber-TTL pendek: dedupe re-walk saat banyak endpoint/tab minta dalam 1 tick (B1/B3) */
let _walkCache = { t: 0, data: null };
function walkVault() {
  if (_walkCache.data && Date.now() - _walkCache.t < 3000) return _walkCache.data;
  _walkCache = { t: Date.now(), data: walk(VAULT) };
  return _walkCache.data;
}

function agentVaultStatus(files, agent) {
  let last = 0, lastFile = null;
  for (const f of files) {
    const hit = (agent.lane && f.rel.startsWith(`Brains/${agent.lane}/`)) ||
      (f.rel.startsWith("Daily/") && f.rel.toLowerCase().includes(agent.id.replace("-", "")));
    if (hit && f.mtime > last) { last = f.mtime; lastFile = f.rel; }
  }
  const days = last ? Math.floor((Date.now() - last) / DAY) : null;
  return {
    vaultStatus: days === null ? "idle" : days === 0 ? "working" : days <= 2 ? "waiting" : "idle",
    lastFile, lastSeen: last ? new Date(last).toISOString().slice(0, 10) : null,
  };
}

function openTasks() {
  const items = [];
  let names = [];
  try { names = fs.readdirSync(path.join(VAULT, "Tasks")).filter(n => n.endsWith(".md")); } catch {}
  for (const n of names) {
    let text; try { text = fs.readFileSync(path.join(VAULT, "Tasks", n), "utf8"); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*[-*] \[ \]\s+(.*)/);
      if (m) items.push({ text: m[1].slice(0, 120), source: `Tasks/${n}` });
    }
  }
  return items;
}

function buildState() {
  const cfg = loadConfig();
  const files = walkVault();
  const now = Date.now();
  const tasks = openTasks();
  const inbox = files.filter(f => f.rel.startsWith("00 Inbox/"));
  const projects = files.filter(f => f.rel.startsWith("Projects/") && f.rel.split("/").length === 2)
    .sort((a, b) => b.mtime - a.mtime)
    .map(f => ({ name: f.rel.replace("Projects/", "").replace(".md", ""), rel: f.rel, updated: new Date(f.mtime).toISOString().slice(0, 10) }));
  return {
    vault: VAULT,
    agency: cfg.agency || "AGENTIC//OS",
    generatedAt: new Date().toISOString(),
    stats: {
      notes: { value: files.length, label: "Total catatan vault" },
      activeWeek: { value: files.filter(f => now - f.mtime < 7 * DAY).length, label: "Catatan diubah 7 hari terakhir" },
      openTasks: { value: tasks.length, label: "Checkbox terbuka di Tasks/" },
      projects: { value: projects.length, label: "Project note aktif" },
    },
    agents: cfg.agents.map(a => ({ ...a, gateway: undefined, actions: gwActions(a), canSummon: !!(a.gateway && a.gateway.home && a.gateway.trigger), ...agentVaultStatus(files, a), proc: procInfo(a.id), avatar: avatarUrl(a.id) })),
    review: [
      ...inbox.map(f => ({ title: f.rel.split("/").pop().replace(".md", ""), meta: f.rel, kind: "inbox" })),
      ...tasks.slice(0, 6).map(t => ({ title: t.text, meta: t.source, kind: "task" })),
    ],
    projects,
    knowledge: [...files].sort((a, b) => b.mtime - a.mtime).slice(0, 12)
      .map(f => ({ rel: f.rel, updated: new Date(f.mtime).toISOString().slice(0, 10) })),
  };
}

/* ---------------- gateway controller ----------------
   Dashboard memanggil command gateway ASLI tiap agent (start/stop/restart/status/run).
   - start/stop/restart/status : command pendek (jalan â†’ tampung output â†’ selesai),
     dikelola OS service manager (schtasks/systemd) â†’ tetap hidup walau dashboard ditutup.
   - run : foreground, di-own dashboard (log live), berhenti saat dashboard/tombol stop.
   procs = proses `run` yang di-own dashboard. gwCache = hasil status terakhir per agent. */
const procs = new Map();   // id -> {child,pid,log:[],seq,status,startedAt,exitCode}
const gwCache = new Map();  // id -> {running,text,at,exitCode}

function agentById(id) { return loadConfig().agents.find(a => a.id === id); }
function gwActions(agent) { return (agent && agent.gateway && agent.gateway.actions) || []; }

function detectRunning(text) {
  const t = (text || "").toLowerCase();
  if (/not running|tidak (sedang )?jalan|belum jalan|\bstopped\b|\binactive\b|no gateway|not installed|no running/.test(t)) return false;
  if (/\brunning\b|\bactive\b|\bpid[:\s#]*\d|listening on|is up\b/.test(t)) return true;
  return false;
}

function procInfo(id) {
  const p = procs.get(id);
  const c = gwCache.get(id);
  // proses run yang di-own dashboard menang kalau masih hidup
  if (p && p.status === "running")
    return { status: "running", mode: "owned", pid: p.pid, startedAt: p.startedAt, exitCode: null, logSize: p.seq, reason: null, statusText: c && c.text || null, checkedAt: c && new Date(c.at).toISOString() || null };
  let reason = null;
  if (p && (p.status === "exited" || p.status === "error")) {
    const out = p.log.filter(l => l.s === "out" || l.s === "err");
    reason = (out.length ? out[out.length - 1].line : (p.log.length ? p.log[p.log.length - 1].line : "")).slice(0, 140);
  }
  if (c) {
    const firstLine = c.text ? c.text.split(/\r?\n/).find(l => l.trim()) || "" : "";
    return { status: c.running ? "running" : "stopped", mode: "service", exitCode: c.exitCode, logSize: p ? p.seq : 0,
      reason: reason || (!c.running ? firstLine.slice(0, 140) : null), statusText: c.text, checkedAt: new Date(c.at).toISOString() };
  }
  if (p) return { status: p.status, mode: "owned", pid: p.pid, startedAt: p.startedAt, exitCode: p.exitCode, logSize: p.seq, reason, statusText: null };
  return { status: "off" };
}

function pushLog(p, stream, chunk) {
  try {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      p.log.push({ i: p.seq++, t: new Date().toISOString().slice(11, 19), s: stream, line: line.slice(0, 500) });
      if (p.log.length > LOG_MAX) p.log.splice(0, p.log.length - LOG_MAX);
    }
  } catch (e) { /* R19: jangan biarkan throw di event 'data' escape handler */ }
}

/* R2: tree-kill konsisten (Win: taskkill /T, POSIX: kill process group) â€” dipakai owned-run & timeout gwCtl */
function killTree(pid, child) {
  if (!pid) { try { child && child.kill(); } catch {} return; }
  if (process.platform === "win32") { try { execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => {}); } catch {} }
  else { try { process.kill(-pid, "SIGKILL"); } catch { try { child && child.kill(); } catch {} } }
}

/* command pendek: start/stop/restart/status â†’ jalankan `<bin> <action>`, tampung output */
function gwCtl(id, action, cb) {
  const agent = agentById(id);
  if (!agent) return cb({ error: `agent '${id}' tidak dikenal` });
  const g = agent.gateway;
  if (!agent.enabled || !g || !g.bin) return cb({ error: agent.note || `gateway '${id}' belum siap (enabled:false)` });
  if (!gwActions(agent).includes(action)) return cb({ error: `aksi '${action}' tidak didukung ${agent.name}` });
  const cwd = g.cwd || loadConfig().workdir;
  if (!fs.existsSync(cwd)) return cb({ error: `cwd tidak ada: ${cwd}` });

  const cmd = `${g.bin} ${action}`;
  let out = "", done = false;
  const finish = (obj) => { if (done) return; done = true; clearTimeout(timer); cb(obj); };
  let child;
  try { child = spawn(cmd, [], { cwd, shell: true, windowsHide: true, env: { ...process.env, AGENT_WORKDIR: loadConfig().workdir } }); }
  catch (e) { return cb({ error: `gagal spawn: ${e.message}` }); }
  const timer = setTimeout(() => { killTree(child.pid, child); finish({ error: `timeout 30s: ${cmd}` }); }, 30000);
  child.stdout.on("data", d => { out += d; });
  child.stderr.on("data", d => { out += d; });
  child.on("error", err => finish({ error: `gagal jalankan: ${err.message}` }));
  child.on("exit", code => {
    const text = out.trim().slice(0, 4000);
    const running = detectRunning(text);
    if (action === "status" || action === "start" || action === "restart") gwCache.set(id, { running, text, at: Date.now(), exitCode: code });
    else if (action === "stop") gwCache.set(id, { running: false, text, at: Date.now(), exitCode: code });
    finish({ ok: code === 0, code, action, running, output: text });
  });
}

/* run: foreground, di-own dashboard, log live */
function gwRun(id) {
  const agent = agentById(id);
  if (!agent) return { error: `agent '${id}' tidak dikenal` };
  const g = agent.gateway;
  if (!agent.enabled || !g || !g.bin) return { error: agent.note || `gateway '${id}' belum siap (enabled:false)` };
  if (!gwActions(agent).includes("run")) return { error: `${agent.name} tidak mendukung 'run'` };
  const existing = procs.get(id);
  if (existing && existing.status === "running") return { error: `${id} sudah jalan owned (pid ${existing.pid})` };
  const cwd = g.cwd || loadConfig().workdir;
  if (!fs.existsSync(cwd)) return { error: `cwd tidak ada: ${cwd}` };

  const cmd = g.runCmd || `${g.bin} run`;
  const p = { log: [], seq: 0, status: "running", startedAt: new Date().toISOString(), exitCode: null };
  pushLog(p, "sys", `[agentic-os] run (owned): ${cmd}  (cwd: ${cwd})`);
  let child;
  try { child = spawn(cmd, [], { cwd, shell: true, windowsHide: true, env: { ...process.env, AGENT_WORKDIR: loadConfig().workdir } }); }
  catch (e) { return { error: `gagal spawn: ${e.message}` }; }
  p.child = child; p.pid = child.pid;
  child.stdout.on("data", d => pushLog(p, "out", d));
  child.stderr.on("data", d => pushLog(p, "err", d));
  child.on("exit", code => { p.status = "exited"; p.exitCode = code; pushLog(p, "sys", `[agentic-os] exit code ${code}`); });
  child.on("error", err => { p.status = "error"; p.exitCode = -1; pushLog(p, "sys", `[agentic-os] spawn error: ${err.message}`); });
  procs.set(id, p);
  return { ok: true, pid: child.pid, mode: "run (owned)" };
}

/* terminal: buka Windows Terminal (elevated/admin) yang cd ke folder default & auto-run trigger.
   TIDAK di-own dashboard (detached + unref) â€” makanya Stop/Stop-all tak menutup terminal CLI/TUI ini. */
function gwTerminal(id, mode) {
  const agent = agentById(id);
  if (!agent) return { error: `agent '${id}' tidak dikenal` };
  const g = agent.gateway;
  if (!agent.enabled || !g) return { error: agent.note || `gateway '${id}' belum siap (enabled:false)` };
  let dir, cmd;
  if (mode === "summon") {
    if (!g.trigger) return { error: `${agent.name} belum punya trigger untuk dipanggil` };
    dir = g.home || loadConfig().workdir; cmd = g.trigger;
  } else if (mode === "start") { if (!g.bin) return { error: `${agent.name} tak punya gateway` }; dir = g.cwd || loadConfig().workdir; cmd = `${g.bin} start`; }
  else if (mode === "run") { if (!g.bin) return { error: `${agent.name} tak punya gateway` }; dir = g.cwd || loadConfig().workdir; cmd = g.runCmd || `${g.bin} run`; }
  else return { error: `mode terminal '${mode}' tidak dikenal (summon|start|run)` };
  if (!fs.existsSync(dir)) return { error: `folder tidak ada: ${dir}` };

  // ponytail: dir & cmd dari config (trusted). Escape single-quote untuk untai PowerShell.
  const q = s => String(s).replace(/'/g, "''");
  const ps =
    `$d='${q(dir)}'; $c='${q(cmd)}'; ` +
    `$wt = Get-Command wt.exe -ErrorAction SilentlyContinue; ` +
    `if ($wt) { Start-Process wt.exe -Verb RunAs -ArgumentList '-d',$d,'powershell','-NoExit','-Command',$c } ` +
    `else { Start-Process powershell -Verb RunAs -ArgumentList '-NoExit','-Command',("Set-Location -LiteralPath '" + $d + "'; " + $c) }`;
  try {
    const child = spawn("powershell", ["-NoProfile", "-Command", ps], { detached: true, windowsHide: true, stdio: "ignore" });
    child.unref();
    return { ok: true, mode, dir, cmd, terminal: true };
  } catch (e) { return { error: `gagal buka terminal: ${e.message}` }; }
}

/* matikan proses run yang di-own dashboard (kalau ada) */
function killOwned(id) {
  const p = procs.get(id);
  if (!p || p.status !== "running" || !p.pid) return false;
  pushLog(p, "sys", "[agentic-os] stop owned â€” tree-kill");
  killTree(p.pid, p.child);
  return true;
}

/* stop = matikan owned run (kalau ada) + panggil native `gateway stop` (kalau didukung) */
function gwStop(id, cb) {
  const agent = agentById(id);
  const killed = killOwned(id);
  if (agent && gwActions(agent).includes("stop"))
    return gwCtl(id, "stop", r => cb({ ...r, ownedKilled: killed }));
  cb({ ok: true, ownedKilled: killed, note: killed ? "proses run (owned) dihentikan" : `${agent ? agent.name : id} tidak punya native stop & tidak ada proses owned` });
}

/* refresh status semua agent yang mendukungnya (dipanggil berkala).
   R4: in-flight guard â€” jangan spawn status baru kalau yang lama belum selesai (cegah overlap/pileup). */
const polling = new Set();
function pollAllStatus() {
  let agents; try { agents = loadConfig().agents; } catch { return; }
  for (const a of agents)
    if (a.enabled && a.gateway && gwActions(a).includes("status") && !polling.has(a.id)) {
      polling.add(a.id);
      gwCtl(a.id, "status", () => polling.delete(a.id));
    }
}

/* ---------------- avatar ---------------- */
function avatarUrl(id) {
  for (const ext of ["png", "jpg", "webp", "svg"])   // svg = placeholder sementara; raster (upload) menang duluan
    if (fs.existsSync(path.join(AVATAR_DIR, `${id}.${ext}`))) return `/avatars/${id}.${ext}`;
  return null;
}
function saveAvatar(id, dataUrl) {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return { error: "format harus data:image/png|jpeg|webp;base64" };
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 3e6) return { error: "maks 3 MB" };
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  for (const e of ["png", "jpg", "webp", "svg"]) { try { fs.unlinkSync(path.join(AVATAR_DIR, `${id}.${e}`)); } catch {} }
  fs.writeFileSync(path.join(AVATAR_DIR, `${id}.${ext}`), buf);
  return { ok: true, url: `/avatars/${id}.${ext}` };
}

/* ---------------- graph vault (view: Neural Vault) ---------------- */
let graphCache = { t: 0, data: null };
function buildGraph() {
  if (graphCache.data && Date.now() - graphCache.t < 60000) return graphCache.data;
  try {
  const files = walkVault();
  const nodes = new Map(); // rel -> node
  const byTitle = new Map(); // lowercase basename -> rel
  for (const f of files) {
    const label = f.rel.split("/").pop().replace(/\.md$/, "");
    const folder = f.rel.includes("/") ? f.rel.split("/")[0] : "(root)";
    nodes.set(f.rel, { id: f.rel, label, folder, mtime: f.mtime, deg: 0 });
    if (!byTitle.has(label.toLowerCase())) byTitle.set(label.toLowerCase(), f.rel);
  }
  const edges = [];
  const seen = new Set();
  for (const f of files) {
    let text; try { text = fs.readFileSync(path.join(VAULT, f.rel), "utf8"); } catch { continue; }
    for (const m of text.matchAll(/\[\[([^\]|#\n]+)/g)) {
      const target = byTitle.get(m[1].trim().toLowerCase());
      if (!target || target === f.rel) continue;
      const key = f.rel < target ? f.rel + "|" + target : target + "|" + f.rel;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ s: f.rel, t: target });
      nodes.get(f.rel).deg++; nodes.get(target).deg++;
    }
  }
  graphCache = { t: Date.now(), data: { nodes: [...nodes.values()], edges, generatedAt: new Date().toISOString() } };
  return graphCache.data;
  } catch (e) {
    if (graphCache.data) return graphCache.data;   // R18: jangan poison cache ke null
    return { nodes: [], edges: [], generatedAt: new Date().toISOString(), error: e.message };
  }
}

/* ------- aktivitas Claude Code: sesi + subagent dari transcript jsonl ------- */
function tailRead(file, bytes) {
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, "r");
    const len = Math.min(bytes, size);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    return buf.toString("utf8");
  } catch { return ""; }
}
function toolTarget(name, input) {
  if (!input) return "";
  const t = input.file_path || input.path || input.pattern || input.description ||
    (input.command ? String(input.command) : "") || input.prompt || "";
  return String(t).replace(/^C:\\Users\\abrur\\/i, "").slice(0, 90);
}
function claudeActivity() {
  const sessions = [];
  let dirs = [];
  try { dirs = fs.readdirSync(CLAUDE_PROJECTS, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return { sessions, subagents: [] }; }
  const cutoff = Date.now() - 2 * DAY;
  const cand = [];
  for (const d of dirs) {
    const dir = path.join(CLAUDE_PROJECTS, d.name);
    let names = []; try { names = fs.readdirSync(dir).filter(n => n.endsWith(".jsonl")); } catch { continue; }
    for (const n of names) {
      let st; try { st = fs.statSync(path.join(dir, n)); } catch { continue; }
      if (st.mtimeMs > cutoff) cand.push({ file: path.join(dir, n), dir: d.name, mtime: st.mtimeMs, id: n.replace(".jsonl", "") });
    }
  }
  cand.sort((a, b) => b.mtime - a.mtime);
  const allAgents = [];
  for (const c of cand.slice(0, 8)) {
    const lines = tailRead(c.file, 400000).split("\n");
    let lastTool = null, lastPrompt = null, toolCount = 0;
    const spawns = new Map(); // tool_use id -> spawn
    const results = new Set();
    for (const line of lines) {
      if (!line.trim() || line[0] !== "{") continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      const msg = o.message;
      if (!msg || o.isSidechain) continue;
      const content = msg.content;
      if (msg.role === "user") {
        if (typeof content === "string" && !content.startsWith("<")) lastPrompt = content.slice(0, 160);
        if (Array.isArray(content)) for (const b of content) {
          if (b.type === "text" && b.text && !b.text.startsWith("<")) lastPrompt = b.text.slice(0, 160);
          if (b.type === "tool_result" && b.tool_use_id) results.add(b.tool_use_id);
        }
      }
      if (msg.role === "assistant" && Array.isArray(content)) for (const b of content) {
        if (b.type !== "tool_use") continue;
        toolCount++;
        lastTool = { name: b.name, target: toolTarget(b.name, b.input), ts: o.timestamp || null };
        if (b.name === "Agent" || b.name === "Task")
          spawns.set(b.id, {
            session: c.id.slice(0, 8), ts: o.timestamp || null,
            desc: (b.input && (b.input.description || "")) || "(tanpa deskripsi)",
            type: (b.input && (b.input.subagent_type || "general-purpose")) || "general-purpose",
            status: "running",
          });
      }
    }
    for (const [tid, sp] of spawns) { if (results.has(tid)) sp.status = "done"; allAgents.push(sp); }
    const ageMin = (Date.now() - c.mtime) / 60000;
    sessions.push({
      id: c.id.slice(0, 8),
      project: c.dir.replace(/^C--/, "C:/").replace(/-/g, "/"),
      lastActivity: new Date(c.mtime).toISOString(),
      status: ageMin < 5 ? "working" : ageMin < 120 ? "waiting" : "idle",
      lastPrompt, lastTool, toolCount,
    });
  }
  return { sessions, subagents: allAgents.reverse().slice(0, 20) };
}

/* ------- telemetry lintas-agent: agentic-os/telemetry/<id>.jsonl ------- */
function readTelemetry(id) {
  const file = path.join(TELEMETRY_DIR, `${id}.jsonl`);
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of tailRead(file, 100000).split("\n")) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o && o.type) out.push(o); } catch {}
  }
  return out.slice(-30).reverse();
}

/* Aktivitas seragam untuk agent non-Claude: turunkan sesi + subagent dari telemetry mereka
   sendiri (bukan data palsu), shape sama dengan claudeActivity() supaya UI render identik. */
function telemetryActivity(events) {
  const subagents = [], subSeen = new Set();
  const sessions = [], taskSeen = new Set();
  for (const e of events) {   // events: newest-first (readTelemetry)
    if (e.type === "subagent_start" || e.type === "subagent_done") {
      const key = e.name || e.detail || "";
      if (subSeen.has(key)) continue; subSeen.add(key);
      subagents.push({ type: "subagent", desc: e.name || "(subagent)", detail: e.detail || "",
        status: e.type === "subagent_done" ? "done" : "running", ts: e.ts || null });
    } else if (e.type === "task_start" || e.type === "task_progress" || e.type === "task_done") {
      const key = e.name || "";
      if (taskSeen.has(key)) continue; taskSeen.add(key);   // status terbaru per task (newest-first)
      const ageMin = e.ts ? (Date.now() - Date.parse(e.ts)) / 60000 : 1e9;
      sessions.push({ id: (e.name || "task").slice(0, 8), project: e.detail || "",
        lastActivity: e.ts || null,
        status: e.type === "task_done" ? "idle" : (ageMin < 30 ? "working" : "waiting"),
        lastPrompt: e.name || null, lastTool: null,
        toolCount: typeof e.progress === "number" ? e.progress : 0 });
    }
  }
  return { sessions: sessions.slice(0, 8), subagents: subagents.slice(0, 20) };
}

function agentDetail(id) {
  const agent = loadConfig().agents.find(a => a.id === id);
  if (!agent) return { error: `agent '${id}' tidak dikenal` };
  const p = procs.get(id);
  const files = walkVault();
  const tele = readTelemetry(id);
  const laneFiles = files
    .filter(f => agent.lane && f.rel.startsWith(`Brains/${agent.lane}/`))
    .sort((a, b) => b.mtime - a.mtime).slice(0, 8)
    .map(f => ({ rel: f.rel, updated: new Date(f.mtime).toISOString().slice(0, 16).replace("T", " ") }));
  return {
    id, name: agent.name, icon: agent.icon, role: agent.role, node: agent.node,
    enabled: agent.enabled, note: agent.note || null, avatar: avatarUrl(id),
    cwd: agent.gateway && agent.gateway.cwd, bin: agent.gateway && agent.gateway.bin, actions: gwActions(agent),
    canSummon: !!(agent.gateway && agent.gateway.home && agent.gateway.trigger),
    proc: procInfo(id), ...agentVaultStatus(files, agent),
    log: p ? p.log.slice(-40) : [],
    laneFiles, telemetry: tele,
    // activity seragam semua agent: Claude dari transcript, lainnya dari telemetry mereka
    activity: id === "claude-code" ? claudeActivity() : telemetryActivity(tele),
    source: id === "claude-code" ? "transcript" : "telemetry",
  };
}

/* ---------------- report generator ---------------- */
function buildReport() {
  const cfg = loadConfig();
  const files = walkVault();
  const now = Date.now();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d0 = new Date(now - i * DAY); d0.setHours(0, 0, 0, 0);
    const d1 = d0.getTime() + DAY;
    days.push({
      date: d0.toISOString().slice(5, 10),
      count: files.filter(f => f.mtime >= d0.getTime() && f.mtime < d1).length,
    });
  }
  const folders = {};
  for (const f of files) { const top = f.rel.includes("/") ? f.rel.split("/")[0] : "(root)"; folders[top] = (folders[top] || 0) + 1; }
  const tasks = openTasks();
  const graph = buildGraph();
  const agents = cfg.agents.map(a => {
    const vs = agentVaultStatus(files, a);
    return {
      id: a.id, name: a.name, icon: a.icon, node: a.node, avatar: avatarUrl(a.id),
      laneNotes: a.lane ? files.filter(f => f.rel.startsWith(`Brains/${a.lane}/`)).length : 0,
      touched7d: a.lane ? files.filter(f => f.rel.startsWith(`Brains/${a.lane}/`) && now - f.mtime < 7 * DAY).length : 0,
      lastSeen: vs.lastSeen, vaultStatus: vs.vaultStatus, gw: procInfo(a.id).status,
    };
  });
  return {
    generatedAt: localISO(),
    totals: {
      notes: files.length, edges: graph.edges.length, openTasks: tasks.length,
      active7d: files.filter(f => now - f.mtime < 7 * DAY).length,
      gwRunning: cfg.agents.filter(a => procInfo(a.id).status === "running").length,
    },
    days, folders: Object.entries(folders).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    agents, tasks: tasks.slice(0, 10),
  };
}
function reportMarkdown(r) {
  const bar = n => "â–ˆ".repeat(Math.min(n, 30)) || "Â·";
  const lines = [
    "---",
    `title: "Laporan Agentic OS ${r.generatedAt.slice(0, 10)}"`,
    `date: ${r.generatedAt.slice(0, 10)}`,
    "type: report",
    "created_by: agentic-os-dashboard",
    "tags: [report, agentic-os]",
    "---", "",
    `# Laporan Agentic OS â€” ${r.generatedAt.slice(0, 16).replace("T", " ")}`, "",
    `| Metrik | Nilai |`, `|---|---|`,
    `| Total catatan vault | ${r.totals.notes} |`,
    `| Koneksi antar catatan (wikilink) | ${r.totals.edges} |`,
    `| Catatan aktif 7 hari | ${r.totals.active7d} |`,
    `| Task terbuka | ${r.totals.openTasks} |`,
    `| Gateway sedang jalan | ${r.totals.gwRunning} |`, "",
    "## Aktivitas 14 hari (catatan diubah/hari)", "", "```",
    ...r.days.map(d => `${d.date}  ${String(d.count).padStart(3)}  ${bar(d.count)}`),
    "```", "",
    "## Distribusi folder", "", `| Folder | Catatan |`, `|---|---|`,
    ...r.folders.map(f => `| ${f.name} | ${f.count} |`), "",
    "## Status agent", "", `| Agent | Node | Catatan lane | Aktif 7d | Terakhir | Gateway |`, `|---|---|---|---|---|---|`,
    ...r.agents.map(a => `| ${a.icon} ${a.name} | ${a.node} | ${a.laneNotes} | ${a.touched7d} | ${a.lastSeen || "-"} | ${a.gw} |`), "",
  ];
  if (r.tasks.length) lines.push("## Task terbuka (maks 10)", "", ...r.tasks.map(t => `- [ ] ${t.text} _(${t.source})_`), "");
  lines.push("---", "_Digenerate otomatis dari dashboard Agentic OS._");
  return lines.join("\n");
}
function localISO(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}
function saveReport() {
  try {
    const r = buildReport();
    const dir = path.join(VAULT, "Reports");
    fs.mkdirSync(dir, { recursive: true });
    const l = localISO();
    const name = `Laporan ${l.slice(0, 10)} ${l.slice(11, 19).replace(/:/g, ".")}.md`;  // detik â†’ tak saling timpa
    fs.writeFileSync(path.join(dir, name), reportMarkdown(r), "utf8");
    return { ok: true, rel: `Reports/${name}` };
  } catch (e) { return { error: `gagal simpan laporan: ${e.message}` }; }
}

function readBody(req, res, cb) {
  let body = "", aborted = false;
  req.on("data", d => {
    body += d;
    if (body.length > 5e6 && !aborted) {           // R5: balas 413, jangan biarkan client hang
      aborted = true;
      res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "body melebihi 5MB" }));
      req.destroy();
    }
  });
  req.on("end", () => { if (!aborted) cb(body); });
}

/* ---------------- http ---------------- */
/* S1: bandingkan token konstan-waktu (anti timing attack). S2: header saja, tak lagi terima ?token= */
function safeEq(a, b) {
  const ba = Buffer.from(String(a || "")), bb = Buffer.from(String(b || ""));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function authorized(req) {
  if (!TOKEN) return true;
  const remote = req.socket && (req.socket.remoteAddress || req.connection && req.connection.remoteAddress || "");
  if (/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote)) return true;
  const a = Buffer.from(String(req.headers["x-dash-token"] || ""));
  if (a.length !== TOKEN.length) return safeEq(Buffer.alloc(TOKEN.length, 0), TOKEN);
  return timingSafeCompare(a, TOKEN);
}
function timingSafeCompare(a, b) {
  if (a.length !== b.length) return crypto.timingSafeEqual(Buffer.alloc(a.length, 0), b);
  return crypto.timingSafeEqual(a, b);
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".md": "text/markdown; charset=utf-8" };

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];

  if (url.startsWith("/api/")) {
    if (!authorized(req)) return json(res, 401, { error: "token salah/kosong â€” set header x-dash-token" });
    try {
      if (url === "/api/state") return json(res, 200, buildState());
      if (url === "/api/procs") {
        const cfg = loadConfig();
        return json(res, 200, cfg.agents.map(a => ({ id: a.id, name: a.name, icon: a.icon, enabled: a.enabled, note: a.note || null, cwd: a.gateway && a.gateway.cwd, bin: a.gateway && a.gateway.bin, actions: gwActions(a), ...procInfo(a.id) })));
      }
      let m = url.match(/^\/api\/proc\/([\w-]+)\/(start|stop|restart|status|run|log|terminal)$/);
      if (m) {
        const [, id, action] = m;
        if (action === "log") {
          const p = procs.get(id);
          const since = Number(new URL(req.url, "http://x").searchParams.get("since") || 0);
          return json(res, 200, { lines: p ? p.log.filter(l => l.i >= since) : [], next: p ? p.seq : 0, ...procInfo(id) });
        }
        if (req.method !== "POST") return json(res, 405, { error: "POST only" });
        if (action === "terminal") {
          const mode = new URL(req.url, "http://x").searchParams.get("mode") || "summon";
          const r = gwTerminal(id, mode); return json(res, r.error ? 400 : 200, r);
        }
        if (action === "run") { const r = gwRun(id); return json(res, r.error ? 400 : 200, r); }
        if (action === "stop") return gwStop(id, r => json(res, r.error ? 400 : 200, r));
        return gwCtl(id, action, r => json(res, r.error ? 400 : 200, r)); // start | restart | status
      }
      if (url === "/api/proc/start-all" && req.method === "POST") {
        const list = loadConfig().agents.filter(a => a.enabled && a.gateway && gwActions(a).includes("start"));
        if (!list.length) return json(res, 200, {});
        const results = {};
        let pending = list.length;
        list.forEach(a => gwCtl(a.id, "start", r => { results[a.id] = r; if (--pending === 0) json(res, 200, results); }));
        return;
      }
      if (url === "/api/graph") return json(res, 200, buildGraph());
      if (url === "/api/report") return json(res, 200, buildReport());
      if (url === "/api/report/save" && req.method === "POST") return json(res, 200, saveReport());
      m = url.match(/^\/api\/agent\/([\w-]+)\/detail$/);
      if (m) { const d = agentDetail(m[1]); return json(res, d.error ? 404 : 200, d); }
      m = url.match(/^\/api\/agent\/([\w-]+)\/avatar$/);
      if (m && req.method === "POST") {
        const id = m[1];
        if (!loadConfig().agents.some(a => a.id === id)) return json(res, 404, { error: "agent tidak dikenal" });
        return readBody(req, res, body => {
          let data; try { data = JSON.parse(body).data; } catch { return json(res, 400, { error: "body harus JSON {data}" }); }
          const r = saveAvatar(id, data);
          json(res, r.error ? 400 : 200, r);
        });
      }
      return json(res, 404, { error: "unknown api" });
    } catch (err) { console.error("[api]", (err && err.stack) || err); return json(res, 500, { error: "internal error" }); }  // S12: jangan echo detail internal
  }

  // S5: path-traversal guard pakai path.relative (bukan startsWith), + decode URL
  let rel; try { rel = url === "/" ? "index.html" : decodeURIComponent(url.slice(1)); } catch { res.writeHead(400); return res.end("bad request"); }
  const file = path.normalize(path.join(PUBLIC, rel));
  const relToPublic = path.relative(PUBLIC, file);
  if (relToPublic.startsWith("..") || path.isAbsolute(relToPublic)) {
    res.writeHead(403, { "Content-Type": "text/plain" }); return res.end("forbidden");
  }
  try {
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("not found");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(500, { "Content-Type": "text/plain" }); res.end("error"); }
});

/* R1+R3: shutdown & crash handler â€” SIGINT/SIGTERM/SIGHUP + uncaughtException tidak dijangkau
   process.on("exit") (event loop mati di 'exit', taskkill async tak sempat). Di sini masih ada loop. */
let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return; shuttingDown = true;
  console.error(`[agentic-os] shutdown (${sig}) â€” hentikan proses owned`);
  for (const id of procs.keys()) killOwned(id);
  try { server.close(); } catch {}
  setTimeout(() => process.exit(0), 500);   // beri waktu taskkill async
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => shutdown(sig));
process.on("uncaughtException", e => { console.error("[uncaughtException]", (e && e.stack) || e); shutdown("uncaughtException"); });
process.on("unhandledRejection", e => { console.error("[unhandledRejection]", (e && e.stack) || e); });
process.on("exit", () => { for (const id of procs.keys()) killOwned(id); });

server.on("error", e => {
  if (e.code === "EADDRINUSE") { console.error(`\n  Port ${PORT} sudah dipakai. Jalankan di port lain: set PORT=4322 lalu npm run dev\n`); }
  else console.error("[server]", (e && e.stack) || e);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n  Agentic OS jalan di  http://localhost:${PORT}`);
  console.log(`  Vault sumber data:   ${VAULT}`);
  console.log(`  Config agent:        ${CONFIG_PATH}`);
  console.log(TOKEN ? "  Auth: token AKTIF (x-dash-token)" : "  Auth: tanpa token (lokal). Untuk remote: set DASH_TOKEN.\n");
  setTimeout(pollAllStatus, 3000);       // status awal
  setInterval(pollAllStatus, 45000);     // R4: interval (45s) > timeout gwCtl (30s) + in-flight guard
});
