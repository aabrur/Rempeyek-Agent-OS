const fs = require("fs");
const path = require("path");

const SAFE_TRIGGER = /^[a-z0-9][a-z0-9-]{0,59}$/i;

function writeAgentLauncher({
  stateRoot,
  trigger,
  workingDirectory,
  fsImpl = fs,
  pathImpl = path,
} = {}) {
  const command = String(trigger || "").trim();
  const root = String(stateRoot || "").trim();
  if (!root || !SAFE_TRIGGER.test(command)) return null;

  const cwd = String(workingDirectory || root).trim() || root;
  const file = pathImpl.join(root, `${command}.cmd`);
  const script = [
    "@echo off",
    "setlocal",
    `cd /d "${cwd}"`,
    `where "${command}" >nul 2>nul`,
    "if errorlevel 1 (",
    `  >&2 echo [Rempeyek Agent OS] ${command} is registered but its upstream CLI is not installed.`,
    "  exit /b 9009",
    ")",
    `"${command}" %*`,
    "",
  ].join("\r\n");
  fsImpl.mkdirSync(root, { recursive: true });
  fsImpl.writeFileSync(file, script, "utf8");
  return { path: file, command };
}

module.exports = { writeAgentLauncher };
