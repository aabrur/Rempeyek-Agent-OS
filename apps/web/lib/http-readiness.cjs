"use strict";

const MODULE_STATES = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  FAILED: "failed",
});

const REQUIRED_HTTP_MODULE_IDS = Object.freeze([
  "agent-detail",
  "agent-catalog",
  "marketplace-manifest",
  "process-adapters",
  "process-manager",
  "agent-lifecycle",
  "managed-bundle",
  "runtime-settings",
  "subagent-record",
  "release-check",
  "source-update",
  "switchboard",
  "work-lifecycle",
  "publishing-domain",
  "publishing-gateway",
  "publishing-scheduler",
]);

const OPTIONAL_HTTP_MODULE_IDS = Object.freeze([
  "bootstrap",
  "unified-memory-graph",
  "system-doctor",
  "backup-engine",
  "migration-engine",
]);

function createHttpReadinessRegistry(entries = []) {
  const states = new Map();
  const pending = [];

  for (const entry of entries) {
    const id = entry.id;
    states.set(id, MODULE_STATES.LOADING);
    const tracked = Promise.resolve(entry.promise).then(
      value => {
        states.set(id, MODULE_STATES.READY);
        return value;
      },
      error => {
        states.set(id, MODULE_STATES.FAILED);
        return { error };
      },
    );
    pending.push(tracked);
  }

  return {
    status(id) {
      return states.get(id) || MODULE_STATES.FAILED;
    },
    isReady() {
      for (const entry of entries) {
        if (!entry.required) continue;
        if (states.get(entry.id) === MODULE_STATES.LOADING) return false;
      }
      return true;
    },
    async awaitReady() {
      await Promise.all(pending);
      return this.snapshot();
    },
    snapshot() {
      const modules = {};
      for (const [id, state] of states) modules[id] = state;
      return { ready: this.isReady(), modules };
    },
  };
}

function routeModuleError(registry, id, messages) {
  const state = registry.status(id);
  if (state === MODULE_STATES.LOADING) {
    return { error: messages.loading, state: "loading" };
  }
  if (state === MODULE_STATES.FAILED) {
    return { error: messages.failed, state: "unavailable" };
  }
  return null;
}

module.exports = {
  MODULE_STATES,
  REQUIRED_HTTP_MODULE_IDS,
  OPTIONAL_HTTP_MODULE_IDS,
  createHttpReadinessRegistry,
  routeModuleError,
};
