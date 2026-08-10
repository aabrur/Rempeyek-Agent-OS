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

  // Probe both platform-shaped and host-native path strings. Unit tests inject
  // path.win32 candidates on Linux CI; real hosts need native separators.
  const pathPresent = platformPath => {
    if (exists(platformPath)) return true;
    const nativePath = path.join(root, ...platformPath
      .slice(String(root).length)
      .split(/[\\/]+/)
      .filter(Boolean));
    return nativePath !== platformPath && exists(nativePath);
  };

  const legacyPath = p.join(root, "agents.config.json");
  const legacyConfig = !env.AGENTS_CONFIG && pathPresent(legacyPath);
  const stateRoot = env.AGENT_STATE_DIR || (legacyConfig ? root : defaultStateRoot);
  const managedStateRoot = env.AGENT_STATE_DIR || defaultStateRoot;
  const legacyVault = p.join(root, "Obsidian Vault");
  const hasLegacyVault = pathPresent(legacyVault);

  return {
    stateRoot,
    legacyConfig,
    configPath: env.AGENTS_CONFIG || (legacyConfig ? legacyPath : p.join(stateRoot, "agents.config.json")),
    vaultPath: env.VAULT_PATH || (legacyConfig && hasLegacyVault ? legacyVault : p.join(stateRoot, "Vault")),
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
  const raw = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");
  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    // Repair UTF-8 BOM / corrupted first-run configs so public installers boot.
    const repaired = { agency, workdir: home, agents: [] };
    try { fs.copyFileSync(configPath, configPath + ".bak"); } catch {}
    fs.writeFileSync(configPath, JSON.stringify(repaired, null, 2) + "\n", "utf8");
    return repaired;
  }
  if (!Array.isArray(config.agents)) throw new Error("agents.config.json must contain an agents array");
  // Rewrite without BOM if the on-disk file started with one.
  if (/^\uFEFF/.test(fs.readFileSync(configPath, "utf8"))) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  }
  return config;
}

module.exports = { ensureEmptyConfig, resolveRuntimePaths };
