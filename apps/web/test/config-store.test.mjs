import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createConfigStore, RETAINED_AGENT_DATA } = require("../lib/config-store.cjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-store-"));
  const configPath = path.join(root, "agents.config.json");
  const tombstoneDir = path.join(root, "tombstones");
  const config = {
    agency: "REMPEYEK AGENT OS",
    activeAgentId: "primary",
    agents: [
      {
        id: "primary",
        name: "Primary",
        role: "Coordinator",
        enabled: true,
        gateway: {
          trigger: "primary",
          envAllow: ["OPENAI_API_KEY"],
          credentials: { OPENAI_API_KEY: "sk-must-never-survive" },
        },
      },
      {
        id: "child",
        name: "Child",
        role: "Research",
        enabled: true,
        parentId: "primary",
      },
    ],
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { root, configPath, tombstoneDir, config };
}

test("commit atomically replaces config, keeps one backup, and replays an operation once", () => {
  const item = fixture();
  const committed = [];
  try {
    const store = createConfigStore({
      configPath: item.configPath,
      tombstoneDir: item.tombstoneDir,
      onCommit: event => committed.push(event),
    });
    const next = { ...item.config, activeAgentId: "child" };

    const first = store.commit(next, "activate-child");
    const replay = store.commit({ ...next, agency: "SHOULD NOT WIN" }, {
      operationId: "activate-child",
    });

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(item.configPath, "utf8")), next);
    assert.deepEqual(JSON.parse(fs.readFileSync(`${item.configPath}.bak`, "utf8")), item.config);
    assert.equal(committed.length, 1);
    assert.equal(
      fs.readdirSync(item.root).some(name => name.endsWith(".tmp")),
      false,
    );
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("removing a parent blocks by default and can explicitly detach its children", () => {
  const item = fixture();
  try {
    const store = createConfigStore({
      configPath: item.configPath,
      tombstoneDir: item.tombstoneDir,
      now: () => new Date("2026-07-24T01:00:00.000Z"),
      randomId: () => "tomb-1",
    });

    assert.throws(
      () => store.removeProfile(
        item.config,
        "primary",
        { detachChildren: false },
        "remove-blocked",
      ),
      /child agent/i,
    );

    const result = store.removeProfile(item.config, "primary", {
      detachChildren: true,
    }, "remove-primary");

    assert.equal(result.config.activeAgentId, null);
    assert.deepEqual(result.config.agents, [{
      id: "child",
      name: "Child",
      role: "Research",
      enabled: false,
      parentId: null,
      detachedFrom: "primary",
    }]);
    assert.deepEqual(result.config.removedAgentIds, ["primary"]);
    assert.deepEqual(result.retained, RETAINED_AGENT_DATA);
    assert.equal(Object.hasOwn(result, "tombstone"), false);
    assert.deepEqual(store.listTombstones(), []);
    assert.equal(fs.existsSync(item.tombstoneDir), false);

    const replay = store.removeProfile(item.config, "primary", {
      detachChildren: true,
    }, "remove-primary");
    assert.equal(replay.replayed, true);
    assert.equal(store.listTombstones().length, 0);
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("removed profiles are final and cannot be restored", () => {
  const item = fixture();
  try {
    const store = createConfigStore({
      configPath: item.configPath,
      tombstoneDir: item.tombstoneDir,
      randomId: () => "tomb-2",
    });
    store.removeProfile(item.config, "child", {
      detachChildren: false,
    }, "remove-child");
    assert.deepEqual(
      JSON.parse(fs.readFileSync(item.configPath, "utf8")).removedAgentIds,
      ["child"],
    );
    assert.equal(typeof store.restoreProfile, "undefined");
    assert.deepEqual(store.listTombstones(), []);
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});

test("commit validates operation ids and config shape before touching disk", () => {
  const item = fixture();
  try {
    const store = createConfigStore({
      configPath: item.configPath,
      tombstoneDir: item.tombstoneDir,
    });
    assert.throws(() => store.commit({ agents: [] }, "../escape"), /operationId/);
    assert.throws(() => store.commit({}, "missing-agents"), /agents array/);
    assert.deepEqual(JSON.parse(fs.readFileSync(item.configPath, "utf8")), item.config);
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true });
  }
});
