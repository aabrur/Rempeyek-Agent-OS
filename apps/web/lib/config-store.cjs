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

    const nextConfig = copy(config);
    nextConfig.removedAgentIds = [
      ...new Set([
        ...(Array.isArray(nextConfig.removedAgentIds)
          ? nextConfig.removedAgentIds
          : []),
        agentId,
      ]),
    ];
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

    commit(nextConfig, id);
    return remember(id, {
      config: nextConfig,
      retained: [...RETAINED_AGENT_DATA],
    });
  }

  function listTombstones() {
    return [];
  }

  return { commit, listTombstones, removeProfile };
}

module.exports = { createConfigStore, RETAINED_AGENT_DATA };
