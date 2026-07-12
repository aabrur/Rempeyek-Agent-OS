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
});

function resolveSummonProfile(agent = {}) {
  const canonical = builtIns[agent.id];
  if (canonical) return { cwd: canonical[0], command: canonical[1] };
  return {
    cwd: agent.gateway?.home || home,
    command: agent.gateway?.trigger || "",
  };
}

module.exports = { resolveSummonProfile };
