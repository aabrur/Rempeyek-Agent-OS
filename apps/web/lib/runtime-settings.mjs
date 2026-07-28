import fs from "node:fs";
import path from "node:path";

const LOG_NAME = /^[a-z0-9][a-z0-9-]*\.log$/i;

function settingsFrom(config = {}, patch = {}) {
  const settings = {
    logRetentionDays: Number(
      patch.logRetentionDays ??
      config.settings?.logRetentionDays ??
      30
    ),
    anonymousTelemetry: Boolean(
      patch.anonymousTelemetry ??
      config.settings?.anonymousTelemetry ??
      false
    ),
  };
  if (
    !Number.isInteger(settings.logRetentionDays) ||
    settings.logRetentionDays < 1 ||
    settings.logRetentionDays > 365
  ) {
    throw new Error("logRetentionDays must be between 1 and 365");
  }
  return settings;
}

export function applyRuntimeSettings(config = {}, patch = {}) {
  return {
    ...config,
    settings: settingsFrom(config, patch),
  };
}

export function runtimeSettingsSnapshot({
  stateRoot = "",
  vaultPath = "",
  logDir = "",
  config = {},
  env = {},
  backupExists = false,
  backupPath = "",
  logFiles = [],
  approvalAuditCount = 0,
} = {}) {
  const variableNames = new Set();
  for (const agent of config.agents || []) {
    for (const name of agent.gateway?.envAllow || []) {
      if (/^[A-Z][A-Z0-9_]{0,127}$/.test(String(name))) {
        variableNames.add(String(name));
      }
    }
  }
  return {
    schemaVersion: 1,
    agency: config.agency || "REMPEYEK AGENT OS",
    paths: { stateRoot, vaultPath, logDir },
    settings: settingsFrom(config),
    providerVariables: [...variableNames]
      .sort()
      .map(name => ({ name, detected: Boolean(env[name]) })),
    backups: backupExists
      ? [{
          name: path.basename(backupPath || "agents.config.json.bak"),
          path: backupPath,
        }]
      : [],
    logFiles: logFiles
      .filter(name => LOG_NAME.test(String(name)))
      .map(String)
      .sort(),
    approvalAuditCount: Number(approvalAuditCount) || 0,
  };
}

export function clearOwnedLogs({
  logDir,
  confirmedNames,
  fsImpl = fs,
} = {}) {
  if (!logDir || !Array.isArray(confirmedNames)) {
    throw new Error("logDir and confirmedNames are required");
  }
  const root = path.resolve(logDir);
  const names = [...new Set(confirmedNames.map(String))].sort();
  for (const name of names) {
    if (!LOG_NAME.test(name)) throw new Error(`invalid log name '${name}'`);
    const absolute = path.resolve(root, name);
    const relative = path.relative(root, absolute);
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative) ||
      relative.includes(path.sep)
    ) {
      throw new Error(`invalid log name '${name}'`);
    }
  }
  const removed = [];
  const missing = [];
  for (const name of names) {
    const absolute = path.join(root, name);
    if (!fsImpl.existsSync(absolute)) {
      missing.push(name);
      continue;
    }
    if (fsImpl.statSync(absolute).isDirectory()) {
      throw new Error(`log target '${name}' is not a file`);
    }
    fsImpl.unlinkSync(absolute);
    removed.push(name);
  }
  return { removed, missing };
}

function redactHome(value, home) {
  if (typeof value !== "string") return value;
  if (!home) return value;
  const escaped = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(escaped, "gi"), "%USERPROFILE%");
}

export function diagnosticsSnapshot({
  home = "",
  version = {},
  platform = "",
  paths = {},
  lifecycle = [],
  providerVariables = [],
  recentErrors = [],
} = {}) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    version: {
      version: String(version.version || ""),
      rev: version.rev ? String(version.rev) : null,
      node: version.node ? String(version.node) : null,
    },
    platform: String(platform || ""),
    paths: Object.fromEntries(
      Object.entries(paths).map(([key, value]) => [
        key,
        redactHome(String(value || ""), home),
      ]),
    ),
    lifecycle: lifecycle.map(item => ({
      id: String(item.id || ""),
      profile: String(item.profile || "unknown"),
      software: String(item.software || "unknown"),
      active: Boolean(item.active),
    })),
    providerVariables: providerVariables.map(item => ({
      name: String(item.name || ""),
      detected: Boolean(item.detected),
    })),
    recentErrors: recentErrors.slice(-50).map(item => ({
      level: String(item.level || item.status || "info"),
      type: String(item.type || "event"),
      message: redactHome(String(item.message || item.msg || ""), home).slice(0, 500),
      at: item.at || item.ts || null,
      agentId: item.agentId || item.id || null,
    })),
  };
}
