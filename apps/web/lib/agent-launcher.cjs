const fs = require("fs");
const path = require("path");

const SAFE_TRIGGER = /^[a-z0-9][a-z0-9-]{0,59}$/i;

function writeAgentLauncher({
  stateRoot,
  trigger,
  upstreamTrigger,
  workingDirectory,
  fsImpl = fs,
  pathImpl = path,
} = {}) {
  const command = String(trigger || "").trim();
  const upstream = String(upstreamTrigger || trigger || "").trim();
  const root = String(stateRoot || "").trim();
  if (!root || !SAFE_TRIGGER.test(command) || !SAFE_TRIGGER.test(upstream)) return null;

  const cwd = String(workingDirectory || root).trim() || root;
  const file = pathImpl.join(root, `${command}.cmd`);
  const script = [
    "@echo off",
    "setlocal",
    `cd /d "${cwd}"`,
    `where "${upstream}" >nul 2>nul`,
    "if errorlevel 1 (",
    `  >&2 echo [Rempeyek Agent OS] ${command} is registered but upstream command '${upstream}' is not installed.`,
    "  exit /b 9009",
    ")",
    `"${upstream}" %*`,
    "",
  ].join("\r\n");
  fsImpl.mkdirSync(root, { recursive: true });
  fsImpl.writeFileSync(file, script, "utf8");
  return { path: file, command, ...(upstreamTrigger ? { upstreamTrigger: upstream } : {}) };
}

module.exports = { writeAgentLauncher };
