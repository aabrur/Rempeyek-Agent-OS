const reversibleInstallerTypes = new Set(["npm-global", "winget", "python-tool"]);

const agent = (id, name, icon, role, trigger, home, sourceUrl, installers = [], extra = {}) => ({
  schemaVersion: 1,
  id,
  kind: "agent",
  name,
  publisher: extra.publisher || (sourceUrl ? new URL(sourceUrl).hostname : "unverified"),
  summary: role,
  sourceUrl: sourceUrl || null,
  officialUrl: extra.officialUrl ?? sourceUrl ?? null,
  manualSource: Boolean(extra.manualSource),
  curatedAt: "2026-07-24",
  compatibility: {
    platforms: extra.platforms || ["win32", "darwin", "linux"],
    hosts: [],
  },
  capabilities: extra.capabilities || ["local-agent"],
  agent: {
    icon,
    role,
    trigger,
    home,
    envAllow: extra.envAllow || [],
  },
  installers,
  uninstallers: extra.uninstallers || installers
    .filter(installer => reversibleInstallerTypes.has(installer.type))
    .map(installer => ({ ...installer })),
  featured: false,
  children: [],
  availabilityNote: extra.availabilityNote || "",
});

export const MARKETPLACE_ENTRIES = Object.freeze([
  agent(
    "claude-code",
    "Claude Code",
    "⚫",
    "Coding & technical specialist",
    "claude",
    ".claude",
    "https://github.com/anthropics/claude-code",
    [{ id: "npm", type: "npm-global", package: "@anthropic-ai/claude-code" }],
    { envAllow: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"] },
  ),
  agent(
    "codex",
    "Codex",
    "⬜",
    "Repository-aware software engineering agent",
    "codex",
    ".codex",
    "https://github.com/openai/codex",
    [{ id: "npm", type: "npm-global", package: "@openai/codex" }],
    { envAllow: ["OPENAI_API_KEY"] },
  ),
  agent(
    "kilo-code",
    "Kilo Code",
    "🟣",
    "Development agent for coding and debugging",
    "kilo",
    ".kilocode",
    "https://github.com/Kilo-Org/kilocode",
    [{ id: "npm", type: "npm-global", package: "@kilocode/cli" }],
  ),
  agent(
    "cline",
    "Cline",
    "🟡",
    "Autonomous coding agent",
    "cline",
    ".cline",
    "https://github.com/cline/cline",
    [{ id: "npm", type: "npm-global", package: "cline", platforms: ["linux", "darwin"] }],
    {
      availabilityNote:
        "Cline CLI currently marks Windows support as coming soon; Windows users receive the official page instead of a one-click adapter.",
    },
  ),
  agent(
    "pi",
    "Pi",
    "🌀",
    "Minimal open-source coding agent",
    "pi",
    ".pi/agent",
    "https://github.com/badlogic/pi-mono",
    [{ id: "npm", type: "npm-global", package: "@earendil-works/pi-coding-agent" }],
  ),
  agent(
    "antigravity",
    "Antigravity",
    "🟠",
    "Advanced agentic coding and integration",
    "agy",
    ".gemini",
    "https://antigravity.google",
    [],
    {
      envAllow: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
      platforms: ["win32"],
    },
  ),
  agent(
    "hermes",
    "Hermes",
    "🟢",
    "Crypto, research, and operations agent",
    "hermes",
    ".hermes",
    "https://github.com/aabrur/Rempeyek-Agent-OS",
  ),
  agent(
    "openclaw",
    "OpenClaw",
    "🔵",
    "Strategy and business analysis agent",
    "openclaw",
    ".openclaw",
    "https://github.com/aabrur/Rempeyek-Agent-OS",
  ),
  agent(
    "github-copilot-cli",
    "GitHub Copilot CLI",
    "◉",
    "GitHub terminal coding agent",
    "copilot",
    ".copilot",
    "https://github.com/github/copilot-cli",
    [{ id: "npm", type: "npm-global", package: "@github/copilot@prerelease" }],
  ),
  agent(
    "opencode",
    "OpenCode",
    "⌘",
    "Provider-agnostic terminal coding agent",
    "opencode",
    ".config/opencode",
    "https://github.com/anomalyco/opencode",
    [{ id: "npm", type: "npm-global", package: "opencode-ai" }],
  ),
  agent(
    "aider",
    "Aider",
    "A",
    "AI pair programming in the terminal",
    "aider",
    ".aider",
    "https://github.com/Aider-AI/aider",
    [
      { id: "uv", type: "python-tool", package: "aider-chat" },
      { id: "pipx", type: "pipx", package: "aider-chat" },
    ],
  ),
  agent(
    "goose",
    "Goose",
    "G",
    "Open-source local agent for code and workflows",
    "goose",
    ".config/goose",
    "https://github.com/aaif-goose/goose",
    [
      { id: "winget", type: "winget", packageId: "Block.Goose", platforms: ["win32"] },
      { id: "official-url", type: "official-url" },
    ],
  ),
  agent(
    "openhands",
    "OpenHands",
    "🙌",
    "AI-driven software development agent",
    "openhands",
    ".openhands",
    "https://github.com/OpenHands/OpenHands",
    [{ id: "official-url", type: "official-url", note: "OpenHands requires Docker or desktop runner" }],
  ),
  agent(
    "qwen-code",
    "Qwen Code",
    "Q",
    "Open-source Qwen terminal coding agent",
    "qwen",
    ".qwen",
    "https://github.com/QwenLM/qwen-code",
    [{ id: "npm", type: "npm-global", package: "@qwen-code/qwen-code@latest" }],
  ),
  agent(
    "kimi-code",
    "Kimi Code",
    "K",
    "Moonshot terminal AI agent",
    "kimi",
    ".kimi",
    "https://github.com/MoonshotAI/kimi-cli",
    [
      { id: "uv", type: "python-tool", package: "kimi-cli" },
      { id: "pipx", type: "pipx", package: "kimi-cli" },
    ],
  ),
  agent(
    "mistral-vibe",
    "Mistral Vibe",
    "M",
    "Mistral terminal coding agent",
    "vibe",
    ".vibe",
    "https://github.com/mistralai/mistral-vibe",
    [{ id: "uv", type: "python-tool", package: "mistral-vibe" }],
  ),
  agent(
    "cursor-agent",
    "Cursor Agent",
    "C",
    "Cursor terminal AI agent",
    "cursor-agent",
    ".cursor",
    "https://docs.cursor.com/en/cli/overview",
    [{ id: "official-url", type: "official-url", note: "Install Cursor CLI from Cursor Settings" }],
  ),
  agent(
    "crush",
    "Crush",
    "💘",
    "Charm terminal coding agent",
    "crush",
    ".config/crush",
    "https://github.com/charmbracelet/crush",
    [
      { id: "npm", type: "npm-global", package: "@charmland/crush" },
      {
        id: "winget",
        type: "winget",
        packageId: "charmbracelet.crush",
        platforms: ["win32"],
      },
    ],
  ),
  agent(
    "crimson-odyssey",
    "Crimson Odyssey",
    "🔺",
    "Crimson Rift Studio agent platform",
    "crimson",
    ".crimson",
    "https://github.com/Crimson-Rift-Studio/crimson-odyssey",
    [],
    {
      availabilityNote:
        "One-click install is disabled until the public README and repository agree on the canonical install owner.",
    },
  ),
  agent(
    "grok-build",
    "Grok Build",
    "🚀",
    "Grok terminal build agent",
    "grok",
    ".grok",
    "https://github.com/xai-org/grok-build",
    [{ id: "npm", type: "npm-global", package: "@xai-official/grok" }],
    {
      officialUrl: "https://docs.x.ai/build/overview",
      envAllow: ["XAI_API_KEY"],
      availabilityNote:
        "The reviewed npm installer adds the grok CLI. First launch opens browser authentication unless XAI_API_KEY is configured.",
    },
  ),
  agent(
    "command-code",
    "Command Code",
    "⌨️",
    "Command Code terminal agent",
    "cmdc",
    ".commandcode",
    "https://commandcode.ai/docs/troubleshooting/windows",
    [{ id: "npm", type: "npm-global", package: "command-code@latest" }],
    {
      availabilityNote:
        "Native Windows support is alpha; WSL is recommended. Use cmdc, never cmd, to avoid cmd.exe collisions.",
    },
  ),
  {
    schemaVersion: 1,
    id: "hypertaks-agent",
    kind: "plugin",
    name: "Hypertaks Agent",
    publisher: "aabrur",
    summary: "Founder operating system with contract-bound execution.",
    sourceUrl: "https://github.com/aabrur/hypertaks-agent",
    officialUrl: "https://github.com/aabrur/hypertaks-agent",
    sourceRef: "b45cc6b9c686c30615b971f880c532b1ed48e80b",
    curatedAt: "2026-08-10",
        compatibility: {
          platforms: ["win32", "darwin", "linux"],
          hosts: [
            "claude-code",
            "codex",
            "cursor-agent",
            "kimi-code",
            "openclaw",
            "hermes",
            "opencode",
            "pi",
            "goose",
            "github-copilot-cli",
          ],
        },
        capabilities: ["plugin", "agent-skill", "skill-sync"],
        installers: [{ id: "agents-standard", type: "plugin-copy", target: "agents-standard" }],
        uninstallers: [{ id: "agents-standard", type: "plugin-copy", target: "agents-standard" }],
        featured: true,
        children: ["hypertaks-founder"],
        availabilityNote:
          "Install modes: direct sync to a registered agent, repository download, or copyable config snippet. Skills ship in the installer and can sync per agent.",
      },
  {
    schemaVersion: 1,
    id: "hypertaks-founder",
    kind: "skill",
    name: "Hypertaks Founder",
    publisher: "aabrur",
    summary: "The public Hypertaks founder skill.",
    sourceUrl: "https://github.com/aabrur/hypertaks-agent/tree/main/skills/hypertaks",
    officialUrl: "https://github.com/aabrur/hypertaks-agent/tree/main/skills/hypertaks",
    sourceRef: "b45cc6b9c686c30615b971f880c532b1ed48e80b",
    curatedAt: "2026-07-24",
    compatibility: {
      platforms: ["win32", "darwin", "linux"],
      hosts: ["agents-standard"],
    },
    capabilities: ["agent-skill"],
    installers: [{ id: "agents-standard", type: "skill-copy", target: "agents-standard" }],
    uninstallers: [{ id: "agents-standard", type: "skill-copy", target: "agents-standard" }],
    featured: false,
    children: [],
    availabilityNote: "",
  },
]);

const BY_ID = new Map(MARKETPLACE_ENTRIES.map(entry => [entry.id, entry]));

export function marketplaceEntry(id) {
  return BY_ID.get(String(id || "")) || null;
}

export function validateMarketplace(entries = MARKETPLACE_ENTRIES) {
  const errors = [];
  const ids = new Set();
  for (const entry of entries) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(entry.id || ""))) {
      errors.push(`${entry.id}: invalid id`);
    }
    if (ids.has(entry.id)) errors.push(`${entry.id}: duplicate id`);
    ids.add(entry.id);
    if (!["agent", "plugin", "skill"].includes(entry.kind)) {
      errors.push(`${entry.id}: invalid kind`);
    }
    const manualSource = entry.kind === "agent" && entry.manualSource === true;
    if (!entry.name || entry.schemaVersion !== 1 || (!entry.sourceUrl && !manualSource)) {
      errors.push(`${entry.id}: incomplete metadata`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function publicMarketplaceEntry(entry, state = {}) {
  const adapters = entry.installers.filter(installer =>
    !state.platform || !installer.platforms || installer.platforms.includes(state.platform),
  );
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    icon: entry.agent?.icon || (entry.kind === "plugin" ? "◆" : "◇"),
    role: entry.agent?.role || entry.summary,
    publisher: entry.publisher,
    summary: entry.summary,
    officialUrl: entry.officialUrl,
    featured: entry.featured,
    compatibility: entry.compatibility,
    capabilities: entry.capabilities,
    children: entry.children,
    availabilityNote: entry.availabilityNote,
    adapterIds: adapters.map(installer => installer.id),
    registered: Boolean(state.registered),
    installed: state.installed ?? null,
  };
}

export function agentSeed(entry) {
  return entry?.kind === "agent"
    ? {
        id: entry.id,
        name: entry.name,
        ...entry.agent,
      }
    : null;
}
