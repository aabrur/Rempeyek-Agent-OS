const os = require("os");
const path = require("path");

const home = os.homedir();
const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");

/* Per-agent install roots. Gateway run and summon must share the same cwd so the
   CLI finds the user's own config/profile, not the dashboard state root. */
const builtIns = Object.freeze({
  "claude-code": [path.join(home, ".claude"), "claude"],
  cline: [path.join(home, ".cline"), "cline"],
  codex: [path.join(home, ".codex"), "codex"],
  // Legacy roster slot "copilot" historically launched Codex.
  copilot: [path.join(home, ".codex"), "codex"],
  "github-copilot-cli": [path.join(home, ".copilot"), "copilot"],
  antigravity: [path.join(home, ".gemini"), "agy"],
  "kilo-code": [path.join(home, ".kilocode"), "kilo"],
  openclaw: [path.join(home, ".openclaw"), "openclaw"],
  pi: [path.join(home, ".pi", "agent"), "pi"],
  hermes: [path.join(localAppData, "hermes"), "hermes"],
  "grok-build": [path.join(home, ".grok"), "grok"],
  "command-code": [path.join(home, ".commandcode"), "cmdc"],
  opencode: [path.join(home, ".config", "opencode"), "opencode"],
  aider: [path.join(home, ".aider"), "aider"],
  goose: [path.join(home, ".config", "goose"), "goose"],
  openhands: [path.join(home, ".openhands"), "openhands"],
  "qwen-code": [path.join(home, ".qwen"), "qwen"],
  "kimi-code": [path.join(home, ".kimi"), "kimi"],
  "mistral-vibe": [path.join(home, ".vibe"), "vibe"],
  "cursor-agent": [path.join(home, ".cursor"), "cursor-agent"],
  crush: [path.join(home, ".config", "crush"), "crush"],
  "crimson-odyssey": [path.join(home, ".crimson"), "crimson"],
});

function resolveSummonProfile(agent = {}, options = {}) {
  const canonical = builtIns[agent.id];
  const stateRoot = options.stateRoot
    || process.env.AGENT_STATE_DIR
    || path.join(localAppData, "Rempeyek-Agent-OS");
  // Built-in roster CLIs win over stale gateway.trigger so legacy slots stay correct.
  const command = String(canonical?.[1] || agent.gateway?.trigger || "").trim();
  const installHome = String(canonical?.[0] || agent.gateway?.home || "").trim();
  // Prefer the per-user install/home folder (same as a manual terminal launch).
  // Only fall back to configured workdir / shared OS root when no home exists.
  const cwd = installHome
    || String(agent.gateway?.workdir || agent.gateway?.cwd || "").trim()
    || stateRoot;
  return { cwd, command, home: installHome || null };
}

module.exports = { resolveSummonProfile, builtIns };
