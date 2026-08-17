import fs from "node:fs";
import path from "node:path";
import { loadDurableJson, writeJsonAtomic } from "./durable-config.mjs";

function validateState(state) {
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.campaigns)) {
    throw new Error("invalid social publishing state");
  }
}

export function createSocialPublishingStore({ filePath, fsImpl = fs } = {}) {
  if (!filePath) throw new Error("filePath is required");
  const read = () => loadDurableJson(filePath, {
    validator: validateState,
    fallback: { schemaVersion: 1, campaigns: [] },
    quarantineDir: path.join(path.dirname(filePath), "Quarantine"),
    fsImpl,
  }).data;

  const write = state => {
    validateState(state);
    writeJsonAtomic(filePath, state, { backup: true, fsImpl });
    return structuredClone(state);
  };

  return Object.freeze({
    list() {
      return structuredClone(read().campaigns);
    },
    get(id) {
      const campaign = read().campaigns.find(item => item.id === id);
      return campaign ? structuredClone(campaign) : null;
    },
    put(campaign) {
      if (!campaign?.id) throw new Error("campaign id is required");
      const state = read();
      const index = state.campaigns.findIndex(item => item.id === campaign.id);
      if (index >= 0) state.campaigns[index] = structuredClone(campaign);
      else state.campaigns.push(structuredClone(campaign));
      write(state);
      return structuredClone(campaign);
    },
    remove(id) {
      const state = read();
      const next = state.campaigns.filter(item => item.id !== id);
      if (next.length === state.campaigns.length) return false;
      write({ ...state, campaigns: next });
      return true;
    },
  });
}
