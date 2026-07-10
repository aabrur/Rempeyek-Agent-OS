/* AGENTIC//OS — app logic */
const VAULT_NAME = "Obsidian Vault";
let TOKEN = localStorage.getItem("dashToken") || "";
let openAgent = null;   // id of the agent whose detail panel is open
let graph = null, graphLoaded = false;
let lastReport = null;
let AGENTS = {};   // R#10: id -> agent (owner: native-service check for the confirm guard)

const ACCENT = { "claude-code": "#00E5FF", hermes: "#A6FF3C", openclaw: "#4C9BFF", zcode: "#8C5BFF", copilot: "#FFB01F", "kimi-code": "#F2FF3C", antigravity: "#FF8A3C" };
const TILE_C = ["#00E5FF", "#FF3DD8", "#A6FF3C", "#FFB01F"];
const PALETTE = ["#00E5FF", "#FF3DD8", "#A6FF3C", "#FFB01F", "#8C5BFF", "#FF4D6A", "#3CFFC8", "#FF8A3C", "#4C9BFF", "#F2FF3C"];

const WORKFLOWS = [
  { id: "openclaw", who: "OpenClaw", t: "Strategy & Business", d: "Business analysis, SWOT, founder-grade memos, persona-driven writing, multi-agent orchestration." },
  { id: "hermes", who: "Hermes", t: "Crypto & Market Ops", d: "Trading bot, market analysis, cron & heartbeat 24/7. Real-money moves only with Boss approval." },
  { id: "zcode", who: "ZCode", t: "Build & Debug", d: "Interactive coding, software engineering, systematic debugging, orchestration of 200+ skills." },
  { id: "claude-code", who: "Claude Code", t: "Dev & Vault Ops", d: "Full dev, file ops, MCP, ecosystem integration, guardian of the vault constitution." },
  { id: "kimi-code", who: "Kimi Code", t: "Backup Coding", d: "Standby coding agent — long-context implementation and code review when extra capacity is needed." },
  { id: "copilot", who: "Copilot CLI", t: "Inline Assist", d: "Manual CLI coding assistant — quick edits, completions, and MCP/plugin-driven tasks in its own terminal." },
  { id: "antigravity", who: "Antigravity", t: "Agentic Integration", d: "Gemini-based advanced agentic coding, dashboard building, and knowledge-graph visualization." },
];

/* ---------- util ---------- */
function headers() { return TOKEN ? { "x-dash-token": TOKEN } : {}; }
/* api() always returns an object (never throws): R7/R8 fetch wrapped in try/catch + AbortSignal timeout,
   R6/F12 401 retry uses a counter capped at 2 (not unbounded recursion). */
async function api(path, opts = {}, attempt = 0) {
  try {
    const res = await fetch(path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) }, signal: AbortSignal.timeout(8000) });
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
function obsUri(rel) { return `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(rel.replace(/\.md$/, ""))}`; }
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function pill(status) { return `<span class="pill"><span class="dot ${status}"></span><span class="lbl-${status}">${status}</span></span>`; }
function ac(id) { return ACCENT[id] || "#8C5BFF"; }
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
const ACT_LABEL = { start: "▶ Start", stop: "■ Stop", restart: "↻ Restart", status: "◇ Status", run: "⚡ Run" };
const ACT_CLS = { start: "btn-run", stop: "btn-stop", restart: "btn-dim", status: "btn-dim", run: "btn-dim" };
function gwBtn(act, id) { return `<button class="btn ${ACT_CLS[act] || "btn-dim"}" data-act="${act}" data-id="${id}">${ACT_LABEL[act] || act}</button>`; }
/* Start = split button: main click starts the gateway; caret = other terminal options + headless start */
function startSplit(a) {
  return `<div class="gw-split">
    <button class="btn btn-run gw-main" data-act="start" data-id="${a.id}" title="Start the ${esc(a.name)} gateway (background service) — the agent comes up and can be monitored">▶ Start</button>
    <button class="btn btn-run gw-caret" data-menu="${a.id}" title="More options">▾</button>
    <div class="gw-menu" data-menufor="${a.id}">
      <button data-term="summon" data-id="${a.id}">⧉ Open terminal · summon agent</button>
      <button data-term="run" data-id="${a.id}">⧉ Gateway run · terminal (foreground)</button>
      <div class="gw-menu-sep"></div>
      <button data-act="status" data-id="${a.id}">◇ Status</button>
      <button data-act="restart" data-id="${a.id}">↻ Restart</button>
    </div>
  </div>`;
}
function summonBtn(a) {
  return `<button class="btn btn-run" data-term="summon" data-id="${a.id}" title="Open an admin terminal + summon ${esc(a.name)}">⧉ Summon</button>`;
}
function gwButtons(a, compact) {
  if (!a.enabled) return `<button class="btn btn-dim" disabled title="${esc(a.note || "disabled")}">setup required</button>`;
  const acts = a.actions || [];
  const running = a.proc && a.proc.status === "running";
  const hasStart = acts.includes("start");
  if (compact) {
    if (running) return gwBtn("stop", a.id);
    if (hasStart) return startSplit(a);
    return a.canSummon ? summonBtn(a) : (acts[0] ? gwBtn(acts[0], a.id) : "");
  }
  // detail: split Start (gateway) or Summon button (non-gateway agents like Copilot) + remaining headless actions
  const rest = acts.filter(x => x !== "start").map(x => gwBtn(x, a.id)).join("");
  return (hasStart ? startSplit(a) : (a.canSummon ? summonBtn(a) : "")) + rest;
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
  const box = document.getElementById("topologyMap");
  if (!box) return;
  const agents = state.agents;
  const W = 960, H = 320, cx = W / 2, cy = H / 2, rx = 380, ry = 108;
  const n = agents.length;
  let defs = "", links = "", nodes = "";
  agents.forEach((a, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = cx + rx * Math.cos(ang), y = cy + ry * Math.sin(ang);
    const st = nodeStatus(a);
    const col = ac(a.id);
    const dash = st.cls === "top-obs" ? `stroke-dasharray="4 4"` : "";
    const pulse = st.cls === "top-run" ? `<circle class="top-pulse" cx="${x}" cy="${y}" r="24" fill="none" stroke="${st.ring}" stroke-width="1.5" opacity=".8"/>` : "";
    links += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${st.cls === "top-run" ? col : "#2A2744"}" stroke-width="${st.cls === "top-run" ? 1.6 : 1}" opacity="${st.cls === "top-run" ? .75 : .5}" ${dash}/>`;
    nodes += `<g class="top-node ${st.cls}" data-open="${a.id}" transform="translate(${x},${y})" style="cursor:pointer">
      ${pulse ? pulse.replace(`cx="${x}" cy="${y}"`, `cx="0" cy="0"`) : ""}
      <circle r="21" fill="#100E1F" stroke="${st.ring}" stroke-width="2" ${dash}/>
      <text y="6" text-anchor="middle" font-size="17">${a.icon || "◈"}</text>
      <text y="38" text-anchor="middle" font-size="10.5" fill="#EEEBFF" font-family="Bahnschrift,sans-serif" font-weight="600">${esc(a.name)}</text>
      <text y="51" text-anchor="middle" font-size="8.5" fill="${st.ring}" font-family="Cascadia Mono,monospace">${st.label}</text>
      <text y="-30" text-anchor="middle" font-size="8" fill="#8E88BE" font-family="Cascadia Mono,monospace">${esc(a.node || "")}</text>
    </g>`;
  });
  const runningCount = agents.filter(a => a.proc && a.proc.status === "running").length;
  box.innerHTML = `<svg class="topology" viewBox="0 0 ${W} ${H}" role="img" aria-label="Agent topology map">
    ${defs}${links}
    <g class="top-hub">
      <circle cx="${cx}" cy="${cy}" r="34" fill="#14112A" stroke="#00E5FF" stroke-width="1.6"/>
      <circle class="top-pulse" cx="${cx}" cy="${cy}" r="40" fill="none" stroke="#00E5FF" stroke-width="1" opacity=".5"/>
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="15" fill="#00E5FF" font-family="Bahnschrift,sans-serif" font-weight="700">◈</text>
      <text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="7.5" fill="#8E88BE" font-family="Cascadia Mono,monospace">${runningCount}/${n} LIVE</text>
    </g>
    ${nodes}
  </svg>`;
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
        ${d.note ? `<div class="gw-note">ℹ ${esc(d.note)}</div>` : ""}
        ${statusOut}</div>
      <div class="dsec"><h3>Sessions / Activity <span class="cnt">${act.sessions.length}</span></h3>${sessions}</div>
      <div class="dsec"><h3>Subagents / Tasks <span class="cnt">${act.subagents.length}</span></h3>${subs}</div>
      <div class="dsec"><h3>Telemetry <span class="cnt">${d.telemetry.length}</span></h3>${tele}</div>
      <div class="dsec"><h3>Vault lane — Brains/</h3>${lane}</div>
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
  }
  if (graphLoaded && !force) { graph.reheat(); return; }
  const data = await api("/api/graph");
  if (data.error || !Array.isArray(data.nodes)) return;
  graph.setData(data);
  graphLoaded = true;
  const stats = document.getElementById("graphStats");
  if (stats) stats.textContent = `${data.nodes.length} notes · ${data.edges.length} links`;
}

/* ---------- reports ---------- */
function svgBar(days) {
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
      <stop offset="0" stop-color="#0A6E7A"/><stop offset="1" stop-color="#00E5FF"/></linearGradient>
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
    const r = await api(`/api/proc/${id}/terminal?mode=${mode}`, { method: "POST" });
    term.textContent = lbl; term.disabled = false;
    if (r.error) alert(r.error);
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
  if (btn && ["start", "stop", "restart", "status", "run"].includes(btn.dataset.act)) {
    e.stopPropagation();
    const { act, id } = btn.dataset;
    // R#10: one confirm before destructive actions on 24/7 native-service agents
    if (["stop", "restart", "run"].includes(act) && AGENTS[id] && AGENTS[id].owner === "native-service"
        && !confirm(`${AGENTS[id].name} is a 24/7 service. Really '${act}'? This can disrupt the running instance.`)) return;
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "…";
    const r = await api(`/api/proc/${id}/${act}`, { method: "POST" });
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
