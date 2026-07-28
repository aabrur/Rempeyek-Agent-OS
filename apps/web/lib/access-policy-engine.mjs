import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export function resolveCanonicalPath(inputPath) {
  if (!inputPath) return '';
  const resolved = path.resolve(inputPath);
  return path.normalize(resolved);
}

export function getDefaultSystemPaths(env = process.env) {
  const home = env.USERPROFILE || os.homedir();
  const localAppData = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const runtimeRoot = env.REMPEYEK_RUNTIME_ROOT || env.AGENT_STATE_DIR || path.join(localAppData, 'Rempeyek-Agent-OS');

  return {
    home,
    localAppData,
    runtimeRoot,
    sharedVault: env.REMPEYEK_VAULT_PATH || path.join(runtimeRoot, 'Vault'),
    centralSkillsWarehouse: env.REMPEYEK_SKILLS_PATH || path.join(home, '.skills'),
    agentsRuntimeState: path.join(runtimeRoot, 'Agents'),
    sharedGraphifyData: path.join(runtimeRoot, 'Vault', '.graphify'),
    systemConfig: path.join(runtimeRoot, 'Config'),
    logsDir: path.join(runtimeRoot, 'Logs'),
    cacheDir: path.join(runtimeRoot, 'Cache'),
    backupsDir: path.join(runtimeRoot, 'Backups'),
    quarantineDir: path.join(runtimeRoot, 'Quarantine'),
    tempDir: path.join(runtimeRoot, 'Temp'),
    updatesDir: path.join(runtimeRoot, 'Updates'),
    packagesDir: path.join(runtimeRoot, 'Packages')
  };
}

export const DENIED_SENSITIVE_PATTERNS = [
  // SSH and GPG
  /[\\/]\.ssh([\\/]|$)/i,
  /[\\/]\.gnupg([\\/]|$)/i,
  // Browser profiles
  /[\\/]AppData[\\/]Local[\\/]Google[\\/]Chrome[\\/]User Data/i,
  /[\\/]AppData[\\/]Local[\\/]Microsoft[\\/]Edge[\\/]User Data/i,
  /[\\/]AppData[\\/]Local[\\/]BraveSoftware[\\/]Brave-Browser[\\/]User Data/i,
  /[\\/]AppData[\\/]Roaming[\\/]Mozilla[\\/]Firefox[\\/]Profiles/i,
  /[\\/]AppData[\\/]Roaming[\\/]Microsoft[\\/]Credentials/i,
  // Key files
  /\.pem$/i,
  /\.key$/i,
  /\.env(\..+)?$/i,
  /id_rsa/i,
  /id_ed25519/i,
  // Wallets and crypto
  /wallet\.dat/i,
  /[\\/]\.ethereum([\\/]|$)/i,
  /[\\/]\.bitcoin([\\/]|$)/i,
  /[\\/]\.solana([\\/]|$)/i,
  /seed\.txt$/i,
  /mnemonic/i,
  // Password managers
  /[\\/]\.password-store([\\/]|$)/i,
  /\.kdbx$/i,
  /\.1pif$/i,
  // Credentials
  /credentials\.json/i,
  /secrets?\.json/i,
  /[\\/]\.aws[\\/]credentials/i,
  /[\\/]\.azure[\\/]/i,
  /[\\/]\.gcloud[\\/]/i,
  // OS credential stores
  /[\\/]AppData[\\/]Local[\\/]Microsoft[\\/]Vault/i
];

export function resolveRealPath(inputPath) {
  if (!inputPath) return '';
  try {
    const stat = fs.lstatSync(inputPath);
    if (stat.isSymbolicLink()) {
      return fs.realpathSync(inputPath);
    }
    return path.resolve(inputPath);
  } catch {
    return path.resolve(inputPath);
  }
}

export function isSymlinkSafe(targetPath, allowedRoots = []) {
  if (!targetPath) return { safe: false, reason: 'Empty path' };
  try {
    const stat = fs.lstatSync(targetPath);
    if (!stat.isSymbolicLink()) return { safe: true };

    const realTarget = fs.realpathSync(targetPath);
    const canonical = resolveCanonicalPath(realTarget);

    // Check if symlink target escapes all allowed roots
    if (allowedRoots.length > 0) {
      const inAllowed = allowedRoots.some(root => {
        const canonicalRoot = resolveCanonicalPath(root);
        return canonical === canonicalRoot || canonical.startsWith(canonicalRoot + path.sep);
      });
      if (!inAllowed) {
        return { safe: false, reason: `Symlink target escapes allowed roots: ${realTarget}` };
      }
    }

    // Check if symlink target hits a sensitive path
    for (const pattern of DENIED_SENSITIVE_PATTERNS) {
      if (pattern.test(canonical)) {
        return { safe: false, reason: `Symlink target matches sensitive pattern: ${pattern}` };
      }
    }

    return { safe: true, realPath: realTarget };
  } catch (err) {
    return { safe: false, reason: `Cannot resolve symlink: ${err.message}` };
  }
}

export function isPathAllowed(targetPath, accessPolicy = {}) {
  const canonical = resolveCanonicalPath(targetPath);

  // Check symlink safety
  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink()) {
      const realPath = fs.realpathSync(targetPath);
      const realCanonical = resolveCanonicalPath(realPath);
      for (const pattern of DENIED_SENSITIVE_PATTERNS) {
        if (pattern.test(realCanonical)) {
          return { allowed: false, reason: `Symlink resolves to denied path: ${realPath}` };
        }
      }
    }
  } catch {
    // Path may not exist yet, continue with canonical check
  }

  // Check against denied sensitive patterns
  for (const pattern of DENIED_SENSITIVE_PATTERNS) {
    if (pattern.test(canonical)) {
      return { allowed: false, reason: `Matches denied sensitive pattern: ${pattern}` };
    }
  }

  if (accessPolicy.denied_roots && Array.isArray(accessPolicy.denied_roots)) {
    for (const deniedRoot of accessPolicy.denied_roots) {
      const canonicalDenied = resolveCanonicalPath(deniedRoot);
      if (canonical === canonicalDenied || canonical.startsWith(canonicalDenied + path.sep)) {
        return { allowed: false, reason: `Inside explicitly denied root: ${deniedRoot}` };
      }
    }
  }

  if (Array.isArray(accessPolicy.allowed_roots) && accessPolicy.allowed_roots.length > 0) {
    let matchesAllowed = false;
    for (const allowedRoot of accessPolicy.allowed_roots) {
      const canonicalAllowed = resolveCanonicalPath(allowedRoot);
      if (canonical === canonicalAllowed || canonical.startsWith(canonicalAllowed + path.sep)) {
        matchesAllowed = true;
        break;
      }
    }
    if (!matchesAllowed) {
      return { allowed: false, reason: `Not in explicitly allowed roots` };
    }
  }

  return { allowed: true };
}

export function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/(sk-[a-zA-Z0-9]{32,})/g, '[REDACTED_API_KEY]')
    .replace(/(ghp_[a-zA-Z0-9]{36})/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/(xox[baprs]-[a-zA-Z0-9-]+)/g, '[REDACTED_SLACK_TOKEN]')
    .replace(/(AIzaSy[a-zA-Z0-9_-]{33})/g, '[REDACTED_GOOGLE_KEY]')
    .replace(/("?(?:password|secret|api_key|token)"?\s*:\s*)"[^"]+"/gi, '$1"[REDACTED]"');
}
