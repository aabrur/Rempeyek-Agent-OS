import assert from "node:assert/strict";
import test from "node:test";

import {
  MARKETPLACE_ENTRIES,
  marketplaceEntry,
  publicMarketplaceEntry,
  validateMarketplace,
} from "../lib/marketplace-manifest.mjs";

const AGENT_IDS = [
  "claude-code", "codex", "kilo-code", "cline", "pi", "antigravity",
  "hermes", "openclaw", "gemini-cli", "github-copilot-cli", "opencode",
  "aider", "goose", "openhands", "qwen-code", "kimi-code",
  "mistral-vibe", "cursor-agent", "crush", "crimson-odyssey",
];

test("launch manifest contains the exact curated 20 agents", () => {
  assert.deepEqual(
    MARKETPLACE_ENTRIES.filter(entry => entry.kind === "agent").map(entry => entry.id),
    AGENT_IDS,
  );
  assert.deepEqual(validateMarketplace(MARKETPLACE_ENTRIES), { ok: true, errors: [] });
});

test("Hypertaks is featured and exposes one public skill child", () => {
  const plugin = marketplaceEntry("hypertaks-agent");
  assert.equal(plugin.kind, "plugin");
  assert.equal(plugin.featured, true);
  assert.equal(plugin.sourceRef, "b45cc6b9c686c30615b971f880c532b1ed48e80b");
  assert.deepEqual(plugin.children, ["hypertaks-founder"]);
  assert.equal(marketplaceEntry("hypertaks-founder").kind, "skill");
});

test("Crimson Odyssey is visible but cannot execute an installer", () => {
  const entry = marketplaceEntry("crimson-odyssey");
  assert.equal(entry.sourceUrl, "https://github.com/Crimson-Rift-Studio/crimson-odyssey");
  assert.deepEqual(entry.installers, []);
  assert.match(entry.availabilityNote, /canonical install owner/i);
});

test("public projection hides adapters unsupported on the active platform", () => {
  assert.deepEqual(
    publicMarketplaceEntry(marketplaceEntry("cline"), { platform: "win32" }).adapterIds,
    [],
  );
  assert.deepEqual(
    publicMarketplaceEntry(marketplaceEntry("cline"), { platform: "darwin" }).adapterIds,
    ["npm"],
  );
});

test("public Marketplace projection strips executable adapter details", () => {
  const projected = publicMarketplaceEntry(marketplaceEntry("codex"), {
    registered: false,
    installed: true,
  });
  assert.deepEqual(projected.adapterIds, ["npm"]);
  assert.equal(projected.icon, "⬜");
  assert.equal(projected.role, "Repository-aware software engineering agent");
  assert.equal(projected.installed, true);
  assert.equal(projected.registered, false);
  for (const forbidden of ["program", "args", "package", "packageId", "sourceRef"]) {
    assert.equal(Object.hasOwn(projected, forbidden), false);
    assert.equal(JSON.stringify(projected).includes(`"${forbidden}"`), false);
  }
});
