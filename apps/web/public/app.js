/* AGENTIC//OS — app logic */
const VAULT_NAME = "Obsidian Vault";
let TOKEN = localStorage.getItem("dashToken") || "";
let openAgent = null;   // id of the agent whose detail panel is open
let graph = null, graphLoaded = false;
let lastReport = null;
let AGENTS = {};   // R#10: id -> agent (owner: native-service check for the confirm guard)

const ACCENT = { "claude-code": "#00E5FF", hermes: "#A6FF3C", openclaw: "#4C9BFF", "kilo-code": "#8C5BFF", copilot: "#FFB01F", cline: "#F2FF3C", pi: "#3CFFC8", antigravity: "#FF8A3C" };

/* Neural Cosmos Edition theme registry — must mirror the [data-theme] blocks in style.css.
   sw = accent swatch, bg = swatch backdrop. "cosmos" is the base :root (no data-theme block needed). */
const THEMES = [
  { id: "rempeyek",       name: "Rempeyek",        sw: "#A78BFA", bg: "#07060E" },
  { id: "cosmos",         name: "Neural Cosmos",   sw: "#00E5FF", bg: "#050310" },
  { id: "ember",          name: "Ember",           sw: "#FFB01F", bg: "#0C0705" },
  { id: "ghost-protocol", name: "Ghost Protocol",  sw: "#8CFFE0", bg: "#060A09" },
  { id: "quantum-glass",  name: "Quantum Glass",   sw: "#7DD3FC", bg: "#050810" },
  { id: "dark-matter",    name: "Dark Matter",     sw: "#9E8CFF", bg: "#030308" },
  { id: "nebula",         name: "Nebula",          sw: "#FF7EDB", bg: "#0A0416" },
  { id: "aurora",         name: "Aurora",          sw: "#55FFB8", bg: "#03100C" },
  { id: "midnight",       name: "Midnight",        sw: "#4C9BFF", bg: "#030614" },
  { id: "solaris",        name: "Solaris",         sw: "#FFC53D", bg: "#0D0900" },
  { id: "crimson-rift",   name: "Crimson Rift",    sw: "#FF3D5E", bg: "#0F0308" },
  { id: "monochrome",     name: "Monochrome",      sw: "#E6E6E6", bg: "#050505" },
  { id: "nothing-os",     name: "Nothing OS",      sw: "#D71921", bg: "#0A0A0A" },
];
const TILE_C = ["#00E5FF", "#FF3DD8", "#A6FF3C", "#FFB01F"];
const PALETTE = ["#00E5FF", "#FF3DD8", "#A6FF3C", "#FFB01F", "#8C5BFF", "#FF4D6A", "#3CFFC8", "#FF8A3C", "#4C9BFF", "#F2FF3C"];

const WORKFLOWS = [
  { id: "openclaw", who: "OpenClaw", t: "Strategy & Business", d: "Business analysis, SWOT, founder-grade memos, persona-driven writing, multi-agent orchestration." },
  { id: "hermes", who: "Hermes", t: "Crypto & Market Ops", d: "Trading bot, market analysis, cron & heartbeat 24/7. Real-money moves only with Boss approval." },
  { id: "kilo-code", who: "Kilo Code", t: "Build & Debug", d: "Terminal AI coding agent (kilo.ai) — code generation, task automation, 500+ models behind one CLI." },
  { id: "claude-code", who: "Claude Code", t: "Dev & Vault Ops", d: "Full dev, file ops, MCP, ecosystem integration, guardian of the vault constitution." },
  { id: "cline", who: "Cline", t: "Autonomous Coding", d: "Autonomous coding agent (cline.bot) — interactive sessions, one-shot tasks, and kanban-driven runs." },
  { id: "copilot", who: "Copilot CLI", t: "Inline Assist", d: "Manual CLI coding assistant — quick edits, completions, and MCP/plugin-driven tasks in its own terminal." },
  { id: "antigravity", who: "Antigravity", t: "Agentic Integration", d: "Gemini-based advanced agentic coding, dashboard building, and knowledge-graph visualization." },
  { id: "pi", who: "Pi", t: "Minimal Agent Ops", d: "Lean open-source coding agent (pi.dev) — read/write/edit/bash tools, subscription or API login, fast one-off runs." },
];

/* ---------- util ---------- */
function headers() { return TOKEN ? { "x-dash-token": TOKEN } : {}; }
/* api() always returns an object (never throws): R7/R8 fetch wrapped in try/catch + AbortSignal timeout,
   R6/F12 401 retry uses a counter capped at 2 (not unbounded recursion). */
async function api(path, opts = {}, attempt = 0) {
  try {
    const res = await fetch(path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeoutMs || 8000) });
    if (res.status === 401) {
      if (TOKEN && attempt < 1) {
        return api(path, opts, attempt + 1);
      }
      showTokenLogin();
      return { error: "unauthorized" };
    }
    const json = await res.json();
    return json;
  } catch (e) {
    const errMsg = e && e.name === "TimeoutError" ? "timeout" : (e && e.message) || "network error";
    return { error: errMsg };
  }
}
/* Inline token login (replaces prompt(), which can be blocked in iframes/certain contexts) */
function showTokenLogin() {
  const ov = document.getElementById("tokenLogin");
  if (!ov) { const t = prompt("Dashboard is token-locked (DASH_TOKEN). Enter token:") || ""; if (t) { TOKEN = t; localStorage.setItem("dashToken", TOKEN); refresh(); } return; }
  ov.hidden = false;
  const input = document.getElementById("tokenInput");
  const submit = document.getElementById("tokenSubmit");
  const hint = document.getElementById("tokenHint");
  if (hint) hint.textContent = "";
  const go = () => { const v = (input.value || "").trim(); if (!v) return; TOKEN = v; localStorage.setItem("dashToken", TOKEN); ov.hidden = true; refresh(); loadOps(); };
  submit.onclick = go;
  input.onkeydown = e => { if (e.key === "Enter") go(); };
  if (input) input.focus();
}
/* The registered Obsidian vault is the repo root (see obsidian.json), so its name isn't "Obsidian Vault".
   Use the name-independent `path=` param with the file's absolute path — Obsidian resolves the vault by path.
   VAULT_ABS is the absolute path to the Obsidian Vault folder, set from /api/state.vault in render(). */
let VAULT_ABS = "";
function obsUri(rel) {
  if (VAULT_ABS) {
    const abs = VAULT_ABS.replace(/[\\/]+$/, "") + "\\" + String(rel).replace(/\//g, "\\");
    return `obsidian://open?path=${encodeURIComponent(abs)}`;
  }
  return `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(rel.replace(/\.md$/, ""))}`;
}
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function pill(status) { return `<span class="pill"><span class="dot ${status}"></span><span class="lbl-${status}">${status}</span></span>`; }
/* per-agent accent: config-driven ("accent" in agents.config.json) wins, then the built-in map */
function ac(id) { return (AGENTS[id] && AGENTS[id].accent) || ACCENT[id] || "#8C5BFF"; }
function gwState(p) {
  if (!p || p.status === "off") return { cls: "idle", label: "not checked yet", tip: "" };
  if (p.status === "running") return { cls: "running", label: p.mode === "owned" ? `running · owned pid ${p.pid}` : "running · service", tip: p.statusText || "" };
  if (p.status === "stopped") return { cls: "idle", label: "stopped", tip: p.statusText || "" };
  if (p.status === "exited") return { cls: "exited", label: `exited (${p.exitCode})`, tip: p.reason || "" };
  return { cls: "error", label: p.status, tip: p.reason || "" };
}
function gwPill(gw) {
  return `<span class="pill" title="${esc(gw.tip)}"><span class="dot ${gw.cls}"></span>` +
    `<span class="lbl-${gw.cls}">${esc(gw.label)}</span></span>`;
}
/* ROADMAP #2: 24h uptime chip (reuses pill/dot — no new CSS) */
function uptimeChip(u) {
  if (!u || !u.samples) return "";
  const cls = u.pct >= 90 ? "running" : u.pct >= 50 ? "exited" : "error";
  return `<span class="pill" title="24h uptime · ${u.samples} poll samples"><span class="dot ${cls}"></span>` +
    `<span class="lbl-${cls}">${u.pct}% up 24h</span></span>`;
}
function avatarHtml(a, lg) {
  const inner = a.avatar ? `<img src="${a.avatar}" alt="${esc(a.name)}">` : (a.icon || "◈");
  return `<div class="avatar ${lg ? "avatar-lg" : ""}" style="--ac:${ac(a.id)}">${inner}
    ${lg ? `<button class="avatar-edit" data-act="avatar" data-id="${a.id}" title="Change profile photo">✎</button>` : ""}</div>`;
}
const ACT_LABEL = { start: "▶ Start", stop: "■ Stop", "stop-term": "■ Stop terminal", restart: "↻ Restart", status: "◇ Status", run: "⚡ Run" };
const ACT_CLS = { start: "btn-run", stop: "btn-stop", "stop-term": "btn-stop", restart: "btn-dim", status: "btn-dim", run: "btn-dim" };
function gwBtn(act, id) { return `<button class="btn ${ACT_CLS[act] || "btn-dim"}" data-act="${act}" data-id="${id}">${ACT_LABEL[act] || act}</button>`; }
function summonBtn(a) {
  return `<button class="btn btn-run" data-term="summon" data-id="${a.id}" title="Open an admin terminal + summon ${esc(a.name)}">⧉ Summon</button>`;
}
/* Summon = the primary action for EVERY agent: opens an admin terminal running the agent's CLI.
   Gateway agents keep their service actions (start/run/status/restart) in the caret menu. */
function summonSplit(a) {
  const acts = a.actions || [];
  const menu = [
    acts.includes("start") ? `<button data-act="start" data-id="${a.id}">▶ Start gateway (service)</button>` : "",
    acts.includes("run") ? `<button data-term="run" data-id="${a.id}">⚡ Gateway run · terminal (foreground)</button>` : "",
    (acts.includes("status") || acts.includes("restart")) ? `<div class="gw-menu-sep"></div>` : "",
    acts.includes("status") ? `<button data-act="status" data-id="${a.id}">◇ Status</button>` : "",
    acts.includes("restart") ? `<button data-act="restart" data-id="${a.id}">↻ Restart</button>` : "",
  ].join("");
  if (!menu.trim()) return summonBtn(a);
  return `<div class="gw-split">
    <button class="btn btn-run gw-main" data-term="summon" data-id="${a.id}" title="Open an admin terminal + summon ${esc(a.name)}">⧉ Summon</button>
    <button class="btn btn-run gw-caret" data-menu="${a.id}" title="More options">▾</button>
    <div class="gw-menu" data-menufor="${a.id}">${menu}</div>
  </div>`;
}
function gwButtons(a, compact) {
  if (!a.enabled) return `<button class="btn btn-dim" disabled title="${esc(a.note || "disabled")}">setup required</button>`;
  const acts = a.actions || [];
  const termAlive = a.term && a.term.alive;
  const running = a.proc && a.proc.status === "running";
  if (compact) {
    if (termAlive) return gwBtn("stop-term", a.id);
    if (running) return gwBtn("stop", a.id);
    return a.canSummon ? summonSplit(a) : (acts[0] ? gwBtn(acts[0], a.id) : "");
  }
  // detail: Summon split (all agents) + Stop-terminal when a summoned terminal is live + headless service actions
  const rest = acts.filter(x => x !== "start").map(x => gwBtn(x, a.id)).join("");
  return (a.canSummon ? summonSplit(a) : "") + (termAlive ? gwBtn("stop-term", a.id) : "") + rest;
}

/* ---------- agent topology map ---------- */
/* Radial SVG map: hub in the center, agents on an ellipse. No physics, no library.
   Rebuilt only when render()'s dirty-check passes, so no poll thrash. */
function nodeStatus(a) {
  const running = a.proc && a.proc.status === "running";
  const dead = a.proc && (a.proc.status === "exited" || a.proc.status === "error");
  const observeOnly = !(a.actions || []).length;
  if (!a.enabled) return { cls: "top-off", ring: "#3A3654", label: "disabled" };
  if (running) return { cls: "top-run", ring: "#A6FF3C", label: "running" };
  if (dead) return { cls: "top-err", ring: "#FF4D6A", label: a.proc.status };
  if (observeOnly) return { cls: "top-obs", ring: ac(a.id), label: "observe" };
  return { cls: "top-idle", ring: "#8E88BE", label: "idle" };
}
function renderTopology(state) {
  const ACC = accent();
  const box = document.getElementById("topologyMap");
  if (!box) return;
  const agents = state.agents;
  const W = 760, H = 460, cx = W / 2, cy = H / 2 - 14, rx = 292, ry = 152;
  const n = agents.length;
  let defs = `<filter id="topoGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <radialGradient id="hubCore"><stop offset="0" stop-color="#12324A"/><stop offset="1" stop-color="#14112A"/></radialGradient>
    <radialGradient id="hubHalo"><stop offset="0" stop-color="${ACC}" stop-opacity=".28"/><stop offset=".6" stop-color="#8C5BFF" stop-opacity=".1"/><stop offset="1" stop-color="#8C5BFF" stop-opacity="0"/></radialGradient>`;
  let links = "", nodes = "";
  agents.forEach((a, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = cx + rx * Math.cos(ang), y = cy + ry * Math.sin(ang);
    const st = nodeStatus(a);
    const col = ac(a.id);
    const run = st.cls === "top-run";
    const dash = st.cls === "top-obs" ? `stroke-dasharray="4 4"` : "";
    const dx = x - cx, dy = y - cy, len = Math.hypot(dx, dy) || 1;
    const sx = cx + dx / len * 62, sy = cy + dy / len * 62;
    const tx = x - dx / len * 42, ty = y - dy / len * 42;
    // curved synapse: control point pushed perpendicular so links arc like dendrites
    const bend = (i % 2 ? 1 : -1) * Math.min(46, len * 0.16);
    const mx = (sx + tx) / 2 - (ty - sy) / len * bend;
    const my = (sy + ty) / 2 + (tx - sx) / len * bend;
    const d = `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`;
    defs += `<linearGradient id="lg-${a.id}" gradientUnits="userSpaceOnUse" x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}">
        <stop offset="0" stop-color="${ACC}" stop-opacity="${run ? .8 : .35}"/><stop offset="1" stop-color="${col}" stop-opacity="${run ? .95 : .5}"/></linearGradient>
      <radialGradient id="ng-${a.id}"><stop offset="0" stop-color="${col}" stop-opacity="${run ? ".5" : ".3"}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
    links += `<path class="${run ? "top-link-run" : "top-link"}" d="${d}" fill="none"
        stroke="url(#lg-${a.id})" stroke-width="${run ? 2 : 1.1}" opacity="${run ? .95 : .55}" filter="url(#topoGlow)"/>
      <circle r="${run ? 2.6 : 1.7}" fill="${col}" opacity="${run ? .95 : .45}" filter="url(#topoGlow)">
        <animateMotion dur="${(run ? 2.2 : 5.5) + i * 0.35}s" repeatCount="indefinite" path="${d}"/></circle>`;
    nodes += `<g class="top-node ${st.cls}" data-open="${a.id}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" style="cursor:pointer">
      <circle r="52" fill="url(#ng-${a.id})"/>
      ${run ? `<circle class="top-shock" r="26" fill="none" stroke="${st.ring}" stroke-width="1.2"/>` : ""}
      <circle r="31" fill="none" stroke="${col}" stroke-width="1" opacity=".28"/>
      ${run ? `<g class="top-orbit"><circle r="27.5" fill="none" stroke="${st.ring}" stroke-width="1.6" stroke-dasharray="2 9.5" opacity=".9"/></g>` : ""}
      ${run ? `<circle class="top-pulse" r="24" fill="none" stroke="${st.ring}" stroke-width="1.5" opacity=".8"/>` : ""}
      <circle r="24" fill="none" stroke="${st.ring}" stroke-width="2.4" ${dash} filter="url(#topoGlow)"/>
      <circle r="19" fill="#100E1FE6" stroke="#2A2744" stroke-width="1"/>
      <text y="6" text-anchor="middle" font-size="16">${a.icon || "◈"}</text>
      <text y="46" text-anchor="middle" font-size="11" fill="#EEEBFF" font-family="Bahnschrift,sans-serif" font-weight="600">${esc(a.name)}</text>
      <text y="59" text-anchor="middle" font-size="8.5" fill="${st.ring}" font-family="Cascadia Mono,monospace">${st.label}</text>
      <text y="-37" text-anchor="middle" font-size="8" fill="#8E88BE" font-family="Cascadia Mono,monospace">${esc(a.node || "")}</text>
    </g>`;
  });
  const running = agents.filter(a => a.proc && a.proc.status === "running").length;
  const errCount = agents.filter(a => a.proc && (a.proc.status === "exited" || a.proc.status === "error")).length;
  const observing = agents.filter(a => !(a.actions || []).length && !(a.proc && a.proc.status === "running")).length;
  const idle = Math.max(0, n - running - errCount - observing);
  const uptimes = agents.map(a => a.uptime && a.uptime.pct).filter(v => typeof v === "number");
  const upAvg = uptimes.length ? Math.round(uptimes.reduce((s, v) => s + v, 0) / uptimes.length) : null;
  const locked = state.auth === "token-locked";

  const svg = `<svg class="topology" viewBox="0 0 ${W} ${H}" role="img" aria-label="Agent topology map">
    <defs>${defs}</defs>${links}
    <g class="top-hub" transform="translate(${cx},${cy})">
      <circle r="120" fill="url(#hubHalo)"/>
      <circle class="top-shock" r="46" fill="none" stroke="${ACC}" stroke-width="1.3"/>
      <circle class="top-shock s2" r="46" fill="none" stroke="#8C5BFF" stroke-width="1.1"/>
      <circle r="56" fill="none" stroke="${ACC}" stroke-width="1" opacity=".14"/>
      <g class="top-spin"><circle r="48" fill="none" stroke="${ACC}" stroke-width="1" stroke-dasharray="4 9" opacity=".5"/></g>
      <circle class="top-pulse" r="46" fill="none" stroke="${ACC}" stroke-width="1" opacity=".5"/>
      <circle r="40" fill="url(#hubCore)" stroke="${ACC}" stroke-width="1.6" filter="url(#topoGlow)"/>
      <text y="-2" text-anchor="middle" font-size="18" fill="${ACC}" font-family="Bahnschrift,sans-serif" font-weight="700">◈</text>
      <text y="16" text-anchor="middle" font-size="8.5" fill="#8E88BE" font-family="Cascadia Mono,monospace">${running}/${n} LIVE</text>
    </g>
    ${nodes}
  </svg>`;

  const evs = state.events || [];
  const logHtml = evs.length ? evs.map(ev => `<div class="topo-ev">
      <span class="t">${esc((ev.ts || "").slice(11, 19))}</span>
      <span class="a" style="color:${ac(ev.id)}">${esc((AGENTS[ev.id] && AGENTS[ev.id].name) || ev.id)}</span>
      <span class="m lv-${esc(ev.level || "ok")}">${esc(ev.msg)}</span></div>`).join("")
    : `<div class="topo-ev-empty">No gateway events yet — Summon / Start / Status actions and status changes appear here.</div>`;

  box.innerHTML = `
  <div class="topo-grid">
    <aside class="topo-side">
      <div class="topo-box">
        <div class="topo-h">NETWORK OVERVIEW</div>
        <div class="topo-stat"><span>TOTAL NODES</span><b>${n}</b></div>
        <div class="topo-stat"><span><i class="dot running"></i>ACTIVE</span><b>${running}</b></div>
        <div class="topo-stat"><span><i class="dot exited"></i>OBSERVING</span><b>${observing}</b></div>
        <div class="topo-stat"><span><i class="dot idle"></i>IDLE</span><b>${idle}</b></div>
        ${errCount ? `<div class="topo-stat"><span><i class="dot error"></i>ERROR</span><b>${errCount}</b></div>` : ""}
      </div>
      <div class="topo-box">
        <div class="topo-h">NETWORK LOAD</div>
        <svg id="topoLoad" viewBox="0 0 200 44" preserveAspectRatio="none"></svg>
      </div>
      <div class="topo-box">
        <div class="topo-h">SECURITY STATUS</div>
        <div class="topo-big ${locked ? "tb-ok" : ""}">🛡 ${locked ? "TOKEN-LOCKED" : "LOCAL-ONLY"}</div>
      </div>
      <div class="topo-box">
        <div class="topo-h">MEAN UPTIME 24H</div>
        <div class="topo-big">${upAvg == null ? "—" : upAvg + "%"}</div>
      </div>
    </aside>
    <div class="topo-map">${svg}</div>
    <aside class="topo-side">
      <div class="topo-box topo-log-box">
        <div class="topo-h">SYSTEM LOG</div>
        <div class="topo-log">${logHtml}</div>
      </div>
      <div class="topo-box">
        <div class="topo-h">VAULT ACTIVITY</div>
        <div class="topo-stat"><span>NOTES</span><b>${state.stats.notes.value}</b></div>
        <div class="topo-stat"><span>CHANGED 7D</span><b>${state.stats.activeWeek.value}</b></div>
        <div class="topo-stat"><span>OPEN TASKS</span><b>${state.stats.openTasks.value}</b></div>
      </div>
    </aside>
  </div>
  <div class="topo-legend">
    <span class="topo-h">AGENT STATUS LEGEND</span>
    <span class="tl"><i style="background:#A6FF3C;box-shadow:0 0 6px #A6FF3C"></i>RUNNING<em>active &amp; processing</em></span>
    <span class="tl"><i style="background:#8E88BE"></i>IDLE<em>standby</em></span>
    <span class="tl"><i class="tl-dash"></i>OBSERVE<em>monitoring / summon-only</em></span>
    <span class="tl"><i style="background:#FF4D6A"></i>ERROR<em>exited / down</em></span>
    <span class="tl"><i style="background:#3A3654"></i>OFFLINE<em>disabled</em></span>
  </div>
  <div class="topo-foot">🔒 ${esc(state.agency || "AGENTIC//OS")} MESH · ${locked ? "TOKEN AUTH" : "LOCAL ONLY"} · ${n} NODES</div>`;
  drawTopoLoad();
}

/* NETWORK LOAD sparkline — client-side rolling buffer of the running-agent ratio.
   Updated by every refresh() (before the dirty-check, so it moves even when nothing else changed). */
const _topoLoad = [];
function updateTopoLive(state) {
  try {
    if (!state || !Array.isArray(state.agents)) return;
    const running = state.agents.filter(a => a.proc && a.proc.status === "running").length;
    _topoLoad.push(state.agents.length ? running / state.agents.length : 0);
    if (_topoLoad.length > 40) _topoLoad.splice(0, _topoLoad.length - 40);
    drawTopoLoad();
  } catch {}
}
function drawTopoLoad() {
  const ACC = accent();
  const svg = document.getElementById("topoLoad");
  if (!svg || !_topoLoad.length) return;
  const W = 200, H = 44, step = W / 39;
  const pts = _topoLoad.map((v, i) => `${(i * step).toFixed(1)},${(H - 6 - v * (H - 16)).toFixed(1)}`).join(" ");
  const pctNow = Math.round(_topoLoad[_topoLoad.length - 1] * 100);
  svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="${ACC}" stroke-width="1.6" opacity=".9"/>
    <text x="${W - 3}" y="12" text-anchor="end" font-size="10" fill="#8E88BE" font-family="Cascadia Mono,monospace">${pctNow}%</text>`;
}

/* ---------- main render ---------- */
let _lastStateKey = "";   // R2: force first render
function render(state) {
  const stamp = document.getElementById("stamp");
  if (stamp) stamp.textContent = new Date(state.generatedAt).toLocaleTimeString("en-GB");

  try {
    // F2: dirty-check — if data (other than the timestamp) is unchanged, skip the heavy DOM rebuild (prevents layout thrash + scroll jumps)
    const key = JSON.stringify({ ...state, generatedAt: 0 });
    if (key === _lastStateKey) { return; }
    _lastStateKey = key;
  } catch (e) {
  }
  // keep any open dropdown open across refreshes (6/45 s)
  const openMenus = new Set();
  document.querySelectorAll(".gw-menu.open").forEach(m => { if (m.dataset.menufor) openMenus.add(m.dataset.menufor); });
  AGENTS = {}; state.agents.forEach(a => AGENTS[a.id] = a);   // R#10
  // R#11: banner when the config is broken (server silently falls back to last-good without this)
  const cb = document.getElementById("configBanner");
  if (cb) {
    if (state.configError) { cb.hidden = false; cb.innerHTML = `⚠ <b>agents.config.json is broken</b> — using the last valid config. <code>${esc(state.configError.msg)}</code> · fix the file and the dashboard auto-reloads.`; }
    else cb.hidden = true;
  }
  const vp = document.getElementById("vaultPath");
  vp.textContent = state.vault; vp.title = state.vault;
  if (state.vault) {
    VAULT_ABS = state.vault;                                   // enables name-independent obsidian:// links
    document.querySelectorAll(".side-vault, .graph-open").forEach(a => { a.href = obsUri("INDEX.md"); });
  }
  if (state.agency) {
    const bn = document.querySelector(".brand-name");
    if (bn && bn.textContent !== state.agency) bn.textContent = state.agency;
    document.title = `${state.agency} — Neural Command Deck`;
  }

  const tiles = document.getElementById("statTiles");
  tiles.innerHTML = "";
  Object.values(state.stats).forEach((s, i) => tiles.appendChild(el(`<div class="tile" style="--tile-c:${TILE_C[i % 4]}">
    <div class="tile-top"><span>${esc(s.label)}</span></div>
    <div class="tile-val">${s.value}</div><div class="tile-sub">live from vault</div></div>`)));

  renderTopology(state);

  const cardHtml = a => {
    const gw = gwState(a.proc);
    return `<div class="agent-card ${openAgent === a.id ? "selected" : ""}" style="--ac:${ac(a.id)}" data-open="${a.id}">
      <div class="card-top">${avatarHtml(a)}<div class="card-btns">${gwButtons(a, true)}</div></div>
      <div class="agent-name">${esc(a.name)}</div>
      <div class="agent-role">${esc(a.role)}</div>
      <div class="pill-row">${pill(a.vaultStatus)}${gwPill(gw)}${uptimeChip(a.uptime)}</div></div>`;
  };
  document.getElementById("agentCards").innerHTML = state.agents.map(cardHtml).join("");
  document.getElementById("agentGrid").innerHTML = state.agents.map(cardHtml).join("");

  const side = document.getElementById("sideAgents");
  side.innerHTML = "";
  state.agents.forEach(a => {
    const gw = gwState(a.proc);
    side.appendChild(el(`<div class="side-agent" data-open="${a.id}">
      ${a.avatar ? `<img class="side-avatar" src="${a.avatar}" alt="">` : `<span class="dot ${gw.cls === "running" ? "running" : "idle"}" title="gateway ${gw.label}"></span>`}
      <span><b>${esc(a.name)}</b><br>${esc(a.node)}</span></div>`));
  });

  // R#5: fill the agent dropdown in the "send task" form (preserve the user's selection across refreshes)
  try {
    const sel = document.getElementById("taskAgent");
    if (sel) {
      const cur = sel.value;
      const opts = state.agents.map(a => `<option value="${a.id}">${esc(a.icon || "")} ${esc(a.name)}</option>`).join("");
      const isCurrentlyEmpty = !sel.innerHTML || sel.innerHTML.trim() === "";
      const needsUpdate = sel.dataset.sig !== opts || isCurrentlyEmpty;
      if (needsUpdate) {
        sel.innerHTML = opts;
        sel.dataset.sig = opts;
        if (cur) sel.value = cur;
      }
    }
  } catch (e) {
  }

  document.getElementById("reviewCount").textContent = `${state.review.length} open`;
  const rl = document.getElementById("reviewList");
  rl.innerHTML = "";
  if (!state.review.length) rl.appendChild(el(`<div class="empty">Empty — add a note to <b>Inbox/</b> or a checkbox in <b>Tasks/</b> and it shows up here.</div>`));
  state.review.slice(0, 8).forEach(r => rl.appendChild(el(`<div class="review-item">
    <div><span class="t">${esc(r.title)}</span><span class="kind ${r.kind}">${r.kind}</span>
    <div class="m">${esc(r.meta)}</div></div>
    <div class="review-act">
      ${r.kind === "task" ? `<button class="btn btn-run btn-mini" data-done="${esc(r.meta)}" data-text="${esc(r.title)}" title="Mark done (writes [x] to the vault)">✓ done</button>` : ""}
      <a href="${obsUri(r.meta)}">Open in Obsidian</a></div></div>`)));

  const wf = document.getElementById("workflowCards");
  wf.innerHTML = "";
  WORKFLOWS.forEach(w => wf.appendChild(el(`<div class="wf" style="--ac:${ac(w.id)}">
    <span class="who" style="color:${ac(w.id)}">${esc(w.who)}</span><div class="t">${esc(w.t)}</div><div class="d">${esc(w.d)}</div></div>`)));

  const pl = document.getElementById("projectList");
  pl.innerHTML = "";
  state.projects.forEach(p => pl.appendChild(el(`<div class="list-item">
    <div><b>${esc(p.name)}</b><div class="p">${esc(p.rel)}</div></div>
    <div style="display:flex;gap:12px;align-items:center"><span class="d">${p.updated}</span>
    <a class="chip" style="text-decoration:none" href="${obsUri(p.rel)}">open</a></div></div>`)));
  // reopen dropdowns that were open before the rebuild
  openMenus.forEach(id => document.querySelectorAll(`.gw-menu[data-menufor="${id}"]`).forEach(m => m.classList.add("open")));
}

/* ---------- agent detail ---------- */
async function renderDetail() {
  const box = document.getElementById("agentDetail");
  if (!openAgent) { box.innerHTML = ""; return; }
  const d = await api(`/api/agent/${openAgent}/detail`);
  if (d.error) { box.innerHTML = `<div class="empty">${esc(d.error)}</div>`; return; }
  const gw = gwState(d.proc);
  const act = d.activity || { sessions: [], subagents: [] };
  const isTele = d.source === "telemetry";   // Claude = transcript, others = telemetry

  const sessions = act.sessions.length ? act.sessions.map(s => `<div class="sess">
      <div class="top"><span>${esc(s.id)}${s.project ? " · " + esc(s.project) : ""}</span>${pill(s.status)}</div>
      ${s.lastPrompt ? `<div class="prm">❯ ${esc(s.lastPrompt)}</div>` : ""}
      ${s.lastTool ? `<div class="act">⚙ ${esc(s.lastTool.name)} ${esc(s.lastTool.target)} · ${s.toolCount} tool calls</div>` : ""}
    </div>`).join("")
    : `<div class="empty">${isTele
        ? `No activity yet. The agent reports tasks via telemetry <code>agentic-os\\telemetry\\${esc(d.id)}.jsonl</code> (type <code>task_start/progress/done</code>).`
        : "No sessions in the last 48 hours."}</div>`;

  const subs = act.subagents.length ? act.subagents.map(s => `<div class="subrow">
      <span class="ty">${esc(s.type)}</span><span class="nm">${esc(s.desc)}${s.detail ? " — " + esc(s.detail) : ""}</span>
      <span class="st st-${s.status}">${s.status === "done" ? "✔ done" : "⟳ running"}</span></div>`).join("")
    : `<div class="empty">${isTele
        ? `No subagents/tasks yet. Report via telemetry (type <code>subagent_start/done</code>) → they appear here automatically.`
        : "No subagents spawned in the last 48 hours. As soon as an Agent/Task spawn happens, it shows up automatically."}</div>`;

  const tele = d.telemetry.length ? d.telemetry.map(t => `<div class="subrow">
      <span class="ty">${esc(t.type)}</span>
      <span class="nm">${esc(t.name || "")}${t.detail ? " — " + esc(t.detail) : ""}
        ${t.progress != null ? `<span class="tele-bar"><i style="width:${Math.min(100, t.progress)}%"></i></span>` : ""}</span>
      <span class="st">${esc((t.ts || "").slice(11, 16))}</span></div>`).join("")
    : `<div class="empty">No telemetry yet. The agent can report progress via <code>agentic-os\\telemetry\\${esc(d.id)}.jsonl</code> (see the README in that folder).</div>`;

  const lane = d.laneFiles.length ? `<div class="mini-list">${d.laneFiles.map(f =>
    `<a href="${obsUri(f.rel)}"><span>${esc(f.rel.split("/").pop().replace(".md", ""))}</span><span class="d">${f.updated}</span></a>`).join("")}</div>`
    : `<div class="empty">No notes in the Brains lane yet.</div>`;

  const checked = d.proc && d.proc.checkedAt ? new Date(d.proc.checkedAt).toLocaleTimeString("en-GB") : null;
  const statusOut = d.proc && d.proc.statusText
    ? `<pre class="logpane" style="height:130px" id="statusout">${esc(d.proc.statusText)}</pre>`
    : `<div class="empty">Click <b>Status</b> to check the gateway through its own command.</div>`;

  box.innerHTML = `<div class="detail" style="--ac:${ac(d.id)}">
    <div class="detail-head">
      ${avatarHtml(d, true)}
      <div>
        <h2>${esc(d.name)}</h2>
        <div class="detail-meta">${esc(d.role)} · ${esc(d.node)} · <code>${esc(d.bin || "gateway N/A")}</code></div>
        <div class="pill-row" style="margin-top:7px">${pill(d.vaultStatus)}${gwPill(gw)}</div>
      </div>
      <div class="detail-actions"><button class="btn btn-dim" data-act="close-detail">✕ close</button></div>
    </div>
    <div class="detail-grid">
      <div class="dsec" style="grid-column:1/-1"><h3>Gateway control ${checked ? `<span class="cnt" style="text-transform:none;letter-spacing:0">· checked ${checked}</span>` : ""}</h3>
        <div class="gw-ctl">${gwButtons(d, false) || `<span class="muted">${esc(d.note || "no actions")}</span>`}</div>
        ${d.term && d.term.alive ? `<div class="gw-note" style="color:var(--ac)">⧉ Summoned terminal active — pid ${d.term.pid}${d.term.startedAt ? ` · since ${esc(String(d.term.startedAt).slice(11, 19))}` : ""} · Stop terminal closes it</div>`
          : (d.term && d.term.pending ? `<div class="gw-note">⧉ Summoning… waiting for the admin terminal (UAC confirmation)</div>` : "")}
        ${d.note ? `<div class="gw-note">ℹ ${esc(d.note)}</div>` : ""}
        ${statusOut}</div>
      <div class="dsec"><h3>Sessions / Activity <span class="cnt">${act.sessions.length}</span></h3><div class="dsec-body">${sessions}</div></div>
      <div class="dsec"><h3>Subagents / Tasks <span class="cnt">${act.subagents.length}</span></h3><div class="dsec-body">${subs}</div></div>
      <div class="dsec"><h3>Telemetry <span class="cnt">${d.telemetry.length}</span></h3><div class="dsec-body">${tele}</div></div>
      <div class="dsec"><h3>Vault lane — Brains/</h3><div class="dsec-body">${lane}</div></div>
      <div class="dsec" style="grid-column:1/-1"><h3>Gateway run log (owned, live)</h3>
        <pre class="logpane" id="logpane">${d.log.length ? d.log.map(l => `[${l.t}] ${l.s === "err" ? "⚠ " : ""}${esc(l.line)}`).join("\n") : "(nothing yet — appears when you click Run / foreground)"}</pre></div>
    </div>
  </div>`;
  const pane = document.getElementById("logpane");
  if (pane) pane.scrollTop = pane.scrollHeight;
}

/* ---------- avatar upload ---------- */
const avatarInput = document.getElementById("avatarFile");
let avatarTarget = null;
avatarInput.addEventListener("change", () => {
  const file = avatarInput.files[0];
  avatarInput.value = "";
  if (!file || !avatarTarget) return;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = async () => {
    URL.revokeObjectURL(url);              // F13/R15: release the blob URL, prevent a memory leak
    const c = document.createElement("canvas");
    const S = 256; c.width = S; c.height = S;
    const x = c.getContext("2d");
    const s = Math.min(img.width, img.height);
    x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, S, S);
    const r = await api(`/api/agent/${avatarTarget}/avatar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: c.toDataURL("image/png") }),
    });
    if (r.error) alert(r.error);
    refresh(); renderDetail();
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert("failed to read the image"); };
  img.src = url;
});

/* ---------- vault graph (in-page NeuralGraph on /api/graph) ---------- */
async function loadGraph(force) {
  const canvas = document.getElementById("graphCanvas");
  if (!canvas) return;
  if (!graph) {
    graph = NeuralGraph(canvas, { onOpen: n => { location.href = obsUri(n.id); } });
    const search = document.getElementById("graphSearch");
    if (search) search.addEventListener("input", () => graph.setQuery(search.value));
    document.querySelectorAll("#graphLayers .lyr").forEach(b => b.addEventListener("click", () => {
      b.classList.toggle("on");
      const on = {};
      document.querySelectorAll("#graphLayers .lyr").forEach(x => { on[x.dataset.l] = x.classList.contains("on"); });
      graph.setLayers(on);
    }));
  }
  if (graphLoaded && !force) { graph.reheat(); return; }
  const data = await api("/api/graph");
  if (data.error || !Array.isArray(data.nodes)) return;
  graph.setData(data);
  graphLoaded = true;
  const stats = document.getElementById("graphStats");
  const s = data.stats || {};
  if (stats) stats.textContent = `${s.notes ?? data.nodes.length} notes · ${s.links ?? "?"} links · ${s.tagEdges ?? 0} tag · ${s.orphans ?? "?"} orphans`;
}

/* ---------- reports ---------- */
function svgBar(days) {
  const ACC = accent();
  const W = 560, H = 170, P = 26;
  const max = Math.max(1, ...days.map(d => d.count));
  const bw = (W - P * 2) / days.length;
  let bars = "";
  days.forEach((d, i) => {
    const h = Math.round((d.count / max) * (H - 55));
    const x = P + i * bw + 3, y = H - 30 - h;
    bars += `<rect x="${x}" y="${y}" width="${bw - 6}" height="${Math.max(h, 2)}" rx="3" fill="url(#gcy)" filter="url(#glow)"/>
      <text x="${x + (bw - 6) / 2}" y="${y - 6}" fill="#8E88BE" font-size="9" text-anchor="middle" font-family="Cascadia Mono">${d.count || ""}</text>
      <text x="${x + (bw - 6) / 2}" y="${H - 14}" fill="#8E88BE" font-size="8" text-anchor="middle" font-family="Cascadia Mono">${d.date.slice(3)}</text>`;
  });
  return `<svg class="rep-svg" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="gcy" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#0A6E7A"/><stop offset="1" stop-color="${ACC}"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    ${bars}</svg>`;
}
function svgDonut(folders) {
  const total = folders.reduce((s, f) => s + f.count, 0) || 1;
  const R = 62, C = 2 * Math.PI * R;
  let off = 0, segs = "", leg = "";
  folders.forEach((f, i) => {
    const frac = f.count / total, col = PALETTE[i % PALETTE.length];
    segs += `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${col}" stroke-width="20"
      stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-off * C).toFixed(1)}" transform="rotate(-90 90 90)"/>`;
    leg += `<div class="leg" style="color:${col}"><i style="background:${col}"></i>${esc(f.name)} · ${f.count}</div>`;
    off += frac;
  });
  return `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    <svg width="180" height="180" viewBox="0 0 180 180">${segs}
      <text x="90" y="86" fill="#EEEBFF" font-size="24" font-weight="700" text-anchor="middle" font-family="Bahnschrift">${total}</text>
      <text x="90" y="104" fill="#8E88BE" font-size="9" text-anchor="middle" font-family="Cascadia Mono">NOTES</text></svg>
    <div class="graph-legend" style="margin:0;flex-direction:column;align-items:flex-start;gap:6px">${leg}</div></div>`;
}
function renderReport(r) {
  const maxT = Math.max(1, ...r.agents.map(a => a.touched7d));
  document.getElementById("reportArea").innerHTML = `
  <div class="panel rep-wide" style="margin-top:14px">
    <div class="rep-head-stats">
      <div class="rep-stat"><div class="v">${r.totals.notes}</div><div class="l">notes</div></div>
      <div class="rep-stat"><div class="v">${r.totals.edges}</div><div class="l">links</div></div>
      <div class="rep-stat"><div class="v">${r.totals.active7d}</div><div class="l">active 7 days</div></div>
      <div class="rep-stat"><div class="v">${r.totals.openTasks}</div><div class="l">open tasks</div></div>
      <div class="rep-stat"><div class="v">${r.totals.gwRunning}</div><div class="l">gateways up</div></div>
      <div class="rep-stat" style="margin-left:auto"><div class="l">generated</div><div class="l" style="color:#EEEBFF">${r.generatedAt.slice(0, 16).replace("T", " ")}</div></div>
    </div></div>
  <div class="report-grid">
    <div class="panel"><div class="panel-head"><h2>14-DAY ACTIVITY</h2><span class="chip chip-plain">notes changed/day</span></div>${svgBar(r.days)}</div>
    <div class="panel"><div class="panel-head"><h2>FOLDER DISTRIBUTION</h2></div>${svgDonut(r.folders)}</div>
    <div class="panel rep-wide"><div class="panel-head"><h2>AGENT STATUS</h2></div>
      <table class="rep-table"><tr><th>Agent</th><th>Node</th><th>Lane notes</th><th>Active 7d</th><th></th><th>Last seen</th><th>Gateway</th></tr>
      ${r.agents.map(a => `<tr><td>${a.icon} <b>${esc(a.name)}</b></td><td style="font-family:var(--mono);font-size:10px">${esc(a.node)}</td>
        <td>${a.laneNotes}</td><td>${a.touched7d}</td>
        <td><div class="rep-bar"><i style="width:${Math.round(a.touched7d / maxT * 100)}%"></i></div></td>
        <td style="font-family:var(--mono);font-size:10px">${a.lastSeen || "—"}</td>
        <td><span class="lbl-${a.gw === "running" ? "running" : "idle"}" style="font-family:var(--mono);font-size:10px">${a.gw}</span></td></tr>`).join("")}
      </table></div>
    ${r.tasks.length ? `<div class="panel rep-wide"><div class="panel-head"><h2>OPEN TASKS</h2><span class="chip">${r.totals.openTasks}</span></div>
      <div class="mini-list">${r.tasks.map(t => `<a href="${obsUri(t.source)}"><span>☐ ${esc(t.text)}</span><span class="d">${esc(t.source)}</span></a>`).join("")}</div></div>` : ""}
  </div>`;
}

/* ---------- OPS: vault health (#9) + schedule (#8) ---------- */
function ageLabel(h) { return h == null ? "—" : h < 1 ? "<1 hour" : h < 48 ? `${h} hours` : `${Math.round(h / 24)} days`; }
async function loadOps() {
  const vh = document.getElementById("vaultHealth"), sl = document.getElementById("scheduleList");
  if (!vh || !sl) return;
  const [h, s] = await Promise.all([api("/api/vault-health"), api("/api/schedule")]);
  if (h && !h.error) {
    const gitCls = !h.gitOk ? "error" : h.gitAgeH > 48 ? "exited" : "running";
    const bkCls = h.backupAgeH == null ? "idle" : h.backupAgeH > 48 ? "error" : "running";
    vh.innerHTML = `
      <div class="vh-row"><span class="dot ${gitCls}"></span><span class="vh-k">Last git commit</span>
        <span class="vh-v">${h.gitOk ? ageLabel(h.gitAgeH) + " ago" : "no git init yet"}</span></div>
      <div class="vh-row"><span class="dot ${bkCls}"></span><span class="vh-k">Last backup</span>
        <span class="vh-v">${h.backup == null ? "set BACKUP_PATH" : (h.backupAgeH == null ? "not found" : ageLabel(h.backupAgeH) + " ago")}</span></div>
      <div class="vh-hint">${esc(h.vault)}</div>`;
  } else vh.innerHTML = `<div class="empty">failed to load vault health</div>`;
  if (Array.isArray(s) && s.length) {
    sl.innerHTML = s.map(t => {
      const cls = t.error ? "error" : t.ok ? "running" : "exited";
      return `<div class="sched-row"><span class="dot ${cls}"></span>
        <span class="sched-a">${t.icon || ""} ${esc(t.agent)}</span>
        <span class="sched-d">${t.error ? esc(t.error) : `last: ${esc(t.lastRun || "—")} · result ${esc(t.lastResult ?? "—")} · next ${esc(t.nextRun || "—")}`}</span></div>`;
    }).join("");
  } else sl.innerHTML = `<div class="empty">No agents with a <code>schtask</code> in the config.</div>`;
}

/* ---------- events ---------- */
document.body.addEventListener("click", async e => {
  const av = e.target.closest("[data-act='avatar']");
  if (av) { e.stopPropagation(); avatarTarget = av.dataset.id; avatarInput.click(); return; }
  const closeBtn = e.target.closest("[data-act='close-detail']");
  if (closeBtn) { openAgent = null; renderDetail(); refresh(); return; }

  const menuBtn = e.target.closest("[data-menu]");
  if (menuBtn) {
    e.stopPropagation();
    const menu = menuBtn.parentElement.querySelector(".gw-menu");
    const willOpen = menu && !menu.classList.contains("open");
    closeMenus();
    if (willOpen) menu.classList.add("open");
    return;
  }

  const term = e.target.closest("[data-term]");
  if (term) {
    e.stopPropagation();
    const { term: mode, id } = term.dataset;
    closeMenus();
    const lbl = term.textContent; term.disabled = true; term.textContent = "…";
    // summon waits for the UAC answer server-side (up to 45s) — give it room
    const r = await api(`/api/proc/${id}/terminal?mode=${mode}`, { method: "POST", timeoutMs: 60000 });
    term.textContent = lbl; term.disabled = false;
    if (r.notInstalled) {
      const i = r.install || {};
      let msg = r.error;
      if (i.cmd) msg += `\n\nInstall with:\n  ${i.cmd}`;
      if (i.note) msg += `\n\n${i.note}`;
      if (i.url) { if (confirm(`${msg}\n\nOpen the install page?`)) window.open(i.url, "_blank", "noopener"); }
      else alert(msg);
    }
    else if (r.error) alert(r.error);
    else setTimeout(() => { refresh(); if (openAgent) renderDetail(); }, 5000);
    return;
  }

  // Bonus: mark a task done from the dashboard → writes [x] to the vault
  const done = e.target.closest("[data-done]");
  if (done) {
    e.stopPropagation();
    const lbl = done.textContent; done.disabled = true; done.textContent = "…";
    const r = await api("/api/task/done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: done.dataset.done, text: done.dataset.text }) });
    if (r.error) { alert(r.error); done.textContent = lbl; done.disabled = false; }
    else refresh();
    return;
  }

  const btn = e.target.closest("[data-act]");
  if (btn && ["start", "stop", "stop-term", "restart", "status", "run"].includes(btn.dataset.act)) {
    e.stopPropagation();
    const { act, id } = btn.dataset;
    // R#10: one confirm before destructive actions on 24/7 native-service agents
    // (stop-term only closes the summoned terminal — never the service — so it needs no confirm)
    if (["stop", "restart", "run"].includes(act) && AGENTS[id] && AGENTS[id].owner === "native-service"
        && !confirm(`${AGENTS[id].name} is a 24/7 service. Really '${act}'? This can disrupt the running instance.`)) return;
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "…";
    // stop-term = kill-file handshake + up to 10s verify (+ elevated fallback) — needs a longer timeout
    const r = await api(`/api/proc/${id}/${act}`, { method: "POST", timeoutMs: act === "stop-term" ? 90000 : undefined });
    btn.textContent = label; btn.disabled = false;
    if (r.error) alert(r.error);
    else if (act === "status" && r.output) alert(`${id} · status:\n\n${r.output}`);
    setTimeout(() => { refresh(); if (openAgent) renderDetail(); }, act === "status" ? 200 : 900);
    return;
  }

  const card = e.target.closest("[data-open]");
  if (card) {
    openAgent = card.dataset.open;
    switchView("agents");
    renderDetail();
    refresh();
    setTimeout(() => { const d = document.getElementById("agentDetail"); if (d.firstChild) d.scrollIntoView({ behavior: "smooth", block: "start" }); }, 120);
  }
});

function closeMenus() { document.querySelectorAll(".gw-menu.open").forEach(m => m.classList.remove("open")); }
document.addEventListener("click", e => { if (!e.target.closest(".gw-split")) closeMenus(); });

/* R#5: send a task to an agent → written to the vault's Tasks/, appears in Needs Review */
document.getElementById("taskForm").addEventListener("submit", async e => {
  e.preventDefault();
  const title = document.getElementById("taskTitle").value.trim();
  const agent = document.getElementById("taskAgent").value;
  if (!title) return;
  const btn = e.target.querySelector("button[type=submit]");
  const lbl = btn.textContent; btn.disabled = true; btn.textContent = "…";
  const r = await api("/api/task", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent, title }) });
  btn.textContent = lbl; btn.disabled = false;
  if (r.error) return alert(r.error);
  document.getElementById("taskTitle").value = "";
  refresh();   // the new task appears in Needs Review immediately
});

document.getElementById("runAll").addEventListener("click", async () => {
  const r = await api("/api/proc/start-all", { method: "POST" });
  const errs = Object.entries(r).filter(([, v]) => v.error).map(([k, v]) => `${k}: ${v.error}`);
  if (errs.length) alert("Some failed:\n" + errs.join("\n"));
  setTimeout(refresh, 800);
});

document.getElementById("genReport").addEventListener("click", async () => {
  document.getElementById("reportArea").innerHTML = `<div class="empty">Building report…</div>`;
  lastReport = await api("/api/report");
  renderReport(lastReport);
  document.getElementById("saveReport").disabled = false;
});
document.getElementById("saveReport").addEventListener("click", async () => {
  const r = await api("/api/report/save", { method: "POST" });
  if (r.error) return alert(r.error);
  alert(`Report saved to the vault:\n${r.rel}`);
});

function switchView(view) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${view}`));
  if (view === "graph") loadGraph(false);
}
document.getElementById("nav").addEventListener("click", e => {
  const btn = e.target.closest(".nav-item");
  if (btn) switchView(btn.dataset.view);
});

/* ---------- theme switcher (Neural Cosmos Edition — swatch grid from THEMES) ---------- */
function accent() { return (getComputedStyle(document.documentElement).getPropertyValue("--acc") || "#00E5FF").trim(); }
function markTheme() {
  const t = document.documentElement.dataset.theme || "rempeyek";
  document.querySelectorAll("[data-theme-pick]").forEach(b => b.classList.toggle("on", b.dataset.themePick === t));
  const nameEl = document.getElementById("themeName");
  if (nameEl) { const th = THEMES.find(x => x.id === t); nameEl.textContent = th ? th.name : t; }
}
(function renderThemePick() {
  const box = document.getElementById("themePick");
  if (!box) return;
  box.innerHTML = THEMES.map(t =>
    `<button class="theme-sw" data-theme-pick="${t.id}" style="--sw:${t.sw};--sw-bg:${t.bg}" title="${t.name}" aria-label="Theme: ${t.name}"></button>`).join("");
})();
document.getElementById("themePick").addEventListener("click", e => {
  const b = e.target.closest("[data-theme-pick]");
  if (!b) return;
  document.documentElement.dataset.theme = b.dataset.themePick;
  try { localStorage.setItem("aos-theme", b.dataset.themePick); } catch {}
  markTheme();
  _lastStateKey = "";   // force a full re-render so the SVG topology re-reads --acc
  refresh();
  if (graph) graph.reheat();
});
markTheme();

/* ---------- add agent (writes agents.config.json via /api/agents/add) ---------- */
(function wireAddAgent() {
  const ov = document.getElementById("addAgentOv");
  const form = document.getElementById("addAgentForm");
  const btn = document.getElementById("addAgentBtn");
  if (!ov || !form || !btn) return;
  const hint = document.getElementById("aaHint");
  const nameIn = document.getElementById("aaName"), idIn = document.getElementById("aaId");
  const slug = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  const open = () => { ov.hidden = false; hint.textContent = ""; hint.classList.remove("err"); nameIn.focus(); };
  const close = () => { ov.hidden = true; form.reset(); };
  btn.addEventListener("click", open);
  document.getElementById("aaCancel").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  nameIn.addEventListener("input", () => { if (!idIn.dataset.touched) idIn.value = slug(nameIn.value); });
  idIn.addEventListener("input", () => { idIn.dataset.touched = "1"; });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const body = {
      id: slug(idIn.value || nameIn.value),
      name: nameIn.value.trim(),
      icon: document.getElementById("aaIcon").value.trim(),
      role: document.getElementById("aaRole").value.trim(),
      accent: document.getElementById("aaAccent").value,
      trigger: document.getElementById("aaTrigger").value.trim(),
      home: document.getElementById("aaHome").value.trim(),
    };
    if (!body.id || !body.name) { hint.textContent = "name (and id) required"; hint.classList.add("err"); return; }
    const sub = form.querySelector("button[type=submit]");
    const lbl = sub.textContent; sub.disabled = true; sub.textContent = "…";
    const r = await api("/api/agents/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    sub.disabled = false; sub.textContent = lbl;
    if (r.error) { hint.textContent = r.error; hint.classList.add("err"); return; }
    close();
    _lastStateKey = "";   // new node must appear even if the poll hasn't ticked yet
    refresh();
  });
})();

/* ---------- loop ---------- */
async function refresh() {
  const state = await api("/api/state");
  const cb = document.getElementById("configBanner");
  if (!state || state.error) {
    if (cb) { cb.hidden = false; cb.innerHTML = `⚠ <b>Failed to load state</b> — ${(state && state.error) || "server not responding"}. Try reloading the page; if you use a token, make sure it is correct.`; }
    document.getElementById("stamp").textContent = `failed to load (${(state && state.error) || "server down?"})`;
    return;
  }
  if (cb && !state.configError) cb.hidden = true;
  updateTopoLive(state);   // sparkline moves every poll, even when the dirty-check skips the rebuild
  render(state);
}
const visible = () => document.visibilityState === "visible";   // F3: don't poll while the tab is hidden
const cmdActive = () => document.getElementById("view-command").classList.contains("active");
setInterval(() => { document.getElementById("clock").textContent = new Date().toLocaleString("en-GB"); }, 1000);
refresh();
loadOps();   // #8/#9 once at startup
setInterval(() => { if (visible()) refresh(); }, 6000);
setInterval(() => { if (visible() && cmdActive()) loadOps(); }, 60000);   // OPS less often (schtasks/git are expensive)
setInterval(() => { if (visible() && openAgent && document.getElementById("view-agents").classList.contains("active")) renderDetail(); }, 5000);
setInterval(() => { if (visible() && graphLoaded && document.getElementById("view-graph").classList.contains("active")) loadGraph(true); }, 90000);
document.addEventListener("visibilitychange", () => { if (visible()) refresh(); });   // refresh immediately when the tab becomes active again
