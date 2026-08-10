const executable = (platform, windows, other) =>
  platform === "win32" ? windows : other;

const RUNTIME_TYPES = new Set(["task", "service", "hybrid"]);
const COMMAND_ACTIONS = Object.freeze({
  start: ["nativeStart", "start"],
  restart: ["nativeRestart", "restart"],
  "gateway-run": ["gatewayRun", "run"],
  stop: ["nativeStop", "stop"],
  logs: ["nativeLogs", "logs"],
  status: ["nativeStatus", "status"],
  version: ["version"],
  "auth-check": ["authCheck"],
  "health-check": ["healthCheck"],
});

const verified = (program, args) =>
  Object.freeze({ verified: true, program, args: Object.freeze([...args]) });

/* Reviewed gateway service CLIs discovered from local --help (Hermes / OpenClaw).
   These are the only built-ins that invent subcommands; everything else stays trigger-only. */
export const BUILT_IN_SERVICE_COMMANDS = Object.freeze({
  hermes: Object.freeze({
    runtimeType: "service",
    commands: Object.freeze({
      gatewayRun: verified("hermes", ["gateway", "run"]),
      nativeStart: verified("hermes", ["gateway", "start"]),
      nativeStop: verified("hermes", ["gateway", "stop"]),
      nativeRestart: verified("hermes", ["gateway", "restart"]),
      nativeStatus: verified("hermes", ["gateway", "status"]),
      healthCheck: verified("hermes", ["status"]),
    }),
  }),
  openclaw: Object.freeze({
    runtimeType: "service",
    commands: Object.freeze({
      gatewayRun: verified("openclaw", ["gateway", "run"]),
      nativeStart: verified("openclaw", ["gateway", "start"]),
      nativeStop: verified("openclaw", ["gateway", "stop"]),
      nativeRestart: verified("openclaw", ["gateway", "restart"]),
      nativeStatus: verified("openclaw", ["gateway", "status"]),
      healthCheck: verified("openclaw", ["gateway", "health"]),
    }),
  }),
});

/* These profiles describe execution shape only. Native service actions come from
   reviewed config OR BUILT_IN_SERVICE_COMMANDS. Task agents may gateway-run their trigger. */
export const BUILT_IN_RUNTIME = Object.freeze({
  hermes: { runtimeType: "service", binaryCandidates: ["hermes"] },
  openclaw: { runtimeType: "service", binaryCandidates: ["openclaw"] },
  antigravity: { runtimeType: "task", binaryCandidates: ["agy"] },
  cline: { runtimeType: "task", binaryCandidates: ["cline"] },
  codex: { runtimeType: "task", binaryCandidates: ["codex"] },
  "claude-code": { runtimeType: "task", binaryCandidates: ["claude"] },
  "qwen-code": { runtimeType: "task", binaryCandidates: ["qwen"] },
  "kimi-code": { runtimeType: "task", binaryCandidates: ["kimi"] },
  "kilo-code": { runtimeType: "task", binaryCandidates: ["kilo"] },
  pi: { runtimeType: "task", binaryCandidates: ["pi"] },
  "github-copilot-cli": { runtimeType: "task", binaryCandidates: ["copilot"] },
  opencode: { runtimeType: "task", binaryCandidates: ["opencode"] },
  aider: { runtimeType: "task", binaryCandidates: ["aider"] },
  goose: { runtimeType: "task", binaryCandidates: ["goose"] },
  openhands: { runtimeType: "task", binaryCandidates: ["openhands"] },
  "mistral-vibe": { runtimeType: "task", binaryCandidates: ["vibe"] },
  "cursor-agent": { runtimeType: "task", binaryCandidates: ["cursor-agent"] },
  crush: { runtimeType: "task", binaryCandidates: ["crush"] },
  "crimson-odyssey": { runtimeType: "task", binaryCandidates: ["crimson"] },
  "grok-build": { runtimeType: "task", binaryCandidates: ["grok"] },
  "command-code": {
    runtimeType: "task",
    binaryCandidates: ["cmdc"],
    windowsSupport: "alpha",
    wslFallback: true,
  },
});

const BARE_PROGRAM = /^[A-Za-z0-9._/-]+(?:\\[A-Za-z0-9._/-]+)*$/;
const SAFE_ARGUMENT = value => typeof value === "string" && value.length <= 4096 && !/[\u0000-\u001f]/.test(value);

function commandSpec(value) {
  if (!value || typeof value !== "object") return null;
  const program = String(value.program || "").trim();
  const args = Array.isArray(value.args) ? value.args : null;
  if (!BARE_PROGRAM.test(program) || !args || !args.every(SAFE_ARGUMENT)) return null;
  return { program, args: [...args] };
}

function gatewayCommands(gateway = {}) {
  const commands = gateway.runtime?.commands || gateway.commands || {};
  return commands && typeof commands === "object" ? commands : {};
}

function verifiedGatewayCommand(gateway, action) {
  const commands = gatewayCommands(gateway);
  for (const key of COMMAND_ACTIONS[action] || []) {
    const value = commands[key];
    if (!value || value.verified !== true) continue;
    const normalized = commandSpec(value);
    if (normalized) return normalized;
  }
  return null;
}

function builtInServiceCommand(agentId, action) {
  const service = BUILT_IN_SERVICE_COMMANDS[agentId];
  if (!service) return null;
  return verifiedGatewayCommand({ runtime: { commands: service.commands } }, action);
}

export function deriveGatewayActions(agent = {}) {
  const id = String(agent?.id || "");
  const gateway = agent?.gateway || {};
  const configured = Array.isArray(gateway.actions) ? gateway.actions : [];
  const actions = new Set(configured.filter(value => typeof value === "string" && value.trim()));
  const trigger = gateway.trigger || BUILT_IN_RUNTIME[id]?.binaryCandidates?.[0];
  if (trigger && BARE_PROGRAM.test(String(trigger))) actions.add("run");
  for (const action of ["start", "stop", "restart", "status", "logs"]) {
    if (verifiedGatewayCommand(gateway, action) || builtInServiceCommand(id, action)) {
      actions.add(action);
    }
  }
  return [...actions];
}

export function resolveRuntimeAdapter({ agent, action, platform = process.platform } = {}) {
  const id = String(agent?.id || "");
  const gateway = agent?.gateway || {};
  const builtIn = BUILT_IN_RUNTIME[id] || {};
  const service = BUILT_IN_SERVICE_COMMANDS[id] || {};
  const runtimeType = RUNTIME_TYPES.has(gateway.runtime?.type)
    ? gateway.runtime.type
    : service.runtimeType || builtIn.runtimeType || "task";
  const binaryCandidates = [...new Set([
    ...(builtIn.binaryCandidates || []),
    ...(gateway.trigger ? [gateway.trigger] : []),
  ].filter(candidate => BARE_PROGRAM.test(String(candidate || ""))))];
  const base = {
    agentId: id,
    runtimeType,
    binaryCandidates,
    windowsSupport: gateway.runtime?.windowsSupport ?? builtIn.windowsSupport ?? true,
    wslFallback: gateway.runtime?.wslFallback ?? builtIn.wslFallback ?? false,
    platform,
  };

  if (action === "gateway-run") {
    const custom = verifiedGatewayCommand(gateway, action) || builtInServiceCommand(id, action);
    if (custom) {
      return {
        ...base,
        available: true,
        command: custom,
        verification: verifiedGatewayCommand(gateway, action) ? "reviewed-config" : "built-in-service",
      };
    }
    const trigger = gateway.trigger || builtIn.binaryCandidates?.[0];
    const command = commandSpec({ program: trigger, args: [] });
    return command
      ? { ...base, available: true, command, verification: "configured-trigger" }
      : { ...base, available: false, command: null, reason: `No safe gateway-run executable configured for ${id || "this agent"}` };
  }

  if (action === "summon") {
    const command = commandSpec({ program: gateway.trigger || builtIn.binaryCandidates?.[0], args: [] });
    return command
      ? { ...base, available: true, command, verification: "configured" }
      : { ...base, available: false, command: null, reason: "No safe summon executable is configured" };
  }

  const command = verifiedGatewayCommand(gateway, action) || builtInServiceCommand(id, action);
  return command
    ? {
        ...base,
        available: true,
        command,
        verification: verifiedGatewayCommand(gateway, action) ? "reviewed-config" : "built-in-service",
      }
    : {
        ...base,
        available: false,
        command: null,
        reason: `Native ${action} command is not verified for ${id || "this agent"}`,
      };
}

export function resolveProbe({ entry, platform = process.platform } = {}) {
  const trigger = entry?.agent?.trigger;
  if (!trigger) return null;
  return platform === "win32"
    ? { program: "where.exe", args: [trigger] }
    : { program: "which", args: [trigger] };
}

export function resolveAdapter({
  entry,
  adapterId,
  action,
  platform = process.platform,
} = {}) {
  if (!entry || !["install", "uninstall"].includes(action)) return null;
  const source = action === "install" ? entry.installers : entry.uninstallers;
  const adapter = (source || entry.installers || []).find(item => item.id === adapterId);
  if (!adapter || (adapter.platforms && !adapter.platforms.includes(platform))) {
    return null;
  }

  const probe = resolveProbe({ entry, platform });
  if (adapter.type === "npm-global") {
    const verb = action === "install" ? "install" : "uninstall";
    const program = executable(platform, "npm.cmd", "npm");
    const args = [verb, "--global", adapter.package];
    return {
      program,
      args,
      display: `${program.replace(/\.cmd$/, "")} ${args.join(" ")}`,
      probe,
    };
  }
  if (adapter.type === "winget" && platform === "win32") {
    const args = action === "install"
      ? [
          "install",
          "--exact",
          "--id",
          adapter.packageId,
          "--accept-package-agreements",
          "--accept-source-agreements",
        ]
      : ["uninstall", "--exact", "--id", adapter.packageId];
    return {
      program: "winget.exe",
      args,
      display: `winget ${args.join(" ")}`,
      probe,
    };
  }
  if (adapter.type === "python-tool" || adapter.type === "uv-tool") {
    const verb = action === "install" ? "install" : "uninstall";
    const program = executable(platform, "uv.exe", "uv");
    const args = ["tool", verb, adapter.package];
    return {
      program,
      args,
      display: `${program.replace(/\.exe$/, "")} ${args.join(" ")}`,
      probe,
    };
  }
  if (adapter.type === "pipx") {
    const verb = action === "install" ? "install" : "uninstall";
    const program = executable(platform, "pipx.exe", "pipx");
    const args = [verb, adapter.package];
    return {
      program,
      args,
      display: `pipx ${args.join(" ")}`,
      probe,
    };
  }
  if (adapter.type === "powershell-script" && platform === "win32") {
    const program = "powershell.exe";
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", adapter.script || ""];
    return {
      program,
      args,
      display: `powershell -ExecutionPolicy Bypass -Command "${adapter.displayCommand || adapter.script}"`,
      probe,
    };
  }
  if (adapter.type === "git-source") {
    const program = executable(platform, "git.exe", "git");
    const args = ["clone", adapter.repositoryUrl, adapter.targetDir || "."];
    return {
      program,
      args,
      display: `git ${args.join(" ")}`,
      probe,
    };
  }
  if (adapter.type === "managed-bundle") {
    return {
      type: "managed-bundle",
      bundleId: adapter.bundleId || entry.id,
      display: `[Internal Bundle] Unpack ${entry.name}`,
      probe,
    };
  }
  if (adapter.type === "official-url" || adapter.type === "wsl-only") {
    return {
      externalUrl: entry.officialUrl || entry.sourceUrl,
      note: adapter.note || entry.availabilityNote || "External setup required",
      probe,
    };
  }
  if (adapter.type === "plugin-copy" || adapter.type === "skill-copy") {
    return {
      type: adapter.type,
      managed: true,
      display: `${action} managed ${adapter.type}`,
      probe,
    };
  }
  return null;
}

export function startResolvedProcess(spec, { spawnImpl, cwd, env, visible = false } = {}) {
  if (!spec?.program || !Array.isArray(spec.args)) {
    throw new Error("resolved process spec is required");
  }
  if (typeof spawnImpl !== "function") {
    throw new Error("spawnImpl is required");
  }
  return spawnImpl(spec.program, spec.args, {
    cwd,
    env,
    shell: false,
    windowsHide: !visible,
  });
}
