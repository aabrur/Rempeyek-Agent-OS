import assert from "node:assert/strict";
import test from "node:test";

import {
  filterMarketplace,
  marketplaceAction,
} from "../src/lib/marketplace-view.mjs";

const entries = [
  {
    id: "codex",
    kind: "agent",
    featured: false,
    registered: false,
    installed: false,
    adapterIds: ["npm"],
  },
  {
    id: "hypertaks-agent",
    kind: "plugin",
    featured: true,
    registered: false,
    installed: false,
    adapterIds: ["agents-standard"],
  },
  {
    id: "crimson-odyssey",
    kind: "agent",
    featured: false,
    registered: false,
    installed: false,
    adapterIds: [],
    officialUrl: "https://example.test",
  },
];

test("featured entries sort first without changing kind filters or caller input", () => {
  const original = structuredClone(entries);
  assert.deepEqual(
    filterMarketplace(entries, "all").map(item => item.id),
    ["hypertaks-agent", "codex", "crimson-odyssey"],
  );
  assert.deepEqual(
    filterMarketplace(entries, "agent").map(item => item.id),
    ["codex", "crimson-odyssey"],
  );
  assert.deepEqual(entries, original);
});

test("actions never expose command text", () => {
  assert.deepEqual(marketplaceAction(entries[0]), {
    kind: "install",
    label: "Install + register",
    adapterId: "npm",
  });
  assert.deepEqual(marketplaceAction(entries[2]), {
    kind: "register",
    label: "Register launcher",
    adapterId: null,
  });
  assert.equal(JSON.stringify(marketplaceAction(entries[0])).includes("cmd"), false);
});

test("running and ready states stay explicit", () => {
  assert.deepEqual(
    marketplaceAction(entries[0], { runningId: "codex" }),
    { kind: "state", label: "installing…", adapterId: null },
  );
  assert.deepEqual(
    marketplaceAction({ ...entries[0], registered: true, installed: true }),
    { kind: "state", label: "✓ ready", adapterId: null },
  );
  assert.deepEqual(
    marketplaceAction({ ...entries[1], installed: true }),
    { kind: "state", label: "✓ ready", adapterId: null },
  );
});
