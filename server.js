/* Agentic OS — zero-dependency Node server.
   Live dashboard from the Obsidian Vault + agent gateway launcher.
   Run: npm run dev  →  http://localhost:4321
   Remote:   set DASH_TOKEN=secret  →  access requires the token. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const os = require("os");
const { spawn, execFile } = require("child_process");
const crypto = require("crypto");

/* load .env (KEY=VALUE per line; real env vars win over file contents) */
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const PORT = process.env.PORT || 4321;
const VAULT = process.env.VAULT_PATH || path.join(__dirname, "Obsidian Vault");
const CONFIG_PATH = process.env.AGENTS_CONFIG || path.join(__dirname, "agents.config.json");
const TOKEN = process.env.DASH_TOKEN || "";
const PUBLIC = path.join(__dirname, "public");
const IGNORE = new Set([".git", ".obsidian", "Assets", "node_modules"]);
const DAY = 86400000;
const LOG_MAX = 800;
const AVATAR_DIR = path.join(PUBLIC, "avatars");
const TELEMETRY_DIR = path.join(__dirname, "telemetry");
const LOG_DIR = path.join(TELEMETRY_DIR, "logs");   // R#4: per-agent run log, survives restarts
const LOG_FILE_MAX = 1_000_000;                     // 1 MB/agent → naive rotation (keep the tail half)
const CLAUDE_PROJECTS = process.env.CLAUDE_PROJECTS || path.join(os.homedir(), ".claude", "projects");
for (const d of [AVATAR_DIR, TELEMETRY_DIR, LOG_DIR]) { try { fs.mkdirSync(d, { recursive: true }); } catch {} }

/* loadConfig: memoize by mtime (B6) + tolerate config broken mid-edit → return last-good (R10).
   R#11: keep the last error so the dashboard can show a banner (not silently serve last-good). */
let _cfgCache = { mtime: 0, data: null };
let configError = null;   // { msg, at } when parsing fails but a last-good copy exists
function loadConfig() {
  try {
    const st = fs.statSync(CONFIG_PATH);
    if (_cfgCache.data && st.mtimeMs === _cfgCache.mtime) return _cfgCache.data;
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    _cfgCache = { mtime: st.mtimeMs, data };
    configError = null;                       // recovered → clear the banner
    return data;
  } catch (e) {
    if (_cfgCache.data) { console.error("[config] parse failed, using last-good:", e.message); configError = { msg: e.message, at: new Date().toISOString() }; return _cfgCache.data; }
    throw e;
  }
}

/* ---------------- vault scan (view: Command Center) ---------------- */
function walk(dir, out = [], base = dir, depth = 0) {
  if (depth > 100) return out;               // R14: prevent runaway recursion (deep nesting)
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (IGNORE.has(e.name) || e.name.startsWith(".")) continue;
    if (e.isSymbolicLink()) continue;        // R14: skip symlinks/junctions → prevent loops
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out, base, depth + 1);
    else if (e.name.endsWith(".md")) {
      let st; try { st = fs.statSync(full); } catch { continue; }
      out.push({ rel: path.relative(base, full).replace(/\\/g, "/"), mtime: st.mtimeMs });
    }
  }
  return out;
}

/* short-TTL vault snapshot: dedupes re-walks when many endpoints/tabs ask within one tick (B1/B3) */
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
  const um = uptimeMap();                       // R#2: 24-hour uptime per agent (single file read)
  const inbox = files.filter(f => f.rel.startsWith("Inbox/"));
  const projects = files.filter(f => f.rel.startsWith("Projects/") && f.rel.split("/").length === 2)
    .sort((a, b) => b.mtime - a.mtime)
    .map(f => ({ name: f.rel.replace("Projects/", "").replace(".md", ""), rel: f.rel, updated: new Date(f.mtime).toISOString().slice(0, 10) }));
  return {
    vault: VAULT,
    agency: cfg.agency || "AGENTIC//OS",
    generatedAt: new Date().toISOString(),
    configError,                              // R#11: null when healthy, {msg,at} when config is broken

    stats: {
      notes: { value: files.length, label: "Total vault notes" },
      activeWeek: { value: files.filter(f => now - f.mtime < 7 * DAY).length, label: "Notes changed in the last 7 days" },
      openTasks: { value: tasks.length, label: "Open checkboxes in Tasks/" },
      projects: { value: projects.length, label: "Active project notes" },
    },
    agents: cfg.agents.map(a => ({ ...a, gateway: undefined, actions: gwActions(a), canSummon: !!(a.gateway && a.gateway.home && a.gateway.trigger), ...agentVaultStatus(files, a), proc: procInfo(a.id), avatar: avatarUrl(a.id), uptime: um[a.id] || null })),
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
   The dashboard calls each agent's REAL gateway commands (start/stop/restart/status/run).
   - start/stop/restart/status : short commands (run → capture output → done),
     managed by the OS service manager (schtasks/systemd) → stays alive even if the dashboard closes.
   - run : foreground, owned by the dashboard (live log), stops with the dashboard/stop button.
   procs = `run` processes owned by the dashboard. gwCache = last status result per agent. */
const procs = new Map();   // id -> {child,pid,log:[],seq,status,startedAt,exitCode}
const gwCache = new Map();  // id -> {running,text,at,exitCode}

function agentById(id) { return loadConfig().agents.find(a => a.id === id); }
function gwActions(agent) { return (agent && agent.gateway && agent.gateway.actions) || []; }

function detectRunning(text) {
  const t = (text || "").toLowerCase();
  // Note: matches Indonesian output emitted by some agent CLIs — do not translate
  if (/not running|tidak (sedang )?jalan|belum jalan|\bstopped\b|\binactive\b|no gateway|not installed|no running/.test(t)) return false;
  if (/\brunning\b|\bactive\b|\bpid[:\s#]*\d|listening on|is up\b/.test(t)) return true;
  return false;
}

function procInfo(id) {
  const p = procs.get(id);
  const c = gwCache.get(id);
  // a dashboard-owned run process wins while it's still alive
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
  const tele = readTelemetry(id);
  if (tele && tele.length > 0) {
    const latest = tele[0];
    const ts = latest.ts ? Date.parse(latest.ts) : 0;
    if (Date.now() - ts < 15 * 60 * 1000) {
      return { status: "running", mode: "cli", startedAt: latest.ts, exitCode: null, logSize: p ? p.seq : 0, reason: null, statusText: `Active CLI: ${latest.name || latest.type} · ${latest.detail || ""}` };
    }
  }
  if (p) return { status: p.status, mode: "owned", pid: p.pid, startedAt: p.startedAt, exitCode: p.exitCode, logSize: p.seq, reason, statusText: null };
  return { status: "off" };
}

function pushLog(p, stream, chunk) {
  try {
    const disk = [];
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      const entry = { i: p.seq++, t: new Date().toISOString().slice(11, 19), s: stream, line: line.slice(0, 500) };
      p.log.push(entry);
      disk.push({ t: entry.t, s: entry.s, line: entry.line });
      if (p.log.length > LOG_MAX) p.log.splice(0, p.log.length - LOG_MAX);
    }
    if (disk.length) appendDiskLog(p.id, disk);       // R#4: persist to disk
  } catch (e) { /* R19: don't let a throw in the 'data' event escape the handler */ }
}
/* R#4: append run log to telemetry/logs/<id>.log (JSONL) + naive rotation when > LOG_FILE_MAX */
function appendDiskLog(id, entries) {
  if (!id || !entries || !entries.length) return;
  try {
    const f = path.join(LOG_DIR, `${id}.log`);
    fs.appendFileSync(f, entries.map(e => JSON.stringify(e)).join("\n") + "\n");
    if (fs.statSync(f).size > LOG_FILE_MAX) {
      const buf = fs.readFileSync(f);
      fs.writeFileSync(f, buf.slice(buf.length - Math.floor(LOG_FILE_MAX / 2)));
    }
  } catch {}
}
/* R#4: read the disk log tail (used by agent detail after a restart, when the in-memory proc is gone) */
function readDiskLog(id, n) {
  const out = [];
  for (const line of tailRead(path.join(LOG_DIR, `${id}.log`), 80000).split("\n")) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); out.push({ i: 0, t: o.t, s: o.s, line: o.line }); } catch {}
  }
  return out.slice(-n);
}

/* R2: consistent tree-kill (Win: taskkill /T, POSIX: kill process group) — used by owned-run & gwCtl timeout */
function killTree(pid, child) {
  if (!pid) { try { child && child.kill(); } catch {} return; }
  if (process.platform === "win32") { try { execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => {}); } catch {} }
  else { try { process.kill(-pid, "SIGKILL"); } catch { try { child && child.kill(); } catch {} } }
}

/* ROADMAP #1: alert when an agent goes down (running → down) or a run exits non-zero.
   Durable = 1 note in the vault Inbox/ (auto-appears in Needs Review). Windows toast = best-effort. */
function notifyWindows(title, msg) {
  if (process.platform !== "win32") return;
  const q = s => String(s).replace(/'/g, "''").slice(0, 200);
  const ps = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; ` +
    `$n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Warning; $n.Visible = $true; ` +
    `$n.ShowBalloonTip(8000, '${q(title)}', '${q(msg)}', [System.Windows.Forms.ToolTipIcon]::Warning); ` +
    `Start-Sleep -Seconds 9; $n.Dispose()`;
  try { spawn("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], { detached: true, windowsHide: true, stdio: "ignore" }).unref(); } catch {}
}
function alertDown(id, reason) {
  const agent = agentById(id);
  const name = agent ? agent.name : id;
  const stamp = localISO();
  try {
    const dir = path.join(VAULT, "Inbox");
    fs.mkdirSync(dir, { recursive: true });
    const fname = `ALERT ${name} ${stamp.slice(0, 10)} ${stamp.slice(11, 19).replace(/:/g, ".")}.md`;
    fs.writeFileSync(path.join(dir, fname),
      `---\ntype: alert\nagent: ${id}\ncreated: ${stamp}\ntags: [alert, agentic-os]\n---\n\n` +
      `# ⚠ ${name} — gateway down\n\n- Time: ${stamp.slice(0, 19).replace("T", " ")}\n- Cause: ${reason}\n- Source: agentic-os dashboard (automatic detection)\n`, "utf8");
  } catch (e) { console.error("[alert] failed to write inbox note:", e.message); }
  notifyWindows(`⚠ ${name} down`, reason);
}

/* ROADMAP #2: log each status poll to telemetry/uptime.jsonl (ts + up 0/1) → 24-hour uptime strip.
   ponytail: append-only, read via tailRead (byte cap). File grows ~polls/day — rotate later if needed. */
function logUptime(id, running) {
  try { fs.appendFileSync(path.join(TELEMETRY_DIR, "uptime.jsonl"), JSON.stringify({ ts: Date.now(), id, up: running ? 1 : 0 }) + "\n"); } catch {}
}
function uptimeMap() {
  const cutoff = Date.now() - DAY;
  const acc = {};
  for (const line of tailRead(path.join(TELEMETRY_DIR, "uptime.jsonl"), 500000).split("\n")) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (!o || !o.id || !o.ts || o.ts < cutoff) continue;
    const a = acc[o.id] || (acc[o.id] = { up: 0, total: 0 });
    a.total++; if (o.up) a.up++;
  }
  const out = {};
  for (const id in acc) out[id] = { pct: Math.round(acc[id].up / acc[id].total * 100), samples: acc[id].total };
  return out;
}

/* short commands: start/stop/restart/status → run `<bin> <action>`, capture the output */
function gwCtl(id, action, cb) {
  const agent = agentById(id);
  if (!agent) return cb({ error: `unknown agent '${id}'` });
  const g = agent.gateway;
  if (!agent.enabled || !g || !g.bin) return cb({ error: agent.note || `gateway '${id}' not ready (enabled:false)` });
  if (!gwActions(agent).includes(action)) return cb({ error: `action '${action}' not supported by ${agent.name}` });
  const cwd = g.cwd || loadConfig().workdir;
  if (!fs.existsSync(cwd)) return cb({ error: `cwd does not exist: ${cwd}` });

  const cmd = `${g.bin} ${action}`;
  let out = "", done = false;
  const finish = (obj) => { if (done) return; done = true; clearTimeout(timer); cb(obj); };
  let child;
  try { child = spawn(cmd, [], { cwd, shell: true, windowsHide: true, env: { ...process.env, AGENT_WORKDIR: loadConfig().workdir } }); }
  catch (e) { return cb({ error: `spawn failed: ${e.message}` }); }
  const timer = setTimeout(() => { killTree(child.pid, child); finish({ error: `timeout 30s: ${cmd}` }); }, 30000);
  child.stdout.on("data", d => { out += d; });
  child.stderr.on("data", d => { out += d; });
  child.on("error", err => finish({ error: `failed to run: ${err.message}` }));
  child.on("exit", code => {
    const text = out.trim().slice(0, 4000);
    const running = detectRunning(text);
    if (action === "status" || action === "start" || action === "restart") {
      const prev = gwCache.get(id);                    // R#1: detect running → down transition
      gwCache.set(id, { running, text, at: Date.now(), exitCode: code });
      logUptime(id, running);
      if (prev && prev.running && !running) { alertDown(id, `gateway went down (detected during ${action})`); if (action === "status") maybeWatchdog(id); }
    } else if (action === "stop") { gwCache.set(id, { running: false, text, at: Date.now(), exitCode: code }); logUptime(id, false); }
    finish({ ok: code === 0, code, action, running, output: text });
  });
}

/* run: foreground, owned by the dashboard, live log */
function gwRun(id) {
  const agent = agentById(id);
  if (!agent) return { error: `unknown agent '${id}'` };
  const g = agent.gateway;
  if (!agent.enabled || !g || !g.bin) return { error: agent.note || `gateway '${id}' not ready (enabled:false)` };
  if (!gwActions(agent).includes("run")) return { error: `${agent.name} does not support 'run'` };
  const existing = procs.get(id);
  if (existing && existing.status === "running") return { error: `${id} is already running owned (pid ${existing.pid})` };
  const cwd = g.cwd || loadConfig().workdir;
  if (!fs.existsSync(cwd)) return { error: `cwd does not exist: ${cwd}` };

  const cmd = g.runCmd || `${g.bin} run`;
  const p = { id, log: [], seq: 0, status: "running", startedAt: new Date().toISOString(), exitCode: null };
  pushLog(p, "sys", `[agentic-os] run (owned): ${cmd}  (cwd: ${cwd})`);
  let child;
  try { child = spawn(cmd, [], { cwd, shell: true, windowsHide: true, env: { ...process.env, AGENT_WORKDIR: loadConfig().workdir } }); }
  catch (e) { return { error: `spawn failed: ${e.message}` }; }
  p.child = child; p.pid = child.pid;
  child.stdout.on("data", d => pushLog(p, "out", d));
  child.stderr.on("data", d => pushLog(p, "err", d));
  child.on("exit", code => { p.status = "exited"; p.exitCode = code; pushLog(p, "sys", `[agentic-os] exit code ${code}`);
    if (code !== 0) { const last = p.log.filter(l => l.s === "out" || l.s === "err").slice(-1)[0]; alertDown(id, `run (owned) exit code ${code}${last ? " — " + last.line : ""}`); } });
  child.on("error", err => { p.status = "error"; p.exitCode = -1; pushLog(p, "sys", `[agentic-os] spawn error: ${err.message}`); });
  procs.set(id, p);
  return { ok: true, pid: child.pid, mode: "run (owned)" };
}

/* terminal: open a Windows Terminal (elevated/admin) that cd's to the default folder & auto-runs the trigger.
   NOT owned by the dashboard (detached + unref) — that's why Stop/Stop-all won't close this CLI/TUI terminal. */
function gwTerminal(id, mode) {
  const agent = agentById(id);
  if (!agent) return { error: `unknown agent '${id}'` };
  const g = agent.gateway;
  if (!agent.enabled || !g) return { error: agent.note || `gateway '${id}' not ready (enabled:false)` };
  let dir, cmd;
  if (mode === "summon") {
    if (!g.trigger) return { error: `${agent.name} has no trigger to summon it with` };
    dir = g.home || loadConfig().workdir; cmd = g.trigger;
  } else if (mode === "start") { if (!g.bin) return { error: `${agent.name} has no gateway` }; dir = g.cwd || loadConfig().workdir; cmd = `${g.bin} start`; }
  else if (mode === "run") { if (!g.bin) return { error: `${agent.name} has no gateway` }; dir = g.cwd || loadConfig().workdir; cmd = g.runCmd || `${g.bin} run`; }
  else return { error: `unknown terminal mode '${mode}' (summon|start|run)` };
  if (!fs.existsSync(dir)) return { error: `folder does not exist: ${dir}` };

  // ponytail: dir & cmd come from config (trusted). Escape single quotes for the PowerShell string.
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
  } catch (e) { return { error: `failed to open terminal: ${e.message}` }; }
}

/* kill the dashboard-owned run process (if any) */
function killOwned(id) {
  const p = procs.get(id);
  if (!p || p.status !== "running" || !p.pid) return false;
  pushLog(p, "sys", "[agentic-os] stop owned — tree-kill");
  killTree(p.pid, p.child);
  return true;
}

/* stop = kill the owned run (if any) + call the native `gateway stop` (if supported) */
function gwStop(id, cb) {
  const agent = agentById(id);
  const killed = killOwned(id);
  if (agent && gwActions(agent).includes("stop"))
    return gwCtl(id, "stop", r => cb({ ...r, ownedKilled: killed }));
  cb({ ok: true, ownedKilled: killed, note: killed ? "owned run process stopped" : `${agent ? agent.name : id} has no native stop & no owned process` });
}

/* R#7: real health probe — check that the TCP port is actually listening (more honest than matching status text).
   Config: agent.gateway.probe = { host?, port }. Successful connect = alive, else down. */
function probePort(host, port, cb) {
  const sock = new net.Socket();
  let done = false;
  const finish = up => { if (done) return; done = true; try { sock.destroy(); } catch {} cb(up); };
  sock.setTimeout(3000);
  sock.once("connect", () => finish(true));
  sock.once("timeout", () => finish(false));
  sock.once("error", () => finish(false));
  try { sock.connect(port, host || "127.0.0.1"); } catch { finish(false); }
}
function probeAndCache(id, probe) {
  probePort(probe.host, probe.port, up => {
    const prev = gwCache.get(id);
    const host = probe.host || "127.0.0.1";
    gwCache.set(id, { running: up, text: `probe TCP ${host}:${probe.port} → ${up ? "OPEN (listening)" : "CLOSED"}`, at: Date.now(), exitCode: up ? 0 : 1 });
    logUptime(id, up);
    if (prev && prev.running && !up) { alertDown(id, `probe port ${probe.port} closed (service down)`); maybeWatchdog(id); }
  });
}

/* R#6: watchdog auto-restart for 24/7 agents (optional per agent: gateway.watchdog=true).
   Hard anti-loop: max 3 restarts / hour. Alerts are still sent (by the caller). */
const restartLog = new Map();   // id -> [timestamps]
function maybeWatchdog(id) {
  const a = agentById(id);
  if (!a || !a.gateway || !a.gateway.watchdog || !gwActions(a).includes("restart")) return;
  const now = Date.now();
  const hits = (restartLog.get(id) || []).filter(t => now - t < 3600000);
  if (hits.length >= 3) { console.error(`[watchdog] ${id}: 3x/hour limit reached, stopping auto-restart`); return; }
  hits.push(now); restartLog.set(id, hits);
  console.error(`[watchdog] ${id}: auto-restart (attempt ${hits.length}/3 this hour)`);
  alertDown(id, `watchdog auto-restart (attempt ${hits.length}/3 within 1 hour)`);
  gwCtl(id, "restart", () => {});
}

/* refresh the status of every agent that supports it (called periodically).
   R4: in-flight guard — don't spawn a new status check while the old one is still running (prevents overlap/pileup). */
const polling = new Set();
function pollAllStatus() {
  let agents; try { agents = loadConfig().agents; } catch { return; }
  for (const a of agents) {
    if (!a.enabled || !a.gateway) continue;
    if (a.gateway.probe && a.gateway.probe.port) { probeAndCache(a.id, a.gateway.probe); continue; }  // R#7: probe wins
    if (gwActions(a).includes("status") && !polling.has(a.id)) {
      polling.add(a.id);
      gwCtl(a.id, "status", () => polling.delete(a.id));
    }
  }
}

/* ---------------- avatar ---------------- */
function avatarUrl(id) {
  for (const ext of ["png", "jpg", "webp", "svg"])   // svg = temporary placeholder; raster (uploaded) wins first
    if (fs.existsSync(path.join(AVATAR_DIR, `${id}.${ext}`))) return `/avatars/${id}.${ext}`;
  return null;
}
function saveAvatar(id, dataUrl) {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl || "");
  if (!m) return { error: "format must be data:image/png|jpeg|webp;base64" };
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 3e6) return { error: "max 3 MB" };
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
    if (graphCache.data) return graphCache.data;   // R18: don't poison the cache to null
    return { nodes: [], edges: [], generatedAt: new Date().toISOString(), error: e.message };
  }
}

/* ------- Claude Code activity: sessions + subagents from the transcript jsonl ------- */
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
const HOME_PREFIX_RE = new RegExp("^" + os.homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\\\/]", "i");
function toolTarget(name, input) {
  if (!input) return "";
  const t = input.file_path || input.path || input.pattern || input.description ||
    (input.command ? String(input.command) : "") || input.prompt || "";
  return String(t).replace(HOME_PREFIX_RE, "").slice(0, 90);
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
            desc: (b.input && (b.input.description || "")) || "(no description)",
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

/* ------- cross-agent telemetry: agentic-os/telemetry/<id>.jsonl ------- */
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

/* Uniform activity for non-Claude agents: derive sessions + subagents from their own
   telemetry (not fake data), same shape as claudeActivity() so the UI renders identically. */
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
      if (taskSeen.has(key)) continue; taskSeen.add(key);   // latest status per task (newest-first)
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
  if (!agent) return { error: `unknown agent '${id}'` };
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
    log: p && p.log.length ? p.log.slice(-40) : readDiskLog(id, 40),   // R#4: fall back to disk after a restart
    laneFiles, telemetry: tele,
    // uniform activity for all agents: Claude from transcripts, the rest from their own telemetry
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
  const bar = n => "█".repeat(Math.min(n, 30)) || "·";
  const lines = [
    "---",
    `title: "Agentic OS Report ${r.generatedAt.slice(0, 10)}"`,
    `date: ${r.generatedAt.slice(0, 10)}`,
    "type: report",
    "created_by: agentic-os-dashboard",
    "tags: [report, agentic-os]",
    "---", "",
    `# Agentic OS Report — ${r.generatedAt.slice(0, 16).replace("T", " ")}`, "",
    `| Metric | Value |`, `|---|---|`,
    `| Total vault notes | ${r.totals.notes} |`,
    `| Note-to-note links (wikilinks) | ${r.totals.edges} |`,
    `| Notes active in 7 days | ${r.totals.active7d} |`,
    `| Open tasks | ${r.totals.openTasks} |`,
    `| Gateways running | ${r.totals.gwRunning} |`, "",
    "## 14-day activity (notes changed/day)", "", "```",
    ...r.days.map(d => `${d.date}  ${String(d.count).padStart(3)}  ${bar(d.count)}`),
    "```", "",
    "## Folder distribution", "", `| Folder | Notes |`, `|---|---|`,
    ...r.folders.map(f => `| ${f.name} | ${f.count} |`), "",
    "## Agent status", "", `| Agent | Node | Lane notes | Active 7d | Last seen | Gateway |`, `|---|---|---|---|---|---|`,
    ...r.agents.map(a => `| ${a.icon} ${a.name} | ${a.node} | ${a.laneNotes} | ${a.touched7d} | ${a.lastSeen || "-"} | ${a.gw} |`), "",
  ];
  if (r.tasks.length) lines.push("## Open tasks (max 10)", "", ...r.tasks.map(t => `- [ ] ${t.text} _(${t.source})_`), "");
  lines.push("---", "_Generated automatically by the Agentic OS dashboard._");
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
    const name = `Report ${l.slice(0, 10)} ${l.slice(11, 19).replace(/:/g, ".")}.md`;  // seconds → no overwrites
    fs.writeFileSync(path.join(dir, name), reportMarkdown(r), "utf8");
    return { ok: true, rel: `Reports/${name}` };
  } catch (e) { return { error: `failed to save report: ${e.message}` }; }
}

/* R#5: send a task to an agent from the dashboard → write a checkbox to vault Tasks/Inbox Tasks.md.
   openTasks() scans all Tasks/*.md → it auto-appears in Needs Review (kind task), agents pick it up themselves. */
function createTask(agentId, title, detail) {
  title = String(title || "").trim().replace(/[\r\n]+/g, " ").slice(0, 200);
  if (!title) return { error: "task title is empty" };
  const agent = loadConfig().agents.find(a => a.id === agentId);
  const who = agent ? agent.name : (agentId ? agentId : "General");
  const date = localISO().slice(0, 10);
  const extra = detail ? `  ·  ${String(detail).trim().replace(/[\r\n]+/g, " ").slice(0, 300)}` : "";
  try {
    const dir = path.join(VAULT, "Tasks");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "Inbox Tasks.md");
    const line = `- [ ] ${title} — ${who} — ${date}${extra}\n`;   // — = clean em-dash (avoids mojibake)
    if (!fs.existsSync(file))
      fs.writeFileSync(file, `# 📥 Inbox Tasks\n\n> Tasks from the dashboard. Agents pick them up → mark \`[x]\` when done.\n\n${line}`, "utf8");
    else
      fs.appendFileSync(file, line, "utf8");
    return { ok: true, rel: "Tasks/Inbox Tasks.md", line: line.trim() };
  } catch (e) { return { error: `failed to write task: ${e.message}` }; }
}

/* R#8: schedule panel — read each agent's Windows Scheduled Task (next run, last run, last result). */
function querySchtask(name, cb) {
  execFile("schtasks", ["/query", "/tn", name, "/fo", "LIST", "/v"], { windowsHide: true }, (e, out) => {
    if (e) return cb({ name, error: String((e.message || "query failed")).split("\n")[0].slice(0, 120) });
    const grab = re => { const m = out.match(re); return m ? m[1].trim() : null; };
    const lr = grab(/Last Result:\s*(.+)/);
    cb({ name, taskState: grab(/Scheduled Task State:\s*(.+)/) || grab(/Status:\s*(.+)/),
      nextRun: grab(/Next Run Time:\s*(.+)/), lastRun: grab(/Last Run Time:\s*(.+)/),
      lastResult: lr, ok: lr === "0" });
  });
}
function buildSchedule(cb) {
  let agents; try { agents = loadConfig().agents.filter(a => a.gateway && a.gateway.schtask); } catch { return cb([]); }
  if (!agents.length) return cb([]);
  const out = []; let pending = agents.length;
  agents.forEach(a => querySchtask(a.gateway.schtask, r => { out.push({ id: a.id, agent: a.name, icon: a.icon, ...r }); if (--pending === 0) cb(out); }));
}

/* R#9: vault health — age of the last git commit + age of the last backup (prevent losing the brain).
   Backup optional via env BACKUP_PATH (folder/file); if unset, only git is reported. */
function buildVaultHealth(cb) {
  const res = { vault: VAULT, gitCommitAt: null, gitAgeH: null, gitOk: false, backupAt: null, backupAgeH: null, backup: null };
  const backup = process.env.BACKUP_PATH || null;
  if (backup) { try { const st = fs.statSync(backup); res.backupAt = new Date(st.mtimeMs).toISOString(); res.backupAgeH = Math.round((Date.now() - st.mtimeMs) / 3600000); res.backup = backup; } catch { res.backup = backup + " (not found)"; } }
  execFile("git", ["-C", VAULT, "log", "-1", "--format=%cI"], { windowsHide: true }, (e, out) => {
    if (!e && out && out.trim()) { const t = Date.parse(out.trim()); if (!Number.isNaN(t)) { res.gitCommitAt = out.trim(); res.gitAgeH = Math.round((Date.now() - t) / 3600000); res.gitOk = true; } }
    else res.gitError = e ? String(e.message).split("\n")[0].slice(0, 120) : "no commits";
    cb(res);
  });
}

/* Bonus (two-way): mark a task done from the dashboard → change `- [ ]` to `- [x]` in the vault file. */
function markTaskDone(source, text) {
  if (!source || !text) return { error: "requires {source, text}" };
  const rel = String(source).replace(/\\/g, "/");
  if (!rel.startsWith("Tasks/") || rel.includes("..")) return { error: "source must be inside Tasks/" };
  const file = path.join(VAULT, rel);
  try {
    let txt = fs.readFileSync(file, "utf8");
    const needle = String(text).trim();
    const lines = txt.split(/\r?\n/);
    const i = lines.findIndex(l => /^\s*[-*] \[ \]/.test(l) && l.includes(needle));
    if (i === -1) return { error: "task not found (it may have changed)" };
    lines[i] = lines[i].replace("[ ]", "[x]");
    fs.writeFileSync(file, lines.join("\n"), "utf8");
    return { ok: true, rel, line: lines[i].trim() };
  } catch (e) { return { error: `update failed: ${e.message}` }; }
}

function readBody(req, res, cb) {
  let body = "", aborted = false;
  req.on("data", d => {
    body += d;
    if (body.length > 5e6 && !aborted) {           // R5: reply 413, don't leave the client hanging
      aborted = true;
      res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "body exceeds 5MB" }));
      req.destroy();
    }
  });
  req.on("end", () => { if (!aborted) cb(body); });
}

/* ---------------- http ---------------- */
/* S1: constant-time token compare (anti timing attack). S2: header-only auth — ?token= query is not accepted */
function safeEq(a, b) {
  const ba = Buffer.from(String(a || "")), bb = Buffer.from(String(b || ""));
  if (ba.length !== bb.length) { crypto.timingSafeEqual(bb, bb); return false; }
  return crypto.timingSafeEqual(ba, bb);
}
function authorized(req) {
  if (!TOKEN) return true;
  const remote = req.socket && (req.socket.remoteAddress || req.connection && req.connection.remoteAddress || "");
  if (/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote)) return true;
  return safeEq(req.headers["x-dash-token"] || "", TOKEN);
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".md": "text/markdown; charset=utf-8" };

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];

  if (url.startsWith("/api/")) {
    if (!authorized(req)) return json(res, 401, { error: "invalid/missing token — set the x-dash-token header" });
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
      if (url === "/api/task" && req.method === "POST")
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {agent,title,detail?}" }); }
          const r = createTask(d.agent, d.title, d.detail);
          json(res, r.error ? 400 : 200, r);
        });
      if (url === "/api/task/done" && req.method === "POST")
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {source,text}" }); }
          const r = markTaskDone(d.source, d.text);
          json(res, r.error ? 400 : 200, r);
        });
      if (url === "/api/schedule") return buildSchedule(r => json(res, 200, r));      // R#8
      if (url === "/api/vault-health") return buildVaultHealth(r => json(res, 200, r)); // R#9
      m = url.match(/^\/api\/agent\/([\w-]+)\/detail$/);
      if (m) { const d = agentDetail(m[1]); return json(res, d.error ? 404 : 200, d); }
      m = url.match(/^\/api\/agent\/([\w-]+)\/avatar$/);
      if (m && req.method === "POST") {
        const id = m[1];
        if (!loadConfig().agents.some(a => a.id === id)) return json(res, 404, { error: "unknown agent" });
        return readBody(req, res, body => {
          let data; try { data = JSON.parse(body).data; } catch { return json(res, 400, { error: "body must be JSON {data}" }); }
          const r = saveAvatar(id, data);
          json(res, r.error ? 400 : 200, r);
        });
      }
      return json(res, 404, { error: "unknown api" });
    } catch (err) { console.error("[api]", (err && err.stack) || err); return json(res, 500, { error: "internal error" }); }  // S12: don't echo internal details
  }

  // S5: path-traversal guard using path.relative (not startsWith), + URL decode
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

/* R1+R3: shutdown & crash handlers — SIGINT/SIGTERM/SIGHUP + uncaughtException are not covered by
   process.on("exit") (the event loop is dead at 'exit', so async taskkill never runs). Here the loop is still alive. */
let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return; shuttingDown = true;
  console.error(`[agentic-os] shutdown (${sig}) — stopping owned processes`);
  for (const id of procs.keys()) killOwned(id);
  try { server.close(); } catch {}
  setTimeout(() => process.exit(0), 500);   // give async taskkill time to finish
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => shutdown(sig));
process.on("uncaughtException", e => { console.error("[uncaughtException]", (e && e.stack) || e); shutdown("uncaughtException"); });
process.on("unhandledRejection", e => { console.error("[unhandledRejection]", (e && e.stack) || e); });
process.on("exit", () => { for (const id of procs.keys()) killOwned(id); });

server.on("error", e => {
  if (e.code === "EADDRINUSE") { console.error(`\n  Port ${PORT} is already in use. Run on another port: set PORT=4322 then npm run dev\n`); }
  else console.error("[server]", (e && e.stack) || e);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n  Agentic OS running at  http://localhost:${PORT}`);
  console.log(`  Vault data source:     ${VAULT}`);
  console.log(`  Agent config:          ${CONFIG_PATH}`);
  console.log(TOKEN ? "  Auth: token ACTIVE (x-dash-token)" : "  Auth: no token (local only). For remote access: set DASH_TOKEN.\n");
  setTimeout(pollAllStatus, 3000);       // initial status
  setInterval(pollAllStatus, 45000);     // R4: interval (45s) > gwCtl timeout (30s) + in-flight guard
  setTimeout(runDailyBridge, 10000);     // R#2: run the daily bridge once at startup
  setInterval(runDailyBridge, 3600000);  // R#2: then hourly (it existed before but was never invoked)
});

/* R#2: run scripts/hermes-daily-bridge.cjs (sync telemetry + vault daily note) */
function runDailyBridge() {
  const f = path.join(__dirname, "scripts", "hermes-daily-bridge.cjs");
  if (!fs.existsSync(f)) return;
  execFile(process.execPath, [f], { windowsHide: true, env: process.env }, e => { if (e) console.error("[daily-bridge]", e.message); });
}
