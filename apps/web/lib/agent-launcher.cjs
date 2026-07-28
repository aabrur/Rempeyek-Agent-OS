const fs = require("fs");
const path = require("path");

const SAFE_TRIGGER = /^[a-z0-9][a-z0-9-]{0,59}$/i;

function launcherSpec({
  stateRoot,
  trigger,
  upstreamTrigger,
  workingDirectory,
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
  return {
    file,
    script,
    result: {
      path: file,
      command,
      ...(upstreamTrigger ? { upstreamTrigger: upstream } : {}),
    },
  };
}

function writeAgentLauncher(options = {}) {
  const { fsImpl = fs } = options;
  const spec = launcherSpec(options);
  if (!spec) return null;
  const root = String(options.stateRoot || "").trim();
  fsImpl.mkdirSync(root, { recursive: true });
  fsImpl.writeFileSync(spec.file, spec.script, "utf8");
  return spec.result;
}

function removeOwnedAgentLauncher(options = {}) {
  const { fsImpl = fs } = options;
  const spec = launcherSpec(options);
  if (!spec || !fsImpl.existsSync(spec.file)) return false;
  let current;
  try {
    current = fsImpl.readFileSync(spec.file, "utf8");
  } catch {
    return false;
  }
  if (current !== spec.script) return false;
  fsImpl.unlinkSync(spec.file);
  return true;
}

module.exports = { removeOwnedAgentLauncher, writeAgentLauncher };
