/* AGENTIC//OS — app logic */
const VAULT_NAME = "Obsidian Vault";
let TOKEN = localStorage.getItem("dashToken") || "";
let openAgent = null;   // id agent yang detailnya terbuka
let graph = null, graphLoaded = false;
let lastReport = null;

const ACCENT = { "claude-code": "#00E5FF", hermes: "#A6FF3C", openclaw: "#4C9BFF", zcode: "#8C5BFF", copilot: "#FFB01F" };
const TILE_C = ["#00E5FF", "#FF3DD8", "#A6FF3C", "#FFB01F"];
const PALETTE = ["#00E5FF", "#FF3DD8", "#A6FF3C", "#FFB01F", "#8C5BFF", "#FF4D6A", "#3CFFC8", "#FF8A3C", "#4C9BFF", "#F2FF3C"];

const WORKFLOWS = [
  { who: "Hermes", t: "Crypto & Market Ops", d: "Trading bot, market analysis, cron & heartbeat 24/7. Real-money hanya dengan approval Boss." },
  { who: "ZCode", t: "Build & Orchestrate", d: "Interactive coding, software engineering, orkestrasi 200+ skills." },
  { who: "OpenClaw", t: "Strategic Memo", d: "Analisis bisnis, SWOT, founder-grade docs, persona-driven writing." },
  { who: "Claude Code", t: "Dev & Vault Ops", d: "Full dev, file ops, MCP, integrasi ekosistem, penjaga konstitusi vault." },
];

/* ---------- util ---------- */
function headers() { return TOKEN ? { "x-dash-token": TOKEN } : {}; }
/* api() selalu balik objek (tak pernah throw): R7/R8 fetch dibungkus try/catch + AbortSignal timeout,
   R6/F12 retry 401 pakai counter maksimal 2 (bukan rekursi tak terbatas). */
async function api(path, opts = {}, attempt = 0) {
  try {
    const res = await fetch(path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) }, signal: AbortSignal.timeout(8000) });
    if (res.status === 401) {
      if (attempt >= 2) return { error: "unauthorized" };
      TOKEN = prompt("Dashboard dikunci token (DASH_TOKEN). Masukkan token:") || "";
      localStorage.setItem("dashToken", TOKEN);
      if (TOKEN) return api(path, opts, attempt + 1);
      return { error: "unauthorized" };
    }
    return await res.json();
  } catch (e) { return { error: e && e.name === "TimeoutError" ? "timeout" : (e && e.message) || "network error" }; }
}
function obsUri(rel) { return `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(rel.replace(/\.md$/, ""))}`; }
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function pill(status) { return `<span class="pill"><span class="dot ${status}"></span><span class="lbl-${status}">${status}</span></span>`; }
function ac(id) { return ACCENT[id] || "#8C5BFF"; }
function gwState(p) {
  if (!p || p.status === "off") return { cls: "idle", label: "belum dicek", tip: "" };
  if (p.status === "running") return { cls: "running", label: p.mode === "owned" ? `running · owned pid ${p.pid}` : "running · service", tip: p.statusText || "" };
  if (p.status === "stopped") return { cls: "idle", label: "stopped", tip: p.statusText || "" };
  if (p.status === "exited") return { cls: "exited", label: `exited (${p.exitCode})`, tip: p.reason || "" };
  return { cls: "error", label: p.status, tip: p.reason || "" };
}
function gwPill(gw) {
  return `<span class="pill" title="${esc(gw.tip)}"><span class="dot ${gw.cls}"></span>` +
    `<span class="lbl-${gw.cls}">${esc(gw.label)}</span></span>`;
}
/* ROADMAP #2: chip uptime 24 jam (reuse pill/dot — tanpa CSS baru) */
function uptimeChip(u) {
  if (!u || !u.samples) return "";
  const cls = u.pct >= 90 ? "running" : u.pct >= 50 ? "exited" : "error";
  return `<span class="pill" title="uptime 24 jam · ${u.samples} sampel poll"><span class="dot ${cls}"></span>` +
    `<span class="lbl-${cls}">${u.pct}% up 24h</span></span>`;
}
function avatarHtml(a, lg) {
  const inner = a.avatar ? `<img src="${a.avatar}" alt="${esc(a.name)}">` : (a.icon || "◈");
  return `<div class="avatar ${lg ? "avatar-lg" : ""}" style="--ac:${ac(a.id)}">${inner}
    ${lg ? `<button class="avatar-edit" data-act="avatar" data-id="${a.id}" title="Ganti foto profil">✎</button>` : ""}</div>`;
}
const ACT_LABEL = { start: "▶ Start", stop: "■ Stop", restart: "↻ Restart", status: "◇ Status", run: "⚡ Run" };
const ACT_CLS = { start: "btn-run", stop: "btn-stop", restart: "btn-dim", status: "btn-dim", run: "btn-dim" };
function gwBtn(act, id) { return `<button class="btn ${ACT_CLS[act] || "btn-dim"}" data-act="${act}" data-id="${id}">${ACT_LABEL[act] || act}</button>`; }
/* Start = split button: klik utama buka terminal admin + panggil agent; caret = pilihan terminal lain + start headless */
function startSplit(a) {
  return `<div class="gw-split">
    <button class="btn btn-run gw-main" data-term="summon" data-id="${a.id}" title="Buka terminal admin di folder ${esc(a.id)} + panggil agent">▶ Start</button>
    <button class="btn btn-run gw-caret" data-menu="${a.id}" title="Pilihan terminal">▾</button>
    <div class="gw-menu" data-menufor="${a.id}">
      <button data-term="summon" data-id="${a.id}">⧉ Open terminal · panggil agent</button>
      <button data-term="start" data-id="${a.id}">⧉ Gateway start · terminal</button>
      <button data-term="run" data-id="${a.id}">⧉ Gateway run · terminal</button>
      <div class="gw-menu-sep"></div>
      <button data-act="start" data-id="${a.id}">◇ Start headless (background)</button>
    </div>
  </div>`;
}
function summonBtn(a) {
  return `<button class="btn btn-run" data-term="summon" data-id="${a.id}" title="Buka terminal admin + panggil ${esc(a.name)}">⧉ Panggil</button>`;
}
function gwButtons(a, compact) {
  if (!a.enabled) return `<button class="btn btn-dim" disabled title="${esc(a.note || "nonaktif")}">setup dulu</button>`;
  const acts = a.actions || [];
  const running = a.proc && a.proc.status === "running";
  const hasStart = acts.includes("start");
  if (compact) {
    if (running) return gwBtn("stop", a.id);
    if (hasStart) return startSplit(a);
    return a.canSummon ? summonBtn(a) : (acts[0] ? gwBtn(acts[0], a.id) : "");
  }
  // detail: split Start (gateway) atau tombol Panggil (non-gateway spt Copilot) + sisa aksi headless
  const rest = acts.filter(x => x !== "start").map(x => gwBtn(x, a.id)).join("");
  return (hasStart ? startSplit(a) : (a.canSummon ? summonBtn(a) : "")) + rest;
}

/* ---------- render utama ---------- */
let _lastStateKey = "";
function render(state) {
  document.getElementById("stamp").textContent = new Date(state.generatedAt).toLocaleTimeString("id-ID");
  // F2: dirty-check — kalau data (selain timestamp) tak berubah, skip rebuild DOM berat (cegah layout thrash + scroll jump)
  const key = JSON.stringify({ ...state, generatedAt: 0 });
  if (key === _lastStateKey) return;
  _lastStateKey = key;
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
    <div class="tile-val">${s.value}</div><div class="tile-sub">live dari vault</div></div>`)));

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

  document.getElementById("reviewCount").textContent = `${state.review.length} open`;
  const rl = document.getElementById("reviewList");
  rl.innerHTML = "";
  if (!state.review.length) rl.appendChild(el(`<div class="empty">Kosong — tambah catatan ke <b>Inbox/</b> atau checkbox di <b>Tasks/</b> dan item muncul di sini.</div>`));
  state.review.slice(0, 8).forEach(r => rl.appendChild(el(`<div class="review-item">
    <div><span class="t">${esc(r.title)}</span><span class="kind ${r.kind}">${r.kind}</span>
    <div class="m">${esc(r.meta)}</div></div>
    <a href="${obsUri(r.meta)}">Buka di Obsidian</a></div>`)));

  const wf = document.getElementById("workflowCards");
  wf.innerHTML = "";
  WORKFLOWS.forEach(w => wf.appendChild(el(`<div class="wf">
    <span class="who">${esc(w.who)}</span><div class="t">${esc(w.t)}</div><div class="d">${esc(w.d)}</div></div>`)));

  const pl = document.getElementById("projectList");
  pl.innerHTML = "";
  state.projects.forEach(p => pl.appendChild(el(`<div class="list-item">
    <div><b>${esc(p.name)}</b><div class="p">${esc(p.rel)}</div></div>
    <div style="display:flex;gap:12px;align-items:center"><span class="d">${p.updated}</span>
    <a class="chip" style="text-decoration:none" href="${obsUri(p.rel)}">buka</a></div></div>`)));
}

/* ---------- detail agent ---------- */
async function renderDetail() {
  const box = document.getElementById("agentDetail");
  if (!openAgent) { box.innerHTML = ""; return; }
  const d = await api(`/api/agent/${openAgent}/detail`);
  if (d.error) { box.innerHTML = `<div class="empty">${esc(d.error)}</div>`; return; }
  const gw = gwState(d.proc);
  const act = d.activity || { sessions: [], subagents: [] };
  const isTele = d.source === "telemetry";   // Claude = transcript, lainnya = telemetry

  const sessions = act.sessions.length ? act.sessions.map(s => `<div class="sess">
      <div class="top"><span>${esc(s.id)}${s.project ? " · " + esc(s.project) : ""}</span>${pill(s.status)}</div>
      ${s.lastPrompt ? `<div class="prm">❯ ${esc(s.lastPrompt)}</div>` : ""}
      ${s.lastTool ? `<div class="act">⚙ ${esc(s.lastTool.name)} ${esc(s.lastTool.target)} · ${s.toolCount} tool call</div>` : ""}
    </div>`).join("")
    : `<div class="empty">${isTele
        ? `Belum ada aktivitas. Agent lapor task via telemetry <code>agentic-os\\telemetry\\${esc(d.id)}.jsonl</code> (type <code>task_start/progress/done</code>).`
        : "Belum ada sesi 48 jam terakhir."}</div>`;

  const subs = act.subagents.length ? act.subagents.map(s => `<div class="subrow">
      <span class="ty">${esc(s.type)}</span><span class="nm">${esc(s.desc)}${s.detail ? " — " + esc(s.detail) : ""}</span>
      <span class="st st-${s.status}">${s.status === "done" ? "✔ done" : "⟳ running"}</span></div>`).join("")
    : `<div class="empty">${isTele
        ? `Belum ada subagent/task. Lapor via telemetry (type <code>subagent_start/done</code>) → muncul di sini otomatis.`
        : "Belum ada subagent yang di-spawn di sesi 48 jam terakhir. Begitu ada Agent/Task spawn, muncul otomatis."}</div>`;

  const tele = d.telemetry.length ? d.telemetry.map(t => `<div class="subrow">
      <span class="ty">${esc(t.type)}</span>
      <span class="nm">${esc(t.name || "")}${t.detail ? " — " + esc(t.detail) : ""}
        ${t.progress != null ? `<span class="tele-bar"><i style="width:${Math.min(100, t.progress)}%"></i></span>` : ""}</span>
      <span class="st">${esc((t.ts || "").slice(11, 16))}</span></div>`).join("")
    : `<div class="empty">Belum ada telemetry. Agent bisa lapor progres via <code>agentic-os\\telemetry\\${esc(d.id)}.jsonl</code> (lihat README di folder itu).</div>`;

  const lane = d.laneFiles.length ? `<div class="mini-list">${d.laneFiles.map(f =>
    `<a href="${obsUri(f.rel)}"><span>${esc(f.rel.split("/").pop().replace(".md", ""))}</span><span class="d">${f.updated}</span></a>`).join("")}</div>`
    : `<div class="empty">Belum ada catatan di lane Brains.</div>`;

  const checked = d.proc && d.proc.checkedAt ? new Date(d.proc.checkedAt).toLocaleTimeString("id-ID") : null;
  const statusOut = d.proc && d.proc.statusText
    ? `<pre class="logpane" style="height:130px" id="statusout">${esc(d.proc.statusText)}</pre>`
    : `<div class="empty">Klik <b>Status</b> untuk cek kondisi gateway lewat command aslinya.</div>`;

  box.innerHTML = `<div class="detail" style="--ac:${ac(d.id)}">
    <div class="detail-head">
      ${avatarHtml(d, true)}
      <div>
        <h2>${esc(d.name)}</h2>
        <div class="detail-meta">${esc(d.role)} · ${esc(d.node)} · <code>${esc(d.bin || "gateway N/A")}</code></div>
        <div class="pill-row" style="margin-top:7px">${pill(d.vaultStatus)}${gwPill(gw)}</div>
      </div>
      <div class="detail-actions"><button class="btn btn-dim" data-act="close-detail">✕ tutup</button></div>
    </div>
    <div class="detail-grid">
      <div class="dsec" style="grid-column:1/-1"><h3>Kontrol gateway ${checked ? `<span class="cnt" style="text-transform:none;letter-spacing:0">· dicek ${checked}</span>` : ""}</h3>
        <div class="gw-ctl">${gwButtons(d, false) || `<span class="muted">${esc(d.note || "tidak ada aksi")}</span>`}</div>
        ${d.note ? `<div class="gw-note">ℹ ${esc(d.note)}</div>` : ""}
        ${statusOut}</div>
      <div class="dsec"><h3>Sesi / Aktivitas <span class="cnt">${act.sessions.length}</span></h3>${sessions}</div>
      <div class="dsec"><h3>Subagent / Task <span class="cnt">${act.subagents.length}</span></h3>${subs}</div>
      <div class="dsec"><h3>Telemetry <span class="cnt">${d.telemetry.length}</span></h3>${tele}</div>
      <div class="dsec"><h3>Lane vault — Brains/</h3>${lane}</div>
      <div class="dsec" style="grid-column:1/-1"><h3>Log gateway run (owned, live)</h3>
        <pre class="logpane" id="logpane">${d.log.length ? d.log.map(l => `[${l.t}] ${l.s === "err" ? "⚠ " : ""}${esc(l.line)}`).join("\n") : "(belum ada — muncul kalau kamu klik Run / foreground)"}</pre></div>
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
    URL.revokeObjectURL(url);              // F13/R15: lepas blob URL, cegah memory leak
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
  img.onerror = () => { URL.revokeObjectURL(url); alert("gagal baca gambar"); };
  img.src = url;
});

/* ---------- graph ---------- */
async function loadGraph(force) {
  const canvas = document.getElementById("graphCanvas");
  if (!graph) {
    graph = NeuralGraph(canvas, { onOpen: n => window.location.href = obsUri(n.id) });
    document.getElementById("graphSearch").addEventListener("input", e => graph.setQuery(e.target.value));
  }
  if (graphLoaded && !force) { graph.reheat(); return; }
  const data = await api("/api/graph");
  if (!data || data.error || !Array.isArray(data.nodes)) {   // guard: jangan setData undefined kalau server error
    document.getElementById("graphStats").textContent = `graph gagal dimuat (${(data && data.error) || "?"})`;
    return;
  }
  graph.setData(data);
  graphLoaded = true;
  document.getElementById("graphStats").textContent = `${data.nodes.length} node · ${data.edges.length} link`;
  document.getElementById("graphLegend").innerHTML = graph.legend()
    .map(l => `<span class="leg" style="color:${l.color}"><i style="background:${l.color}"></i>${esc(l.name)}</span>`).join("");
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
      <text x="90" y="104" fill="#8E88BE" font-size="9" text-anchor="middle" font-family="Cascadia Mono">CATATAN</text></svg>
    <div class="graph-legend" style="margin:0;flex-direction:column;align-items:flex-start;gap:6px">${leg}</div></div>`;
}
function renderReport(r) {
  const maxT = Math.max(1, ...r.agents.map(a => a.touched7d));
  document.getElementById("reportArea").innerHTML = `
  <div class="panel rep-wide" style="margin-top:14px">
    <div class="rep-head-stats">
      <div class="rep-stat"><div class="v">${r.totals.notes}</div><div class="l">catatan</div></div>
      <div class="rep-stat"><div class="v">${r.totals.edges}</div><div class="l">koneksi</div></div>
      <div class="rep-stat"><div class="v">${r.totals.active7d}</div><div class="l">aktif 7 hari</div></div>
      <div class="rep-stat"><div class="v">${r.totals.openTasks}</div><div class="l">task terbuka</div></div>
      <div class="rep-stat"><div class="v">${r.totals.gwRunning}</div><div class="l">gateway jalan</div></div>
      <div class="rep-stat" style="margin-left:auto"><div class="l">digenerate</div><div class="l" style="color:#EEEBFF">${r.generatedAt.slice(0, 16).replace("T", " ")}</div></div>
    </div></div>
  <div class="report-grid">
    <div class="panel"><div class="panel-head"><h2>AKTIVITAS 14 HARI</h2><span class="chip chip-plain">catatan diubah/hari</span></div>${svgBar(r.days)}</div>
    <div class="panel"><div class="panel-head"><h2>DISTRIBUSI FOLDER</h2></div>${svgDonut(r.folders)}</div>
    <div class="panel rep-wide"><div class="panel-head"><h2>STATUS AGENT</h2></div>
      <table class="rep-table"><tr><th>Agent</th><th>Node</th><th>Catatan lane</th><th>Aktif 7d</th><th></th><th>Terakhir</th><th>Gateway</th></tr>
      ${r.agents.map(a => `<tr><td>${a.icon} <b>${esc(a.name)}</b></td><td style="font-family:var(--mono);font-size:10px">${esc(a.node)}</td>
        <td>${a.laneNotes}</td><td>${a.touched7d}</td>
        <td><div class="rep-bar"><i style="width:${Math.round(a.touched7d / maxT * 100)}%"></i></div></td>
        <td style="font-family:var(--mono);font-size:10px">${a.lastSeen || "—"}</td>
        <td><span class="lbl-${a.gw === "running" ? "running" : "idle"}" style="font-family:var(--mono);font-size:10px">${a.gw}</span></td></tr>`).join("")}
      </table></div>
    ${r.tasks.length ? `<div class="panel rep-wide"><div class="panel-head"><h2>TASK TERBUKA</h2><span class="chip">${r.totals.openTasks}</span></div>
      <div class="mini-list">${r.tasks.map(t => `<a href="${obsUri(t.source)}"><span>☐ ${esc(t.text)}</span><span class="d">${esc(t.source)}</span></a>`).join("")}</div></div>` : ""}
  </div>`;
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

  const btn = e.target.closest("[data-act]");
  if (btn && ["start", "stop", "restart", "status", "run"].includes(btn.dataset.act)) {
    e.stopPropagation();
    const { act, id } = btn.dataset;
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "…";
    const r = await api(`/api/proc/${id}/${act}`, { method: "POST" });
    btn.textContent = label; btn.disabled = false;
    if (r.error) alert(r.error);
    else if (r.output && (act === "status" || !openAgent)) {
      // tampilkan output command kalau detail tidak terbuka; kalau terbuka, detail sudah menampilkannya
      if (!openAgent) alert(`${id} · ${act}:\n\n${r.output}`);
    }
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

document.getElementById("runAll").addEventListener("click", async () => {
  const r = await api("/api/proc/start-all", { method: "POST" });
  const errs = Object.entries(r).filter(([, v]) => v.error).map(([k, v]) => `${k}: ${v.error}`);
  if (errs.length) alert("Sebagian gagal:\n" + errs.join("\n"));
  setTimeout(refresh, 800);
});

document.getElementById("genReport").addEventListener("click", async () => {
  document.getElementById("reportArea").innerHTML = `<div class="empty">Membangun laporan…</div>`;
  lastReport = await api("/api/report");
  renderReport(lastReport);
  document.getElementById("saveReport").disabled = false;
});
document.getElementById("saveReport").addEventListener("click", async () => {
  const r = await api("/api/report/save", { method: "POST" });
  if (r.error) return alert(r.error);
  alert(`Laporan tersimpan di vault:\n${r.rel}`);
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
  if (!state || state.error) { document.getElementById("stamp").textContent = `gagal memuat (${(state && state.error) || "server mati?"})`; return; }
  render(state);
}
const visible = () => document.visibilityState === "visible";   // F3: jangan polling saat tab hidden
setInterval(() => { document.getElementById("clock").textContent = new Date().toLocaleString("id-ID"); }, 1000);
refresh();
setInterval(() => { if (visible()) refresh(); }, 6000);
setInterval(() => { if (visible() && openAgent && document.getElementById("view-agents").classList.contains("active")) renderDetail(); }, 5000);
setInterval(() => { if (visible() && graphLoaded && document.getElementById("view-graph").classList.contains("active")) loadGraph(true); }, 90000);
document.addEventListener("visibilitychange", () => { if (visible()) refresh(); });   // refresh langsung saat tab balik aktif
