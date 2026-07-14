/* Pure, testable telemetry + relationship helpers for the agent-detail screen and the
   Agent Map. No fs, no process globals — server.js supplies the raw text/events and these
   functions shape them. Extracted from server.js so Stage 1/2 logic is unit-testable
   (the server module itself never binds under `node --test`). */

const HEARTBEAT_NAME_RE = /heartbeat/i;

/* parseTelemetry: JSONL text → event objects (skips blank/broken lines, keeps insertion order). */
export function parseTelemetry(text) {
  const out = [];
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o && o.type) out.push(o); } catch { /* skip malformed */ }
  }
  return out;
}

/* isHeartbeat: the hourly daily-bridge keepalive. It must never *evict* real evidence from
   the window, and it must never render as a session/subagent row. Recognised by explicit
   type "heartbeat" or the legacy "task_progress" name "Heartbeat …" the bridge used to write. */
export function isHeartbeat(e) {
  if (!e) return false;
  if (e.type === "heartbeat") return true;
  return e.type === "task_progress" && HEARTBEAT_NAME_RE.test(e.name || "");
}

/* selectTelemetryWindow: newest-first window that guarantees real signal survives a heartbeat
   flood. Keeps up to `limit` events, but reserves the window for non-heartbeat events first,
   then backfills the remaining room with the most recent heartbeats. This is the fix for
   Hermes' 100+ heartbeats hiding its real subagent/task events behind a plain slice(-30). */
export function selectTelemetryWindow(events, { limit = 30 } = {}) {
  const list = Array.isArray(events) ? events : [];
  const signal = list.filter(e => !isHeartbeat(e));
  const heartbeat = list.filter(isHeartbeat);
  const keptSignal = signal.slice(-limit);
  const room = Math.max(0, limit - keptSignal.length);
  const keptHeartbeat = room ? heartbeat.slice(-room) : [];
  const kept = new Set([...keptSignal, ...keptHeartbeat]);
  return list.filter(e => kept.has(e)).reverse();   // newest-first
}

/* telemetryActivity: uniform sessions + subagents for non-Claude agents, derived only from an
   agent's own telemetry (never fabricated). Same shape claudeActivity() returns from transcripts
   so the UI renders identically. Handles subagent_*, task_*, and info (a registration marker);
   heartbeats are dropped so they never masquerade as work. `events` is newest-first. */
export function telemetryActivity(events) {
  const subagents = [], subSeen = new Set();
  const sessions = [], sessSeen = new Set();
  for (const e of (events || [])) {
    if (isHeartbeat(e)) continue;
    if (e.type === "subagent_start" || e.type === "subagent_done") {
      const key = e.name || e.detail || "";
      if (subSeen.has(key)) continue; subSeen.add(key);
      subagents.push({
        type: "subagent", desc: e.name || "(subagent)", detail: e.detail || "",
        status: e.type === "subagent_done" ? "done" : "running", ts: e.ts || null,
      });
    } else if (e.type === "task_start" || e.type === "task_progress" || e.type === "task_done") {
      const key = e.name || "";
      if (sessSeen.has(key)) continue; sessSeen.add(key);   // latest status per task (newest-first)
      const ageMin = e.ts ? (Date.now() - Date.parse(e.ts)) / 60000 : 1e9;
      sessions.push({
        id: (e.name || "task").slice(0, 8), project: e.detail || "", lastActivity: e.ts || null,
        status: e.type === "task_done" ? "idle" : (ageMin < 30 ? "working" : "waiting"),
        lastPrompt: e.name || null, lastTool: null,
        toolCount: typeof e.progress === "number" ? e.progress : 0,
      });
    } else if (e.type === "info") {
      const key = "info:" + (e.name || "");
      if (sessSeen.has(key)) continue; sessSeen.add(key);
      sessions.push({
        id: (e.name || "info").slice(0, 8), project: e.detail || "", lastActivity: e.ts || null,
        status: "idle", lastPrompt: e.name || null, lastTool: null, toolCount: 0,
      });
    }
  }
  return { sessions: sessions.slice(0, 8), subagents: subagents.slice(0, 20) };
}

/* agentNameIndex: normalized display-name / id / lane → canonical agent id. Task lines address
   agents by human name ("Kilo Code"), the registry keys them by id ("kilo-code"); this bridges
   the two without guessing. Agents not in the registry (e.g. a retired "Copilot CLI") resolve to
   null and are dropped — that is the honest outcome, not an error. */
function agentNameIndex(agents) {
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const index = new Map();
  for (const a of (agents || [])) {
    if (!a?.id) continue;
    index.set(norm(a.id), a.id);
    if (a.name) index.set(norm(a.name), a.id);
    if (a.lane) index.set(norm(a.lane), a.id);
  }
  return { resolve: raw => index.get(norm(raw)) || null };
}

const TASK_LINE_RE = /^\s*[-*] \[[ xX]\]\s+(.*)/;
const WORKSPACE_RE = /Projects\/([a-z0-9][a-z0-9-]*)\//i;
const RESUME_RE = /Resume project:\s*([^—·\n]+?)\s*(?:[—·]|$)/i;

/* coAssignments: two agents assigned to the same project/workspace are a *verified* working
   relationship — provenance is the exact vault task line. This is the one honest source of
   agent↔agent edges the system has today (no agent has yet reported a directed task/subagent/
   comm to another agent). Symmetric: emitted as sorted unordered pairs, deduped per project.
   `taskFiles` = [{ rel, text }] from the vault Tasks/ walk. */
export function coAssignments(taskFiles, agents) {
  const { resolve } = agentNameIndex(agents);
  const groups = new Map();   // projectKey -> { members: Map(agentId -> rel), label }
  for (const file of (taskFiles || [])) {
    for (const line of String(file.text || "").split(/\r?\n/)) {
      const m = line.match(TASK_LINE_RE);
      if (!m) continue;
      const body = m[1];
      let key = null, label = null;
      const ws = body.match(WORKSPACE_RE);
      const rp = body.match(RESUME_RE);
      if (ws) { key = ws[1].toLowerCase(); label = rp ? rp[1].trim() : ws[1]; }
      else if (rp) { key = "name:" + rp[1].toLowerCase().replace(/[^a-z0-9]/g, ""); label = rp[1].trim(); }
      if (!key) continue;   // only shared, identifiable projects can co-assign
      const seg = body.split(/\s+—\s+/);   // "title — AGENT — date …"
      if (seg.length < 2) continue;
      const assignees = seg[1].split(/[\/,&]| dan | and /i).map(resolve).filter(Boolean);
      if (!assignees.length) continue;
      if (!groups.has(key)) groups.set(key, { members: new Map(), label });
      const g = groups.get(key);
      for (const aid of assignees) if (!g.members.has(aid)) g.members.set(aid, file.rel);
    }
  }
  const out = [];
  for (const [key, { members, label }] of groups) {
    const ids = [...members.keys()].sort();
    if (ids.length < 2) continue;
    const project = key.replace(/^name:/, "");
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      out.push({ a: ids[i], b: ids[j], project, label: label || project, source: members.get(ids[i]) });
    }
  }
  return out;
}
