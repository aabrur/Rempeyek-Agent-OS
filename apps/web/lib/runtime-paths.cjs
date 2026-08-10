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
  const defaultStateRoot = platform === "win32" && env.LOCALAPPDATA
    ? (p.basename(env.LOCALAPPDATA) === "Rempeyek-Agent-OS" ? env.LOCALAPPDATA : p.join(env.LOCALAPPDATA, "Rempeyek-Agent-OS"))
    : p.join(appDataRoot, "Rempeyek-Agent-OS");
  const legacyPath = p.join(root, "agents.config.json");
  // Existence checks must use host-native separators. Simulated path.win32 strings
  // break existsSync on Linux/macOS CI hosts.
  const legacyPathNative = path.join(root, "agents.config.json");
  const legacyConfig = !env.AGENTS_CONFIG && exists(legacyPathNative);
  const stateRoot = env.AGENT_STATE_DIR || (legacyConfig ? root : defaultStateRoot);
  const managedStateRoot = env.AGENT_STATE_DIR || defaultStateRoot;
  const legacyVault = p.join(root, "Obsidian Vault");
  const legacyVaultNative = path.join(root, "Obsidian Vault");

  return {
    stateRoot,
    legacyConfig,
    // Prefer host-native path when the file was detected on this host so readers can open it.
    configPath: env.AGENTS_CONFIG || (legacyConfig
      ? (platform === process.platform ? legacyPathNative : legacyPath)
      : p.join(stateRoot, "agents.config.json")),
    vaultPath: env.VAULT_PATH || (legacyConfig && exists(legacyVaultNative)
      ? (platform === process.platform ? legacyVaultNative : legacyVault)
      : p.join(stateRoot, "Vault")),
    telemetryDir: legacyConfig ? p.join(root, "telemetry") : p.join(stateRoot, "telemetry"),
    avatarDir: legacyConfig ? p.join(root, "runtime", "avatars") : p.join(stateRoot, "avatars"),
    receiptDir: p.join(managedStateRoot, "receipts"),
    installCacheDir: p.join(managedStateRoot, "install-cache"),
    tombstoneDir: p.join(managedStateRoot, "tombstones"),
    bundleRoot: p.join(root, "marketplace", "bundles"),
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
