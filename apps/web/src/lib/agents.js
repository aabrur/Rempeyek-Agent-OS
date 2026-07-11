/* Agent presentation logic — colors, gateway state, workflow routing. */

/* Built-in accents. An agent's own `accent` field (agents.config.json) wins over this;
   agents added from the dashboard always carry one. */
export const ACCENT = {
  "claude-code": "#00E5FF", hermes: "#A6FF3C", openclaw: "#4C9BFF", "kilo-code": "#8C5BFF",
  copilot: "#FFB01F", cline: "#F2FF3C", pi: "#3CFFC8", antigravity: "#FF8A3C",
};
export const TILE_C = ["#00E5FF", "#FF3DD8", "#A6FF3C", "#FFB01F"];
export const PALETTE = ["#00E5FF", "#FF3DD8", "#A6FF3C", "#FFB01F", "#8C5BFF", "#FF4D6A", "#3CFFC8", "#FF8A3C", "#4C9BFF", "#F2FF3C"];

/** Per-agent accent: config-driven first, then the built-in map, then violet. */
export function agentAccent(agent) {
  if (typeof agent === "string") return ACCENT[agent] || "#8C5BFF";
  return agent?.accent || ACCENT[agent?.id] || "#8C5BFF";
}

export const WORKFLOWS = [
  { id: "openclaw", who: "OpenClaw", t: "Strategy & Business", d: "Business analysis, SWOT, founder-grade memos, persona-driven writing, multi-agent orchestration." },
  { id: "hermes", who: "Hermes", t: "Crypto & Market Ops", d: "Trading bot, market analysis, cron & heartbeat 24/7. Real-money moves only with Boss approval." },
  { id: "kilo-code", who: "Kilo Code", t: "Build & Debug", d: "Terminal AI coding agent (kilo.ai) — code generation, task automation, 500+ models behind one CLI." },
  { id: "claude-code", who: "Claude Code", t: "Dev & Vault Ops", d: "Full dev, file ops, MCP, ecosystem integration, guardian of the vault constitution." },
  { id: "cline", who: "Cline", t: "Autonomous Coding", d: "Autonomous coding agent (cline.bot) — interactive sessions, one-shot tasks, and kanban-driven runs." },
  { id: "copilot", who: "Copilot CLI", t: "Inline Assist", d: "Manual CLI coding assistant — quick edits, completions, and MCP/plugin-driven tasks in its own terminal." },
  { id: "antigravity", who: "Antigravity", t: "Agentic Integration", d: "Gemini-based advanced agentic coding, dashboard building, and knowledge-graph visualization." },
  { id: "pi", who: "Pi", t: "Minimal Agent Ops", d: "Lean open-source coding agent (pi.dev) — read/write/edit/bash tools, subscription or API login, fast one-off runs." },
];

/** Normalize the server's proc info into {cls,label,tip} for pills. */
export function gwState(p) {
  if (!p || p.status === "off") return { cls: "idle", label: "not checked yet", tip: "" };
  if (p.status === "running") return { cls: "running", label: p.mode === "owned" ? `running · owned pid ${p.pid}` : "running · service", tip: p.statusText || "" };
  if (p.status === "stopped") return { cls: "idle", label: "stopped", tip: p.statusText || "" };
  if (p.status === "exited") return { cls: "exited", label: `exited (${p.exitCode})`, tip: p.reason || "" };
  return { cls: "error", label: p.status, tip: p.reason || "" };
}

/** 24h uptime chip class from the pct. */
export function uptimeClass(u) {
  return u.pct >= 90 ? "running" : u.pct >= 50 ? "exited" : "error";
}

/** Topology node status: ring color + label. */
export function nodeStatus(a) {
  const running = a.proc && a.proc.status === "running";
  const dead = a.proc && (a.proc.status === "exited" || a.proc.status === "error");
  const observeOnly = !(a.actions || []).length;
  if (!a.enabled) return { cls: "top-off", ring: "#3A3654", label: "disabled" };
  if (running) return { cls: "top-run", ring: "#A6FF3C", label: "running" };
  if (dead) return { cls: "top-err", ring: "#FF4D6A", label: a.proc.status };
  if (observeOnly) return { cls: "top-obs", ring: agentAccent(a), label: "observe" };
  return { cls: "top-idle", ring: "#8E88BE", label: "idle" };
}

export const ACT_LABEL = { start: "▶ Start", stop: "■ Stop", "stop-term": "■ Stop terminal", restart: "↻ Restart", status: "◇ Status", run: "⚡ Run" };
export const ACT_VARIANT = { start: "run", stop: "stop", "stop-term": "stop", restart: "dim", status: "dim", run: "dim" };
