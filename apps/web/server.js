/* Agentic OS — zero-dependency Node server.
   Live dashboard from the Obsidian Vault + agent gateway launcher.
   Run: npm run dev  →  http://localhost:4321
   Remote:   set DASH_TOKEN=secret  →  access requires the token. */
const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const os = require("os");
const { spawn, execFile, spawnSync } = require("child_process");
const crypto = require("crypto");
const { createAccessPolicy } = require("./lib/access-policy.cjs");
const { resolveSummonProfile } = require("./lib/summon-profile.cjs");

/* Monorepo layout: this file lives in apps/web/, but runtime data (vault, config,
   telemetry, scripts, .env) stays at the repo ROOT so agent CLIs and bridges keep working. */
const ROOT = path.resolve(__dirname, "..", "..");

/* load .env (KEY=VALUE per line; real env vars win over file contents) */
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const PORT = process.env.PORT || 4321;
const VAULT = process.env.VAULT_PATH || path.join(ROOT, "Obsidian Vault");
const CONFIG_PATH = process.env.AGENTS_CONFIG || path.join(ROOT, "agents.config.json");
const TOKEN = process.env.DASH_TOKEN || "";
const ACCESS_POLICY = createAccessPolicy(process.env);
const TODAY_PROJECTION = import("./lib/today-projection.mjs");
const APPROVAL_QUEUE = import("./lib/approval-queue.mjs").then(({ createApprovalQueue }) => createApprovalQueue());
const VAULT_GRAPH = import("./lib/vault-graph.mjs");
const AGENT_TOPOLOGY = import("./lib/agent-topology.mjs");
const AGENT_DETAIL = import("./lib/agent-detail.mjs");
/* Synchronous handle to the (async-imported) ESM helper module. Populated on the first tick;
   readTelemetry/telemetryActivity are sync and used by buildState, so the server gates its
   listen() on this resolving (below). The `|| []` guards keep a first-tick request honest. */
let agentDetailLib = null;
AGENT_DETAIL.then(m => { agentDetailLib = m; }).catch(e => console.error("[agent-detail]", e.message));
/* PUBLIC = static source (images + runtime-uploaded avatars, never wiped by a build).
   DIST   = the built React app (`npm run build`). Requests resolve DIST first, then
   PUBLIC, then fall back to index.html — /avatars always comes from PUBLIC, because
   Vite's emptyOutDir would otherwise delete uploads on the next build. */
const PUBLIC = path.join(__dirname, "public");
const DIST = path.join(__dirname, "dist");
const IGNORE = new Set([".git", ".obsidian", "Assets", "node_modules"]);
const DAY = 86400000;
const LOG_MAX = 800;
const AVATAR_DIR = path.join(PUBLIC, "avatars");
const TELEMETRY_DIR = path.join(ROOT, "telemetry");
const LOG_DIR = path.join(TELEMETRY_DIR, "logs");   // R#4: per-agent run log, survives restarts
const TERMS_DIR = path.join(TELEMETRY_DIR, "terms"); // summoned-terminal pid/kill handshake files
const LOG_FILE_MAX = 1_000_000;                     // 1 MB/agent → naive rotation (keep the tail half)
const CLAUDE_PROJECTS = process.env.CLAUDE_PROJECTS || path.join(os.homedir(), ".claude", "projects");
for (const d of [AVATAR_DIR, TELEMETRY_DIR, LOG_DIR, TERMS_DIR]) { try { fs.mkdirSync(d, { recursive: true }); } catch {} }

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

/* saveConfig: the ONLY write path for agents.config.json — backs up the current file
   to <config>.bak first, writes pretty JSON, and invalidates the mtime cache. */
function saveConfig(cfg) {
  try { fs.copyFileSync(CONFIG_PATH, CONFIG_PATH + ".bak"); } catch {}
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  _cfgCache = { mtime: 0, data: null };   // force reload on next loadConfig()
}

/* /api/agents/add — register a new agent from the dashboard.
   Minimal shape: id, name; optional icon/role/accent; optional trigger+home → summonable (actions []). */
function addAgent(body) {
  const id = String(body.id || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(id)) return { error: "id must be a 2-32 char slug (a-z, 0-9, -)" };
  const name = String(body.name || "").replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, 40);
  if (!name) return { error: "name is required" };
  const cfg = loadConfig();
  if (cfg.agents.some(a => a.id === id)) return { error: `agent '${id}' already exists` };
  const accent = /^#[0-9a-fA-F]{6}$/.test(String(body.accent || "")) ? body.accent : undefined;
  const nodeNums = cfg.agents.map(a => Number((String(a.node || "").match(/(\d+)$/) || [])[1])).filter(n => !Number.isNaN(n));
  const agent = {
    id, name,
    icon: String(body.icon || "🤖").slice(0, 4),
    role: String(body.role || "Agent").trim().slice(0, 80),
    node: `Node-${(nodeNums.length ? Math.max(...nodeNums) : 0) + 1}`,
    lane: name.replace(/[^A-Za-z0-9]/g, ""),
    enabled: true,
    ...(accent ? { accent } : {}),
    note: `Registered via dashboard ${localISO().slice(0, 10)}. Observe-only; executable configuration requires a trusted config edit.`,
  };
  cfg.agents.push(agent);
  try { saveConfig(cfg); } catch (e) { return { error: `failed to write config: ${e.message}` }; }
  sysEvent(id, "ok", `agent registered via dashboard (${agent.node})`);
  return { ok: true, agent };
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

/* ---------------- project workspaces (view: Workspace) ----------------
   Projects/<slug>/ folders are WORKSPACES: project.md (goal/progress/status),
   decisions.md (append-only cross-agent log), next.md (resume pointer).
   Flat Projects/<name>.md notes still render (kind "note"), read-only.
   The dashboard writes ONLY inside Projects/<slug>/ it created or that already exists. */
const _docCache = new Map();   // abs path -> {mtime, text} — mtime-keyed, bounded
function readDoc(abs) {
  try {
    const st = fs.statSync(abs);
    const hit = _docCache.get(abs);
    if (hit && hit.mtime === st.mtimeMs) return hit.text;
    const text = fs.readFileSync(abs, "utf8");
    if (_docCache.size > 500) _docCache.clear();
    _docCache.set(abs, { mtime: st.mtimeMs, text });
    return text;
  } catch { return null; }
}

function parseFM(text) {
  const fm = {}; let body = text || "";
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(body);
  if (m) {
    body = body.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
      if (kv) fm[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return { fm, body };
}

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/* slug is path-safe by construction (no dots/slashes pass the regex) */
function projectBySlug(slug) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(slug))) return null;
  const dir = path.join(VAULT, "Projects", slug);
  try { if (fs.statSync(dir).isDirectory()) return { slug, kind: "workspace", dir, rel: `Projects/${slug}/project.md` }; } catch {}
  const flat = path.join(VAULT, "Projects", `${slug}.md`);
  try { if (fs.statSync(flat).isFile()) return { slug, kind: "note", rel: `Projects/${slug}.md` }; } catch {}
  return null;
}

/* goal/progress/status from the main note: frontmatter wins, checkboxes fill the gap */
function projectMeta(rel, mtime) {
  const text = readDoc(path.join(VAULT, rel)) || "";
  const { fm, body } = parseFM(text);
  const boxes = body.match(/^\s*[-*] \[[ xX]\]/gm) || [];
  const done = body.match(/^\s*[-*] \[[xX]\]/gm) || [];
  let progress = Number(fm.progress);
  if (Number.isFinite(progress)) progress = Math.max(0, Math.min(100, Math.round(progress)));
  else progress = boxes.length ? Math.round((done.length / boxes.length) * 100) : null;
  const goal = String(fm.goal || (body.split(/\r?\n/).find(l => l.trim() && !/^[#>\-*!\[|`]/.test(l.trim())) || "")).slice(0, 240);
  const agents = fm.agents ? fm.agents.replace(/[[\]]/g, "").split(",").map(s => s.trim()).filter(Boolean) : [];
  const days = mtime ? Math.floor((Date.now() - mtime) / DAY) : 999;
  const status = String(fm.status || (days <= 7 ? "active" : "parked")).toLowerCase().slice(0, 16);
  return { title: fm.title || null, goal, progress, agents, status, tasksOpen: boxes.length - done.length };
}

function decisionList(slug, limit = 14) {
  const text = readDoc(path.join(VAULT, "Projects", slug, "decisions.md"));
  if (!text) return [];
  return text.split(/\r?\n/)
    .filter(l => /^\s*[-*]\s+\S/.test(l))
    .map(l => l.replace(/^\s*[-*]\s+/, "").replace(/\*\*/g, "").slice(0, 240))
    .slice(-limit).reverse();   // newest last on disk → newest first for the UI
}

function nextPointer(slug) {
  const text = readDoc(path.join(VAULT, "Projects", slug, "next.md"));
  if (!text) return null;
  const line = parseFM(text).body.split(/\r?\n/).find(l => l.trim() && !/^[#>]/.test(l.trim()));
  return line ? line.trim().slice(0, 300) : null;
}

function buildProjects(files) {
  const out = [];
  const bySlug = new Map();   // workspace slug -> newest mtime anywhere in the folder
  for (const f of files) {
    if (!f.rel.startsWith("Projects/")) continue;
    const parts = f.rel.split("/");
    if (parts.length >= 3) {
      const slug = parts[1];
      if (!bySlug.has(slug) || f.mtime > bySlug.get(slug)) bySlug.set(slug, f.mtime);
    }
  }
  for (const [slug, mtime] of bySlug) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) continue;   // unsafe folder name → not routable, skip
    const rel = `Projects/${slug}/project.md`;
    if (!files.some(f => f.rel === rel)) continue;   // folder without project.md → not a workspace
    const meta = projectMeta(rel, mtime);
    const dec = decisionList(slug, 1);
    out.push({
      slug, kind: "workspace", rel, name: meta.title || slug,
      updated: new Date(mtime).toISOString().slice(0, 10), updatedAt: mtime,
      goal: meta.goal, progress: meta.progress, status: meta.status,
      agents: meta.agents, tasksOpen: meta.tasksOpen,
      lastDecision: dec.length ? dec[0] : null,
    });
  }
  for (const f of files) {
    if (!(f.rel.startsWith("Projects/") && f.rel.split("/").length === 2 && f.rel.endsWith(".md"))) continue;
    const name = f.rel.replace("Projects/", "").replace(".md", "");
    const meta = projectMeta(f.rel, f.mtime);
    out.push({
      slug: slugify(name) || name, kind: "note", rel: f.rel, name: meta.title || name,
      updated: new Date(f.mtime).toISOString().slice(0, 10), updatedAt: f.mtime,
      goal: meta.goal, progress: meta.progress, status: meta.status,
      agents: meta.agents, tasksOpen: meta.tasksOpen, lastDecision: null,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/* the Continue brief: what an agent needs to resume this project with full context */
function projectBrief(p, meta, decisions, next) {
  return [
    `## Resume brief — ${meta.title || p.slug}`,
    meta.goal ? `**Goal:** ${meta.goal}` : null,
    `**Status:** ${meta.status}${meta.progress != null ? ` · ${meta.progress}%` : ""}${meta.tasksOpen ? ` · ${meta.tasksOpen} open tasks` : ""}`,
    next ? `**Next:** ${next}` : null,
    decisions.length ? `**Recent decisions:**\n${decisions.slice(0, 5).map(d => `- ${d}`).join("\n")}` : null,
    `**Workspace:** Projects/${p.slug}/ (project.md · decisions.md · next.md)`,
  ].filter(Boolean).join("\n");
}

function projectDetail(slug) {
  const p = projectBySlug(slug);
  if (!p) return { error: `unknown project '${slug}'` };
  const files = walkVault();
  let mtime = 0;
  for (const f of files) if (f.rel.startsWith(p.kind === "workspace" ? `Projects/${slug}/` : p.rel) && f.mtime > mtime) mtime = f.mtime;
  const meta = projectMeta(p.rel, mtime);
  const decisions = p.kind === "workspace" ? decisionList(slug) : [];
  const next = p.kind === "workspace" ? nextPointer(slug) : null;
  const docs = p.kind === "workspace"
    ? files.filter(f => f.rel.startsWith(`Projects/${slug}/`)).sort((a, b) => b.mtime - a.mtime).slice(0, 8)
        .map(f => ({ rel: f.rel, updated: new Date(f.mtime).toISOString().slice(0, 16).replace("T", " ") }))
    : [];
  return {
    slug, kind: p.kind, rel: p.rel, name: meta.title || slug,
    goal: meta.goal, progress: meta.progress, status: meta.status,
    agents: meta.agents, tasksOpen: meta.tasksOpen,
    updated: mtime ? new Date(mtime).toISOString().slice(0, 10) : null,
    decisions, next, docs,
    brief: projectBrief(p, meta, decisions, next),
  };
}

function createProject(body) {
  const name = String(body.name || "").replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, 60);
  if (!name) return { error: "name is required" };
  const slug = slugify(name);
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return { error: "name must contain letters or numbers" };
  const dir = path.join(VAULT, "Projects", slug);
  if (fs.existsSync(dir) || fs.existsSync(path.join(VAULT, "Projects", `${slug}.md`)))
    return { error: `project '${slug}' already exists` };
  const goal = String(body.goal || "").trim().replace(/\r?\n/g, " ").slice(0, 300);
  const date = localISO().slice(0, 10);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "project.md"),
      `---\ntitle: ${JSON.stringify(name)}\nstatus: active\nprogress: 0\ncreated: ${date}\ngoal: ${JSON.stringify(goal || "(define the goal)")}\n---\n\n# ${name}\n\n${goal ? goal + "\n\n" : ""}## Milestones\n\n- [ ] Define the first milestone\n`, "utf8");
    fs.writeFileSync(path.join(dir, "decisions.md"),
      `# Decisions — ${name}\n\n> Append-only log. ⚡auto entries are captured from agent telemetry.\n\n- **${localISO().slice(0, 16).replace("T", " ")}** · Dashboard — workspace created\n`, "utf8");
    fs.writeFileSync(path.join(dir, "next.md"),
      `# Next — ${name}\n\nDefine the next concrete step here. The Continue brief leads with it.\n`, "utf8");
    sysEvent("dashboard", "ok", `project workspace created: ${slug}`);
    return { ok: true, slug };
  } catch (e) { return { error: `failed to create workspace: ${e.message}` }; }
}

function addDecision(slug, body) {
  const p = projectBySlug(slug);
  if (!p) return { error: `unknown project '${slug}'` };
  if (p.kind !== "workspace") return { error: "flat note projects have no decision log — create a workspace" };
  const text = String(body.text || "").trim().replace(/[\r\n]+/g, " ").slice(0, 400);
  if (!text) return { error: "decision text is empty" };
  const who = String(body.agent || "Boss").replace(/[\r\n|]+/g, " ").trim().slice(0, 40) || "Boss";
  const line = `- **${localISO().slice(0, 16).replace("T", " ")}** · ${who} — ${text}\n`;
  try {
    const f = path.join(p.dir, "decisions.md");
    if (!fs.existsSync(f))
      fs.writeFileSync(f, `# Decisions — ${slug}\n\n> Append-only log. ⚡auto entries are captured from agent telemetry.\n\n${line}`, "utf8");
    else fs.appendFileSync(f, line, "utf8");
    return { ok: true, line: line.trim() };
  } catch (e) { return { error: `failed to write decision: ${e.message}` }; }
}

/* -------- project memory capture: telemetry task_done → decisions.md --------
   Watermarked per agent (telemetry/memory-capture.json) so nothing is written twice.
   An event lands in a workspace when it carries an explicit `project` field, or when
   its name/detail mentions the workspace slug. Honest capture only — no inference. */
const MEM_WM = path.join(TELEMETRY_DIR, "memory-capture.json");
function captureMemory() {
  let cfg; try { cfg = loadConfig(); } catch { return; }
  let slugs = [];
  try {
    slugs = fs.readdirSync(path.join(VAULT, "Projects"), { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name);
  } catch {}
  if (!slugs.length) return;
  let wm = {}; try { wm = JSON.parse(fs.readFileSync(MEM_WM, "utf8")); } catch {}
  let dirty = false;
  for (const a of cfg.agents) {
    const last = wm[a.id] || 0;
    let maxTs = last;
    const hits = [];
    for (const e of readTelemetry(a.id)) {   // newest-first, ≤30 events
      const ts = e.ts ? Date.parse(e.ts) : 0;
      if (!ts || ts <= last) continue;
      if (ts > maxTs) maxTs = ts;
      if (e.type !== "task_done") continue;
      const hay = `${e.project || ""} ${e.name || ""} ${e.detail || ""}`.toLowerCase();
      const slug = (e.project && slugs.includes(String(e.project))) ? String(e.project)
        : slugs.find(s => hay.includes(s.toLowerCase()));
      if (slug) hits.push({ slug, e, ts });
    }
    for (const { slug, e, ts } of hits.reverse()) {   // oldest first → chronological log
      const line = `- **${new Date(ts).toISOString().slice(0, 16).replace("T", " ")}** · ${a.name} — ${String(e.name || "task").slice(0, 120)}${e.detail ? `: ${String(e.detail).replace(/[\r\n]+/g, " ").slice(0, 200)}` : ""} ⚡auto\n`;
      try {
        const f = path.join(VAULT, "Projects", slug, "decisions.md");
        if (!fs.existsSync(f))
          fs.writeFileSync(f, `# Decisions — ${slug}\n\n> Append-only log. ⚡auto entries are captured from agent telemetry.\n\n${line}`, "utf8");
        else fs.appendFileSync(f, line, "utf8");
        sysEvent(a.id, "ok", `memory captured → Projects/${slug}`);
      } catch (err) { console.error("[memory]", err.message); }
    }
    if (maxTs > last) { wm[a.id] = maxTs; dirty = true; }
  }
  if (dirty) { try { fs.writeFileSync(MEM_WM, JSON.stringify(wm), "utf8"); } catch {} }
}

function buildState() {
  const cfg = loadConfig();
  const files = walkVault();
  const now = Date.now();
  const tasks = openTasks();
  const um = uptimeMap();                       // R#2: 24-hour uptime per agent (single file read)
  const inbox = files.filter(f => f.rel.startsWith("Inbox/"));
  const projects = buildProjects(files);
  return {
    vault: VAULT,
    agency: cfg.agency || "AGENTIC//OS",
    generatedAt: new Date().toISOString(),
    configError,                              // R#11: null when healthy, {msg,at} when config is broken
    auth: TOKEN ? "token-locked" : "local-only",
    events: sysLog.slice(-30).reverse(),      // topology SYSTEM LOG (newest first)

    stats: {
      notes: { value: files.length, label: "Total vault notes" },
      activeWeek: { value: files.filter(f => now - f.mtime < 7 * DAY).length, label: "Notes changed in the last 7 days" },
      openTasks: { value: tasks.length, label: "Open checkboxes in Tasks/" },
      projects: { value: projects.length, label: "Projects in the workspace" },
    },
    agents: cfg.agents.map(a => ({ ...a, gateway: undefined, actions: gwActions(a), canSummon: !!(a.gateway && a.gateway.home && a.gateway.trigger), ...agentVaultStatus(files, a), proc: procInfo(a.id), term: termInfo(a.id), avatar: avatarUrl(a.id), uptime: um[a.id] || null })),
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
const summons = new Map();  // id -> {pid,startedAt,alive,launchedAt} — summoned admin terminals (pid-file handshake)

/* system-event ring buffer (topology SYSTEM LOG panel) */
const sysLog = [];
function sysEvent(id, level, msg) {
  sysLog.push({ ts: new Date().toISOString(), id, level, msg: String(msg).slice(0, 160) });
  if (sysLog.length > 50) sysLog.splice(0, sysLog.length - 50);
}

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
  // a live summoned terminal counts as "running" for agents with no service status of their own
  const st = summons.get(id);
  if (st && st.alive) {
    const ag = agentById(id);
    if (ag && !gwActions(ag).includes("status") && !(ag.gateway && ag.gateway.probe))
      return { status: "running", mode: "terminal", pid: st.pid, startedAt: st.startedAt, exitCode: null, logSize: p ? p.seq : 0, reason: null, statusText: `Summoned terminal · pid ${st.pid}` };
  }
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
  sysEvent(id, "error", `DOWN — ${reason}`);
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
    const complete = running => {
      if (action === "status" || action === "start" || action === "restart") {
        const prev = gwCache.get(id);
        gwCache.set(id, { running, text, at: Date.now(), exitCode: code });
        logUptime(id, running);
        if (prev && prev.running && !running) { alertDown(id, `gateway went down (detected during ${action})`); if (action === "status") maybeWatchdog(id); }
      } else if (action === "stop") { gwCache.set(id, { running: false, text, at: Date.now(), exitCode: code }); logUptime(id, false); }
      if (action !== "status") sysEvent(id, code === 0 ? "ok" : "error", `gateway ${action} → ${running ? "running" : "stopped"}${code ? ` (exit ${code})` : ""}`);
      finish({ ok: code === 0, code, action, running, output: text });
    };
    if ((action === "start" || action === "restart") && g.probe?.port) {
      clearTimeout(timer);
      let attempts = 20;
      const check = () => probePort(g.probe.host, g.probe.port, up => {
        if (up || --attempts === 0) return complete(up);
        setTimeout(check, 2500);
      });
      return check();
    }
    complete(detectRunning(text));
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
  sysEvent(id, "ok", `gateway run (owned) pid ${child.pid}`);
  return { ok: true, pid: child.pid, mode: "run (owned)" };
}

/* ---------------- summoned terminals (pid-file handshake + kill-file self-termination) ----------------
   Summon opens an ADMIN terminal (wt.exe/powershell -Verb RunAs) that runs the agent's trigger CLI.
   The dashboard is non-elevated, so it can't kill the elevated shell directly. Instead the elevated
   shell registers its own $PID to telemetry/terms/<id>.pid and runs a background job that watches for
   telemetry/terms/<id>.kill — when that file appears, the shell taskkills its own tree (no second UAC). */
function termPidFile(id) { return path.join(TERMS_DIR, `${id}.pid`); }
function termKillFile(id) { return path.join(TERMS_DIR, `${id}.kill`); }
function readTermPid(id) {
  try { const o = JSON.parse(fs.readFileSync(termPidFile(id), "utf8")); return o && o.pid ? o : null; } catch { return null; }
}
function cleanupTerm(id) {
  try { fs.unlinkSync(termPidFile(id)); } catch {}
  try { fs.unlinkSync(termKillFile(id)); } catch {}
  summons.delete(id);
}
/* poll liveness of every tracked summoned terminal with ONE tasklist call.
   Image-name check (powershell/pwsh) guards against PID recycling. */
function pollSummons(cb) {
  let ids = [];
  try { ids = loadConfig().agents.map(a => a.id); } catch { ids = [...summons.keys()]; }
  const tracked = [];
  for (const id of ids) {
    const f = readTermPid(id);
    if (f) {
      const s = summons.get(id) || { launchedAt: 0, alive: false };
      summons.set(id, { ...s, pid: f.pid, startedAt: f.startedAt || s.startedAt || null });
      tracked.push(id);
    }
  }
  if (!tracked.length) { cb && cb(); return; }
  execFile("tasklist", ["/FO", "CSV", "/NH"], { windowsHide: true }, (e, out) => {
    const img = new Map();  // pid -> image name
    if (!e) for (const line of String(out).split(/\r?\n/)) {
      const m = line.match(/^"([^"]+)","(\d+)"/);
      if (m) img.set(Number(m[2]), m[1].toLowerCase());
    }
    for (const id of tracked) {
      const s = summons.get(id);
      if (!s) continue;
      const alive = /powershell|pwsh/.test(img.get(s.pid) || "");
      if (alive) s.alive = true;
      else if (s.alive || Date.now() - (s.launchedAt || 0) > 120000) {
        if (s.alive) sysEvent(id, "warn", `summoned terminal pid ${s.pid} closed`);
        cleanupTerm(id);  // was alive & now gone, or stale pid file from a previous boot
      }
    }
    cb && cb();
  });
}
function termInfo(id) {
  const s = summons.get(id);
  if (!s) return null;
  if (s.alive) return { pid: s.pid, startedAt: s.startedAt, alive: true };
  if (Date.now() - (s.launchedAt || 0) < 120000) return { alive: false, pending: true };
  return null;
}

/* terminal: open a Windows Terminal (elevated/admin unless gateway.elevate === false) that cd's to the
   agent folder & auto-runs the command. Summon mode registers the shell for tracked stop (see above). */
function gwTerminal(id, mode, cb) {
  const agent = agentById(id);
  if (!agent) return cb({ error: `unknown agent '${id}'` });
  const g = agent.gateway;
  if (!agent.enabled || !g) return cb({ error: agent.note || `gateway '${id}' not ready (enabled:false)` });
  let dir, cmd;
  if (mode === "summon") {
    const profile = resolveSummonProfile(agent);
    if (!profile.command) return cb({ error: `${agent.name} has no trigger to summon it with` });
    dir = profile.cwd; cmd = profile.command;
    const cur = summons.get(id);
    if (cur && cur.alive) return cb({ error: `${agent.name} already has a summoned terminal (pid ${cur.pid}) — stop it first` });
    // install gate: if the CLI is not on this machine, don't open a dead terminal —
    // point the user at the agent's installer instead (gateway.install {cmd,url})
    const exe = String(g.trigger).trim().split(/\s+/)[0];
    const found = /[\\/]/.test(exe)
      ? fs.existsSync(exe)
      : spawnSync("where.exe", [exe], { windowsHide: true, timeout: 4000 }).status === 0;
    if (!found) {
      const inst = g.install || null;
      return cb({
        error: `${agent.name} CLI '${exe}' is not installed on this machine`,
        notInstalled: true,
        install: inst || { note: "no installer configured — add gateway.install {cmd,url} in agents.config.json" },
      });
    }
  } else if (mode === "start") { if (!g.bin) return cb({ error: `${agent.name} has no gateway` }); dir = g.cwd || loadConfig().workdir; cmd = `${g.bin} start`; }
  else if (mode === "run") { if (!g.bin) return cb({ error: `${agent.name} has no gateway` }); dir = g.cwd || loadConfig().workdir; cmd = g.runCmd || `${g.bin} run`; }
  else return cb({ error: `unknown terminal mode '${mode}' (summon|start|run)` });
  if (!fs.existsSync(dir)) {
    if (mode === "summon" && g.home) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }
    if (!fs.existsSync(dir)) return cb({ error: `folder does not exist: ${dir}` });
  }

  // ponytail: dir & cmd come from config (trusted). Escape single quotes for the PowerShell strings.
  const q = s => String(s).replace(/'/g, "''");
  // inner bootstrap runs INSIDE the (possibly elevated) terminal; -EncodedCommand avoids nested quoting
  let inner = "Set-Location -LiteralPath '" + q(dir) + "'\n" + cmd + "\n";
  if (mode === "summon") {
    inner =
      "$ErrorActionPreference='SilentlyContinue'\n" +
      "Set-Content -LiteralPath '" + q(termPidFile(id)) + "' -Value ('{\"pid\":' + $PID + ',\"startedAt\":\"' + (Get-Date -Format o) + '\"}') -Encoding ASCII\n" +
      "$null = Start-Job -ArgumentList $PID,'" + q(termKillFile(id)) + "' -ScriptBlock { param($p,$k) while($true){ if(Test-Path $k){ Remove-Item $k -Force; taskkill /PID $p /T /F | Out-Null }; Start-Sleep -Seconds 2 } }\n" +
      "Set-Location -LiteralPath '" + q(dir) + "'\n" +
      cmd + "\n";
  }
  const b64 = Buffer.from(inner, "utf16le").toString("base64");
  const elevate = g.elevate !== false;
  const verb = elevate ? "-Verb RunAs " : "";
  const ps =
    `$wt = Get-Command wt.exe -ErrorAction SilentlyContinue; ` +
    `if ($wt) { Start-Process wt.exe ${verb}-ArgumentList '-d','${q(dir)}','powershell','-NoExit','-EncodedCommand','${b64}' } ` +
    `else { Start-Process powershell ${verb}-ArgumentList '-NoExit','-EncodedCommand','${b64}' }`;

  if (mode === "summon") {
    try { fs.unlinkSync(termPidFile(id)); } catch {}
    try { fs.unlinkSync(termKillFile(id)); } catch {}
    summons.set(id, { pid: null, startedAt: null, alive: false, launchedAt: Date.now() });
  }
  // attached spawn (NOT detached): Start-Process -Verb RunAs throws when UAC is declined,
  // so the exit code + stderr tell us whether the terminal actually opened.
  let done = false, errOut = "", child;
  const finish = obj => { if (done) return; done = true; clearTimeout(timer); cb(obj); };
  try { child = spawn("powershell", ["-NoProfile", "-Command", ps], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] }); }
  catch (e) { if (mode === "summon") summons.delete(id); return cb({ error: `failed to open terminal: ${e.message}` }); }
  // UAC prompts can sit unanswered — after 45s report "pending" and let the poll settle it later
  const timer = setTimeout(() => finish({ ok: true, mode, dir, cmd, terminal: true, pending: true, note: "waiting for UAC confirmation" }), 45000);
  child.stderr.on("data", d => { errOut += d; });
  child.on("error", err => { if (mode === "summon") summons.delete(id); finish({ error: `failed to open terminal: ${err.message}` }); });
  child.on("exit", code => {
    if (code === 0) {
      if (mode === "summon") {
        sysEvent(id, "ok", "summon terminal opened");
        appendDiskLog(id, [{ t: new Date().toISOString().slice(11, 19), s: "sys", line: `[agentic-os] summon terminal opened (${elevate ? "admin" : "user"}): ${cmd}  (cwd: ${dir})` }]);
        setTimeout(pollSummons, 4000); setTimeout(pollSummons, 12000);
      }
      return finish({ ok: true, mode, dir, cmd, terminal: true, elevated: elevate });
    }
    const msg = /canceled by the user/i.test(errOut) ? "UAC declined by user" : ((errOut.trim().split(/\r?\n/)[0] || `exit code ${code}`).slice(0, 200));
    if (mode === "summon") { summons.delete(id); sysEvent(id, "error", `summon failed: ${msg}`); }
    finish({ error: `terminal not opened: ${msg}` });
  });
}

/* stop-term: close a summoned terminal. Normal path = write the kill file (the elevated shell kills
   itself → no UAC). Fallback after 10s = elevated taskkill (one UAC prompt). */
function gwStopTerm(id, cb) {
  const agent = agentById(id);
  if (!agent) return cb({ error: `unknown agent '${id}'` });
  pollSummons(() => {
    const s = summons.get(id);
    if (!s || !s.pid || !s.alive) return cb({ error: `no summoned terminal tracked for ${agent.name}` });
    const pid = s.pid;
    try { fs.writeFileSync(termKillFile(id), String(Date.now())); } catch (e) { return cb({ error: `cannot write kill file: ${e.message}` }); }
    const t0 = Date.now();
    const check = () => {
      execFile("tasklist", ["/FO", "CSV", "/NH", "/FI", `PID eq ${pid}`], { windowsHide: true }, (e, out) => {
        const alive = !e && /"\d+"/.test(String(out));
        if (!alive) {
          cleanupTerm(id);
          sysEvent(id, "ok", `summoned terminal pid ${pid} closed`);
          appendDiskLog(id, [{ t: new Date().toISOString().slice(11, 19), s: "sys", line: `[agentic-os] summoned terminal pid ${pid} closed` }]);
          return cb({ ok: true, pid, closed: true });
        }
        if (Date.now() - t0 < 10000) return setTimeout(check, 1000);
        // watcher didn't fire → escalate: elevated taskkill (one UAC prompt)
        const ps2 = `Start-Process taskkill -Verb RunAs -ArgumentList '/PID','${pid}','/T','/F' -Wait`;
        execFile("powershell", ["-NoProfile", "-Command", ps2], { windowsHide: true, timeout: 60000 }, () => {
          execFile("tasklist", ["/FO", "CSV", "/NH", "/FI", `PID eq ${pid}`], { windowsHide: true }, (e2, out2) => {
            if (!e2 && /"\d+"/.test(String(out2))) return cb({ error: "terminal still alive — UAC declined or kill failed" });
            cleanupTerm(id);
            sysEvent(id, "ok", `summoned terminal pid ${pid} force-closed`);
            cb({ ok: true, pid, closed: true, forced: true });
          });
        });
      });
    };
    setTimeout(check, 1500);
  });
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
  sysEvent(id, "warn", `watchdog auto-restart (attempt ${hits.length}/3)`);
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

/* ---------------- graph vault (view: Neural Vault) ----------------
   Four layers, each tagged on the edge so the client can toggle them and the
   report can still count wikilinks alone (totals.edges must stay honest):
     link   — a real [[wikilink]] or [](note.md) between two existing notes
     ghost  — a wikilink whose target note does not exist yet (Obsidian shows these too)
     tag    — note → #tag hub (a star, not a clique: a 20-note tag costs 20 edges, not 190)
     folder — note → containing folder → parent folder (the structural skeleton)
   Link resolution is path-aware: the vault holds 52 duplicate basenames, and a
   first-wins basename map silently orphans every one of the losers. */
const CODE_FENCE = /(^|\n)\s*(```|~~~)[\s\S]*?(\n\s*\2|$)/g;
const INLINE_CODE = /`[^`\n]*`/g;

function resolveLink(raw, fromRel, byPath, byBase) {
  const clean = raw.trim().replace(/\\/g, "/").replace(/\.md$/i, "").replace(/^\.\//, "");
  if (!clean) return null;
  const lc = clean.toLowerCase();
  if (byPath.has(lc)) return byPath.get(lc);            // [[Brains/Copilot/Note]] — exact path
  const cands = byBase.get(lc.split("/").pop());
  if (!cands || !cands.length) return null;
  if (cands.length === 1) return cands[0];
  // Ambiguous basename. Prefer a path ending with what was written, then a sibling
  // of the source note, then the shallowest path — Obsidian's own resolution order.
  const suffix = cands.find(c => c.toLowerCase().replace(/\.md$/, "").endsWith("/" + lc));
  if (suffix) return suffix;
  const dir = fromRel.slice(0, fromRel.lastIndexOf("/") + 1);
  const sibling = cands.find(c => c.startsWith(dir) && !c.slice(dir.length).includes("/"));
  if (sibling) return sibling;
  return cands.slice().sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0];
}

let graphCache = { t: 0, data: null };
let parityGraphCache = { t: 0, data: null };
async function buildParityGraph() {
  if (parityGraphCache.data && Date.now() - parityGraphCache.t < 60000) return parityGraphCache.data;
  const { buildVaultGraph } = await VAULT_GRAPH;
  const files = walkVault().map((file) => {
    try { return { ...file, text: fs.readFileSync(path.join(VAULT, file.rel), "utf8") }; }
    catch { return null; }
  }).filter(Boolean);
  const data = buildVaultGraph({ files });
  parityGraphCache = { t: Date.now(), data };
  return data;
}

function legacyDecisionContext(slug, entries) {
  return entries.map((text, index) => ({
    id: `${slug}-decision-${index + 1}`,
    text,
    status: "context",
  }));
}

function todayProjectData(files) {
  return buildProjects(files).map(project => {
    const text = readDoc(path.join(VAULT, ...project.rel.split("/")));
    const body = parseFM(text).body;
    const tasks = body.split(/\r?\n/).flatMap((line, index) => {
      const match = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/);
      if (!match) return [];
      return [{ id: `${project.slug}-task-${index + 1}`, title: match[2].replace(/<!--.*?-->/g, "").trim(), status: match[1].toLowerCase() === "x" ? "completed" : "pending" }];
    });
    const decisions = project.kind === "workspace"
      ? legacyDecisionContext(project.slug, decisionList(project.slug))
      : [];
    const prefix = project.kind === "workspace" ? `Projects/${project.slug}/` : "";
    const recentArtifacts = prefix ? files
      .filter(file => file.rel.startsWith(prefix) && !new Set(["project.md", "decisions.md", "next.md"]).has(file.rel.slice(prefix.length).toLowerCase()))
      .sort((a, b) => b.mtime - a.mtime).slice(0, 8)
      .map(file => ({ path: file.rel, updatedAt: file.mtime })) : [];
    return { ...project, id: project.slug, tasks, decisions, recentArtifacts };
  });
}

async function buildLiveAgentTopology() {
  const { buildAgentTopology } = await AGENT_TOPOLOGY;
  const { coAssignments } = await AGENT_DETAIL;
  const state = buildState();
  // Verified agent↔agent relationships from the vault: two agents on one project (provenance =
  // the task line). Directed task/subagent/comm edges appear here too once agents report them.
  const taskFiles = readTaskFiles();
  const co = coAssignments(taskFiles, state.agents);
  return buildAgentTopology({ agents: state.agents, coAssignments: co });
}
/* readTaskFiles: raw text of every vault Tasks/*.md, for co-assignment discovery. */
function readTaskFiles() {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(path.join(VAULT, "Tasks")).filter(n => n.endsWith(".md")); } catch {}
  for (const n of names) {
    try { out.push({ rel: `Tasks/${n}`, text: fs.readFileSync(path.join(VAULT, "Tasks", n), "utf8") }); } catch {}
  }
  return out;
}
function buildGraph() {
  if (graphCache.data && Date.now() - graphCache.t < 60000) return graphCache.data;
  try {
  const files = walkVault();
  const nodes = new Map();   // id -> node
  const byPath = new Map();  // "brains/hermes/note" -> rel
  const byBase = new Map();  // "note" -> [rel, rel, …]  — every candidate, not first-wins

  const addNode = (id, n) => { if (!nodes.has(id)) nodes.set(id, { id, deg: 0, ...n }); return nodes.get(id); };

  for (const f of files) {
    const label = f.rel.split("/").pop().replace(/\.md$/, "");
    const dir = f.rel.includes("/") ? f.rel.slice(0, f.rel.lastIndexOf("/")) : "";
    addNode(f.rel, { label, folder: dir || "(root)", type: "note", mtime: f.mtime });
    byPath.set(f.rel.toLowerCase().replace(/\.md$/, ""), f.rel);
    const base = label.toLowerCase();
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(f.rel);
  }

  const edges = [];
  const seen = new Set();
  const push = (s, t, type) => {
    if (s === t) return;
    const key = (s < t ? s + "\0" + t : t + "\0" + s) + "\0" + type;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ s, t, type });
    nodes.get(s).deg++; nodes.get(t).deg++;
  };

  for (const f of files) {
    let text; try { text = fs.readFileSync(path.join(VAULT, f.rel), "utf8"); } catch { continue; }
    const body = text.replace(CODE_FENCE, "\n").replace(INLINE_CODE, " ");

    // [[Target|alias]] · [[Target#heading]] · ![[Embed]]
    for (const m of body.matchAll(/!?\[\[([^\]\n]+?)\]\]/g)) {
      const raw = m[1].split("|")[0].split("#")[0];
      if (!raw.trim()) continue;
      const target = resolveLink(raw, f.rel, byPath, byBase);
      if (target) { push(f.rel, target, "link"); continue; }
      const name = raw.trim().replace(/\.md$/i, "").split("/").pop();
      if (!/^[\w][\w .'&()+-]{1,60}$/.test(name)) continue;   // drop prose noise: "...", "[ abc", ":/"
      const gid = "ghost:" + name;
      addNode(gid, { label: name, folder: "(unresolved)", type: "ghost", mtime: 0 });
      push(f.rel, gid, "ghost");
    }
    // [text](Some Note.md)
    for (const m of body.matchAll(/\]\(([^)\s]+\.md)\)/g)) {
      let raw; try { raw = decodeURIComponent(m[1]); } catch { raw = m[1]; }
      const target = resolveLink(raw, f.rel, byPath, byBase);
      if (target) push(f.rel, target, "link");
    }
    // #tag — code is already stripped, and "# Heading" needs a space so it cannot match
    for (const m of body.matchAll(/(?:^|[\s(])#([A-Za-z][\w-]*(?:\/[\w-]+)*)/gm)) {
      const tid = "tag:" + m[1].toLowerCase();
      addNode(tid, { label: "#" + m[1], folder: "(tags)", type: "tag", mtime: 0 });
      push(f.rel, tid, "tag");
    }
  }

  // folder skeleton: note → its folder → parent folder → …
  for (const f of files) {
    if (!f.rel.includes("/")) continue;
    const parts = f.rel.split("/").slice(0, -1);
    let prev = null;
    for (let i = 0; i < parts.length; i++) {
      const fid = "folder:" + parts.slice(0, i + 1).join("/");
      addNode(fid, { label: parts[i], folder: parts[0], type: "folder", mtime: 0 });
      if (prev) push(prev, fid, "folder");
      prev = fid;
    }
    if (prev) push(f.rel, prev, "folder");
  }

  const linked = new Set();
  for (const e of edges) {
    if (e.type !== "link" && e.type !== "ghost") continue;
    linked.add(e.s); linked.add(e.t);
  }
  const stats = {
    notes: files.length,
    links: edges.filter(e => e.type === "link").length,
    ghosts: edges.filter(e => e.type === "ghost").length,
    tagEdges: edges.filter(e => e.type === "tag").length,
    folderEdges: edges.filter(e => e.type === "folder").length,
    orphans: [...nodes.values()].filter(n => n.type === "note" && !linked.has(n.id)).length,
  };
  graphCache = { t: Date.now(), data: { nodes: [...nodes.values()], edges, stats, generatedAt: new Date().toISOString() } };
  return graphCache.data;
  } catch (e) {
    if (graphCache.data) return graphCache.data;   // R18: don't poison the cache to null
    return { nodes: [], edges: [], stats: { notes: 0, links: 0, ghosts: 0, tagEdges: 0, folderEdges: 0, orphans: 0 }, generatedAt: new Date().toISOString(), error: e.message };
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

/* ------- cross-agent telemetry: agentic-os/telemetry/<id>.jsonl -------
   Windowing + activity derivation live in lib/agent-detail.mjs (pure + unit-tested). The window
   reserves room for real signal so a heartbeat flood can no longer evict subagent/task events. */
function readTelemetry(id) {
  const file = path.join(TELEMETRY_DIR, `${id}.jsonl`);
  if (!fs.existsSync(file) || !agentDetailLib) return [];
  const events = agentDetailLib.parseTelemetry(tailRead(file, 100000));
  return agentDetailLib.selectTelemetryWindow(events, { limit: 30 });   // newest-first
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
    proc: procInfo(id), term: termInfo(id), ...agentVaultStatus(files, agent),
    log: p && p.log.length ? p.log.slice(-40) : readDiskLog(id, 40),   // R#4: fall back to disk after a restart
    laneFiles, telemetry: tele,
    // uniform activity for all agents: Claude from transcripts, the rest from their own telemetry
    activity: id === "claude-code" ? claudeActivity() : (agentDetailLib ? agentDetailLib.telemetryActivity(tele) : { sessions: [], subagents: [] }),
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
      notes: files.length, edges: graph.stats.links, openTasks: tasks.length,
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
  if (process.env.DASH_REMOTE === "1") return safeEq(req.headers["x-dash-token"] || "", TOKEN);
  const remote = req.socket && (req.socket.remoteAddress || req.connection && req.connection.remoteAddress || "");
  if (/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote)) return true;
  return safeEq(req.headers["x-dash-token"] || "", TOKEN);
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function withApproval(req, res, type, target, run) {
  return APPROVAL_QUEUE.then(queue => {
    const result = queue.authorize(req.headers["x-approval-id"], { type, target, actor: "dashboard" });
    return result.allowed ? run() : json(res, 403, { error: "approved action required", reason: result.reason, type, target });
  }).catch(() => json(res, 503, { error: "approval service unavailable" }));
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".md": "text/markdown; charset=utf-8" };

function requestHandler(req, res) {
  const access = ACCESS_POLICY.authorize(req);
  if (!access.allowed) return json(res, access.status, { error: access.error });
  const url = (req.url || "/").split("?")[0];

  if (url.startsWith("/api/")) {
    if (!authorized(req)) return json(res, 401, { error: "invalid/missing token — set the x-dash-token header" });
    try {
      if (url === "/api/today" && req.method === "GET")
        return TODAY_PROJECTION.then(({ buildTodayProjection }) => {
          const files = walkVault();
          json(res, 200, buildTodayProjection(todayProjectData(files)));
        })
          .catch(() => json(res, 503, { state: "unavailable", error: "Today workspace unavailable" }));
      if (url === "/api/approvals" && req.method === "GET")
        return APPROVAL_QUEUE.then(queue => json(res, 200, { approvals: queue.list(), audit: queue.audit() }));
      if (url === "/api/approvals" && req.method === "POST")
        return readBody(req, res, body => {
          let data; try { data = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON" }); }
          APPROVAL_QUEUE.then(queue => { try { json(res, 201, queue.request(data)); } catch (error) { json(res, 400, { error: error.message }); } });
        });
      const approvalMatch = url.match(/^\/api\/approvals\/([a-f0-9-]+)\/decision$/);
      if (approvalMatch && req.method === "POST")
        return readBody(req, res, body => {
          let data; try { data = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON" }); }
          if (data.confirmed !== true) return json(res, 400, { error: "explicit founder confirmation is required" });
          APPROVAL_QUEUE.then(queue => { try { json(res, 200, queue.decide(approvalMatch[1], { decision: data.decision, actor: "founder-confirmed-dashboard" })); } catch (error) { json(res, 400, { error: error.message }); } });
        });
      if (url === "/api/state") return json(res, 200, buildState());
      if (url === "/api/procs") {
        const cfg = loadConfig();
        return json(res, 200, cfg.agents.map(a => ({ id: a.id, name: a.name, icon: a.icon, enabled: a.enabled, note: a.note || null, cwd: a.gateway && a.gateway.cwd, bin: a.gateway && a.gateway.bin, actions: gwActions(a), ...procInfo(a.id) })));
      }
      let m = url.match(/^\/api\/proc\/([\w-]+)\/(start|stop|restart|status|run|log|terminal|stop-term)$/);
      if (m) {
        const [, id, action] = m;
        if (action === "log") {
          const p = procs.get(id);
          const since = Number(new URL(req.url, "http://x").searchParams.get("since") || 0);
          return json(res, 200, { lines: p ? p.log.filter(l => l.i >= since) : [], next: p ? p.seq : 0, ...procInfo(id) });
        }
        if (req.method !== "POST") return json(res, 405, { error: "POST only" });
        if (action === "status") return gwCtl(id, action, r => json(res, r.error ? 400 : 200, r));
        return withApproval(req, res, action === "terminal" ? "terminal.open" : `process.${action}`, id, () => {
        if (action === "terminal") {
          const mode = new URL(req.url, "http://x").searchParams.get("mode") || "summon";
          return gwTerminal(id, mode, r => json(res, r.error ? 400 : 200, r));
        }
        if (action === "stop-term") return gwStopTerm(id, r => json(res, r.error ? 400 : 200, r));
        if (action === "run") { const r = gwRun(id); return json(res, r.error ? 400 : 200, r); }
        if (action === "stop") return gwStop(id, r => json(res, r.error ? 400 : 200, r));
        return gwCtl(id, action, r => json(res, r.error ? 400 : 200, r)); // start | restart | status
        });
      }
      if (url === "/api/proc/start-all" && req.method === "POST") {
        return withApproval(req, res, "process.start-all", "enabled-agents", () => {
          const list = loadConfig().agents.filter(a => a.enabled && a.gateway && gwActions(a).includes("start"));
          if (!list.length) return json(res, 200, {});
          const results = {};
          let pending = list.length;
          list.forEach(a => gwCtl(a.id, "start", r => { results[a.id] = r; if (--pending === 0) json(res, 200, results); }));
        });
      }
      if (url === "/api/graph" || url === "/api/vault/graph") return buildParityGraph().then(data => json(res, 200, data)).catch(error => json(res, 500, { error: error.message }));
      if (url === "/api/agent-topology") return buildLiveAgentTopology().then(data => json(res, 200, data)).catch(error => json(res, 500, { error: error.message }));
      if (url === "/api/report") return json(res, 200, buildReport());
      if (url === "/api/report/save" && req.method === "POST") return json(res, 200, saveReport());
      if (url === "/api/task" && req.method === "POST")
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {agent,title,detail?}" }); }
          const r = createTask(d.agent, d.title, d.detail);
          json(res, r.error ? 400 : 200, r);
        });
      if (url === "/api/projects") return json(res, 200, buildProjects(walkVault()));
      m = url.match(/^\/api\/projects\/([\w-]+)$/);
      if (m && req.method === "GET") { const d = projectDetail(m[1]); return json(res, d.error ? 404 : 200, d); }
      if (url === "/api/project" && req.method === "POST")
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {name,goal?}" }); }
          const r = createProject(d);
          json(res, r.error ? 400 : 200, r);
        });
      m = url.match(/^\/api\/project\/([\w-]+)$/);
      if (m) { const d = projectDetail(m[1]); return json(res, d.error ? 404 : 200, d); }
      m = url.match(/^\/api\/project\/([\w-]+)\/decision$/);
      if (m && req.method === "POST") {
        const slug = m[1];
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {text,agent?}" }); }
          const r = addDecision(slug, d);
          json(res, r.error ? 400 : 200, r);
        });
      }
      if (url === "/api/task/done" && req.method === "POST")
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {source,text}" }); }
          const r = markTaskDone(d.source, d.text);
          json(res, r.error ? 400 : 200, r);
        });
      if (url === "/api/agents/add" && req.method === "POST")
        return readBody(req, res, body => {
          let d; try { d = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON {id,name,icon?,role?,accent?,trigger?,home?}" }); }
          const r = addAgent(d);
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

  /* Resolve a request against a root, refusing anything that escapes it. */
  const resolve = (root, r) => {
    const file = path.normalize(path.join(root, r));
    const inside = path.relative(root, file);
    if (inside.startsWith("..") || path.isAbsolute(inside)) return null;
    try { return fs.existsSync(file) && !fs.statSync(file).isDirectory() ? file : null; } catch { return null; }
  };

  // /avatars/* is runtime-written → always from PUBLIC, never the (rebuilt) dist copy
  const roots = rel.startsWith("avatars/") ? [PUBLIC] : [DIST, PUBLIC];
  let file = null;
  for (const root of roots) { file = resolve(root, rel); if (file) break; }

  // SPA fallback: unknown non-asset path → the built index.html (client-side routing)
  if (!file && !path.extname(rel)) file = resolve(DIST, "index.html");

  if (!file) {
    const hint = fs.existsSync(DIST) ? "not found" : "not built — run: npm run build";
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end(hint);
  }
  try {
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(500, { "Content-Type": "text/plain" }); res.end("error"); }
}

function createServer() { return http.createServer(requestHandler); }
const server = createServer();

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

if (require.main === module) {
  server.on("error", e => {
    if (e.code === "EADDRINUSE") { console.error(`\n  Port ${PORT} is already in use. Run on another port: set PORT=4322 then npm run dev\n`); }
    else console.error("[server]", (e && e.stack) || e);
    process.exit(1);
  });

  // Gate listen() on the ESM helper module so telemetry windowing is ready before the first poll.
  AGENT_DETAIL.finally(() => server.listen(PORT, process.env.DASH_HOST || "127.0.0.1", () => {
  console.log(`\n  Agentic OS running at  http://localhost:${PORT}`);
  console.log(`  Vault data source:     ${VAULT}`);
  console.log(`  Agent config:          ${CONFIG_PATH}`);
  console.log(TOKEN ? "  Auth: token ACTIVE (x-dash-token)" : "  Auth: no token (local only). For remote access: set DASH_TOKEN.\n");
  setTimeout(pollAllStatus, 3000);       // initial status
  setInterval(pollAllStatus, 45000);     // R4: interval (45s) > gwCtl timeout (30s) + in-flight guard
  setTimeout(pollSummons, 3000);         // pick up summoned-terminal pid files from a previous run
  setInterval(pollSummons, 45000);       // keep summoned-terminal liveness fresh
  setTimeout(runDailyBridge, 10000);     // R#2: run the daily bridge once at startup
  setInterval(runDailyBridge, 3600000);  // R#2: then hourly (it existed before but was never invoked)
  setTimeout(captureMemory, 8000);       // project memory: telemetry task_done → decisions.md
  setInterval(captureMemory, 120000);    // watermarked, so re-runs never duplicate entries
  }));
}

module.exports = { createServer, legacyDecisionContext };

/* R#2: run scripts/hermes-daily-bridge.cjs (sync telemetry + vault daily note) */
function runDailyBridge() {
  const f = path.join(ROOT, "scripts", "hermes-daily-bridge.cjs");
  if (!fs.existsSync(f)) return;
  execFile(process.execPath, [f], { windowsHide: true, env: process.env }, e => { if (e) console.error("[daily-bridge]", e.message); });
}
