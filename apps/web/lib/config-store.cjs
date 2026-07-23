const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RETAINED_AGENT_DATA = Object.freeze([
  "vault",
  "telemetry",
  "activity",
  "workflows",
  "logs",
  "credentials",
  "software",
  "user-files",
]);

const OPERATION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const TOMBSTONE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateConfig(config) {
  if (!config || !Array.isArray(config.agents)) {
    throw new Error("config must contain an agents array");
  }
}

function validateOperationId(operationId) {
  if (!OPERATION_ID.test(String(operationId || ""))) {
    throw new Error("operationId must be a safe 1-128 character identifier");
  }
  return String(operationId);
}

function operationIdFrom(value) {
  return validateOperationId(
    typeof value === "string" ? value : value?.operationId,
  );
}

function safeGateway(gateway) {
  if (!gateway || typeof gateway !== "object") return undefined;
  const safe = {};
  for (const field of ["home", "trigger", "probe", "marketplaceId"]) {
    if (typeof gateway[field] === "string") safe[field] = gateway[field];
  }
  if (Array.isArray(gateway.actions)) {
    safe.actions = gateway.actions
      .filter(action => typeof action === "string")
      .map(action => action.slice(0, 128));
  }
  if (Array.isArray(gateway.envAllow)) {
    safe.envAllow = gateway.envAllow
      .filter(name => /^[A-Z][A-Z0-9_]{0,127}$/.test(String(name)))
      .map(String);
  }
  return Object.keys(safe).length ? safe : undefined;
}

function safeAgent(agent) {
  const safe = {};
  for (const field of [
    "id",
    "name",
    "icon",
    "role",
    "node",
    "lane",
    "accent",
    "note",
    "kind",
    "parentId",
    "detachedFrom",
  ]) {
    if (typeof agent[field] === "string" || agent[field] === null) {
      safe[field] = agent[field];
    }
  }
  safe.enabled = Boolean(agent.enabled);
  const gateway = safeGateway(agent.gateway);
  if (gateway) safe.gateway = gateway;
  return safe;
}

function writeJsonAtomic(filePath, value, {
  fsImpl,
  operationId,
  backup = false,
  exclusive = false,
}) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${operationId}.tmp`,
  );
  if (fsImpl.existsSync(tempPath)) fsImpl.unlinkSync(tempPath);
  let descriptor;
  try {
    descriptor = fsImpl.openSync(tempPath, exclusive ? "wx" : "w");
    fsImpl.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsImpl.fsyncSync(descriptor);
    fsImpl.closeSync(descriptor);
    descriptor = undefined;
    if (backup && fsImpl.existsSync(filePath)) {
      fsImpl.copyFileSync(filePath, `${filePath}.bak`);
    }
    fsImpl.renameSync(tempPath, filePath);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fsImpl.closeSync(descriptor);
      } catch {
        // Preserve the original write error.
      }
    }
    if (fsImpl.existsSync(tempPath)) {
      try {
        fsImpl.unlinkSync(tempPath);
      } catch {
        // Preserve the original write error.
      }
    }
    throw error;
  }
}

function createConfigStore({
  configPath,
  tombstoneDir,
  fsImpl = fs,
  now = () => new Date(),
  randomId = () => crypto.randomUUID(),
  onCommit = () => {},
} = {}) {
  if (!configPath) throw new Error("configPath is required");
  if (!tombstoneDir) throw new Error("tombstoneDir is required");
  const completed = new Map();

  function replay(operationId) {
    const existing = completed.get(operationId);
    return existing ? { ...copy(existing), replayed: true } : null;
  }

  function remember(operationId, result) {
    const stored = { ...copy(result), replayed: false };
    completed.set(operationId, stored);
    return copy(stored);
  }

  function commit(nextConfig, operation = {}) {
    const id = operationIdFrom(operation);
    validateConfig(nextConfig);
    const prior = replay(id);
    if (prior) return prior;
    writeJsonAtomic(configPath, nextConfig, {
      fsImpl,
      operationId: id,
      backup: true,
    });
    const result = remember(id, { config: nextConfig });
    onCommit({ operationId: id, config: copy(nextConfig) });
    return result;
  }

  function tombstonePath(tombstoneId) {
    if (!TOMBSTONE_ID.test(String(tombstoneId || ""))) {
      throw new Error("tombstone id is invalid");
    }
    return path.join(tombstoneDir, `${tombstoneId}.json`);
  }

  function removeProfile(
    config,
    agentId,
    { detachChildren = false } = {},
    operation = {},
  ) {
    if (typeof arguments[2] === "object" && arguments[2]?.operationId && arguments.length < 4) {
      operation = arguments[2];
    }
    const id = operationIdFrom(operation);
    const prior = replay(id);
    if (prior) return prior;
    validateConfig(config);
    const agent = config.agents.find(candidate => candidate.id === agentId);
    if (!agent) throw new Error(`agent '${agentId}' not found`);
    const children = config.agents.filter(candidate => candidate.parentId === agentId);
    if (children.length && !detachChildren) {
      throw new Error(
        `agent '${agentId}' has child agents; detach children before removal`,
      );
    }

    const tombstoneId = String(randomId());
    const filePath = tombstonePath(tombstoneId);
    if (fsImpl.existsSync(filePath)) {
      throw new Error(`tombstone '${tombstoneId}' already exists`);
    }
    const timestamp = now();
    const tombstone = {
      schemaVersion: 1,
      id: tombstoneId,
      removedAt: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp),
      agent: safeAgent(agent),
      retained: [...RETAINED_AGENT_DATA],
    };
    const nextConfig = copy(config);
    nextConfig.agents = nextConfig.agents
      .filter(candidate => candidate.id !== agentId)
      .map(candidate => (
        candidate.parentId === agentId
          ? {
              ...candidate,
              enabled: false,
              parentId: null,
              detachedFrom: agentId,
            }
          : candidate
      ));
    if (nextConfig.activeAgentId === agentId) nextConfig.activeAgentId = null;

    writeJsonAtomic(filePath, tombstone, {
      fsImpl,
      operationId: id,
      exclusive: true,
    });
    try {
      commit(nextConfig, id);
    } catch (error) {
      if (fsImpl.existsSync(filePath)) fsImpl.unlinkSync(filePath);
      throw error;
    }
    return remember(id, {
      config: nextConfig,
      tombstone,
      retained: [...RETAINED_AGENT_DATA],
    });
  }

  function restoreProfile(config, tombstoneId, operation = {}) {
    const id = operationIdFrom(operation);
    const prior = replay(id);
    if (prior) return prior;
    validateConfig(config);
    const filePath = tombstonePath(tombstoneId);
    if (!fsImpl.existsSync(filePath)) {
      throw new Error(`tombstone '${tombstoneId}' not found`);
    }
    const tombstone = JSON.parse(fsImpl.readFileSync(filePath, "utf8"));
    const agent = safeAgent(tombstone.agent || {});
    if (!agent.id) throw new Error(`tombstone '${tombstoneId}' has no agent id`);
    if (config.agents.some(candidate => candidate.id === agent.id)) {
      throw new Error(`agent '${agent.id}' is already registered`);
    }
    const nextConfig = copy(config);
    nextConfig.agents.push(agent);
    commit(nextConfig, id);
    fsImpl.unlinkSync(filePath);
    return remember(id, { config: nextConfig, restoredAgentId: agent.id });
  }

  function listTombstones() {
    if (!fsImpl.existsSync(tombstoneDir)) return [];
    return fsImpl.readdirSync(tombstoneDir)
      .filter(name => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.json$/.test(name))
      .map(name => JSON.parse(fsImpl.readFileSync(path.join(tombstoneDir, name), "utf8")))
      .sort((a, b) => String(b.removedAt).localeCompare(String(a.removedAt)));
  }

  return { commit, listTombstones, removeProfile, restoreProfile };
}

module.exports = { createConfigStore, RETAINED_AGENT_DATA };
