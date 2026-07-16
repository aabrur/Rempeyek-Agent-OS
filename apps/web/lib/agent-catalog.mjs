/* Curated agent catalog — the single source of truth for "agents a user can add + install".
   SECURITY: the install route resolves the shell command from THIS file by id. A command is never
   taken from the request body, so `+ Add Agent → Install` can never execute arbitrary shell. Entries
   without an `install.cmd` (native services) can only be linked to, not auto-installed.

   `home` is stored relative to the user's home dir so the catalog is portable across machines; the
   server expands it. `trigger` is the bare CLI the installed-probe and summon use. */
export const AGENT_CATALOG = [
  {
    id: "claude-code", name: "Claude Code", icon: "⚫", role: "Coding & technical specialist",
    trigger: "claude", home: ".claude", envAllow: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
    install: { cmd: "npm install -g @anthropic-ai/claude-code", url: "https://claude.com/claude-code" },
  },
  {
    id: "codex", name: "Codex", icon: "⬜", role: "Repository-aware software engineering agent",
    trigger: "codex", home: ".codex", envAllow: ["OPENAI_API_KEY"],
    install: { cmd: "npm install -g @openai/codex", url: "https://developers.openai.com/codex/cli" },
  },
  {
    id: "kilo-code", name: "Kilo Code", icon: "🟣", role: "Development agent (coding/debugging)",
    trigger: "kilo", home: ".kilocode",
    install: { cmd: "npm install -g @kilocode/cli", url: "https://kilo.ai" },
  },
  {
    id: "cline", name: "Cline", icon: "🟡", role: "Autonomous coding agent",
    trigger: "cline", home: ".cline",
    install: { cmd: "npm install -g cline", url: "https://cline.bot" },
  },
  {
    id: "pi", name: "Pi", icon: "🌀", role: "Minimal open-source coding agent",
    trigger: "pi", home: ".pi",
    install: { cmd: "npm install -g @mariozechner/pi-coding-agent", url: "https://pi.dev" },
  },
  {
    id: "antigravity", name: "Antigravity", icon: "🟠", role: "Advanced agentic coding & integration",
    trigger: "agy", home: ".gemini", envAllow: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    install: { url: "https://antigravity.google" },   // IDE/CLI install — link only, no npm one-liner
  },
  {
    id: "hermes", name: "Hermes", icon: "🟢", role: "Crypto, research & ops 24/7",
    trigger: "hermes", home: ".hermes", envAllow: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    install: { url: "https://github.com/aabrur/Rempeyek-Agent-OS" },   // native service — link only
  },
  {
    id: "openclaw", name: "OpenClaw", icon: "🔵", role: "Strategy & business analysis",
    trigger: "openclaw", home: ".openclaw",
    install: { url: "https://github.com/aabrur/Rempeyek-Agent-OS" },   // native service — link only
  },
];

const BY_ID = new Map(AGENT_CATALOG.map(e => [e.id, e]));

/* catalogEntry: the vetted entry for an id, or null. */
export function catalogEntry(id) {
  return BY_ID.get(String(id || "")) || null;
}

/* catalogInstallCommand: the ONLY way install execution obtains a command. Returns the vetted
   string for a known id with an npm-style installer, or null (native/unknown → not auto-installable).
   Never accepts a caller-supplied command. */
export function catalogInstallCommand(id) {
  const entry = BY_ID.get(String(id || ""));
  return (entry && entry.install && entry.install.cmd) || null;
}

const HOME_ABS = s => /^([a-zA-Z]:[\\/]|[\\/])/.test(s);
function resolveHome(raw, homedir) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (HOME_ABS(s)) return s;
  const rel = s.replace(/^~[\\/]?/, "");
  return homedir ? `${homedir.replace(/[\\/]$/, "")}/${rel}`.replace(/\//g, homedir.includes("\\") ? "\\" : "/") : rel;
}

/* buildAgentRecord: pure builder for a new agent config entry. This is where the shipped bug lived —
   trigger/home were dropped and no gateway was ever written. Now they persist. install.cmd comes ONLY
   from the catalog entry, never from `body`. Returns { agent } or { error }.
     body     — the request body ({catalogId} or {id,name,icon?,role?,accent?,trigger?,home?})
     cat      — the resolved catalog entry (or null), supplied by the caller
     existingIds / existingNodeNums — for uniqueness + node numbering
     date     — YYYY-MM-DD for the note; homedir — for expanding a relative catalog home */
export function buildAgentRecord({ body = {}, cat = null, existingIds = [], existingNodeNums = [], date = "", homedir = "" } = {}) {
  if (body.catalogId && !cat) return { error: `unknown catalog agent '${body.catalogId}'` };
  const id = String((cat?.id ?? body.id) || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(id)) return { error: "id must be a 2-32 char slug (a-z, 0-9, -)" };
  const name = String((cat?.name ?? body.name) || "").replace(/[\x00-\x1f\x7f]+/g, " ").trim().slice(0, 40);
  if (!name) return { error: "name is required" };
  if (existingIds.includes(id)) return { error: `agent '${id}' already exists` };

  const accent = /^#[0-9a-fA-F]{6}$/.test(String(body.accent || "")) ? body.accent : undefined;
  const nextNode = (existingNodeNums.length ? Math.max(...existingNodeNums) : 0) + 1;
  const trigger = String((cat?.trigger ?? body.trigger) || "").trim().split(/\s+/)[0].slice(0, 60);
  const home = resolveHome(cat?.home ?? body.home, homedir);

  const gateway = { actions: [] };                   // dashboard-added agents are observe-only
  if (home) gateway.home = home;
  if (trigger) gateway.trigger = trigger;
  if (cat?.install) gateway.install = cat.install;   // curated only — never from body
  if (cat?.envAllow) gateway.envAllow = [...cat.envAllow];
  const hasGateway = gateway.home || gateway.trigger || gateway.install;

  const agent = {
    id, name,
    icon: String((cat?.icon ?? body.icon) || "🤖").slice(0, 4),
    role: String((cat?.role ?? body.role) || "Agent").trim().slice(0, 80),
    node: `Node-${nextNode}`,
    lane: name.replace(/[^A-Za-z0-9]/g, ""),
    enabled: true,
    ...(accent ? { accent } : {}),
    note: `Registered via dashboard ${date}.${trigger ? ` Summon with \`${trigger}\`.` : " Observe-only until a gateway trigger is configured."}`,
    ...(hasGateway ? { gateway } : {}),
  };
  return { agent };
}
