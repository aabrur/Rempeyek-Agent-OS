const fs = require("fs");
const path = require("path");

function resolveRuntimePaths({ env = process.env, root, home, platform = process.platform, exists = fs.existsSync } = {}) {
  if (!root || !home) throw new Error("root and home are required");
  const p = platform === "win32" ? path.win32 : path.posix;
  const appDataRoot = platform === "win32"
    ? (env.LOCALAPPDATA || p.join(home, "AppData", "Local"))
    : platform === "darwin"
      ? p.join(home, "Library", "Application Support")
      : (env.XDG_DATA_HOME || p.join(home, ".local", "share"));
  const defaultStateRoot = p.join(appDataRoot, "Rempeyek-Agent-OS");
  const legacyPath = p.join(root, "agents.config.json");
  const legacyConfig = !env.AGENTS_CONFIG && exists(legacyPath);
  const stateRoot = env.AGENT_STATE_DIR || (legacyConfig ? root : defaultStateRoot);
  const legacyVault = p.join(root, "Obsidian Vault");

  return {
    stateRoot,
    legacyConfig,
    configPath: env.AGENTS_CONFIG || (legacyConfig ? legacyPath : p.join(stateRoot, "agents.config.json")),
    vaultPath: env.VAULT_PATH || (legacyConfig && exists(legacyVault) ? legacyVault : p.join(stateRoot, "Vault")),
    telemetryDir: legacyConfig ? p.join(root, "telemetry") : p.join(stateRoot, "telemetry"),
    avatarDir: legacyConfig ? p.join(root, "runtime", "avatars") : p.join(stateRoot, "avatars"),
  };
}

function ensureEmptyConfig(configPath, { home, agency = "REMPEYEK AGENT OS" } = {}) {
  if (!configPath) throw new Error("configPath is required");
  if (!fs.existsSync(configPath)) {
    const config = { agency, workdir: home, agents: [] };
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    return config;
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!Array.isArray(config.agents)) throw new Error("agents.config.json must contain an agents array");
  return config;
}

module.exports = { ensureEmptyConfig, resolveRuntimePaths };
