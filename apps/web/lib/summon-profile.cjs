const os = require("os");
const path = require("path");

const home = os.homedir();
const builtIns = Object.freeze({
  "claude-code": [path.join(home, ".claude"), "claude"],
  cline: [path.join(home, ".cline"), "cline"],
  codex: [path.join(home, ".codex"), "codex"],
  copilot: [path.join(home, ".codex"), "codex"],
  antigravity: [path.join(home, ".gemini"), "agy"],
  "kilo-code": [path.join(home, ".kilocode"), "kilo"],
  openclaw: [path.join(home, ".openclaw"), "openclaw"],
  pi: [path.join(home, ".pi"), "pi"],
  hermes: [path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "hermes"), "hermes"],
  "grok-build": [path.join(home, ".grok"), "grok"],
  "command-code": [path.join(home, ".commandcode"), "cmdc"],
});

function resolveSummonProfile(agent = {}, options = {}) {
  const canonical = builtIns[agent.id];
  const stateRoot = options.stateRoot
    || process.env.AGENT_STATE_DIR
    || path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Rempeyek-Agent-OS");
  const command = canonical?.[1] || agent.gateway?.trigger || "";
  const cwd = agent.gateway?.workdir || canonical?.[0] || agent.gateway?.home || stateRoot;
  return { cwd, command };
}

module.exports = { resolveSummonProfile };
