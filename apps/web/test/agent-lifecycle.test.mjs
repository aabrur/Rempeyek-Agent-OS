import test from "node:test";
import assert from "node:assert/strict";

import {
  applyLifecycleChange,
  deriveLifecycle,
} from "../lib/agent-lifecycle.mjs";

const base = {
  activeAgentId: "alpha",
  agents: [
    {
      id: "alpha",
      name: "Alpha",
      role: "Coordinator",
      note: "Original",
      enabled: true,
      gateway: { marketplaceId: "codex", trigger: "codex" },
    },
    {
      id: "beta",
      name: "Beta",
      role: "Reviewer",
      enabled: false,
      gateway: { trigger: "claude" },
    },
  ],
};

test("installed, registered, enabled, and active are independent lifecycle axes", () => {
  assert.deepEqual(
    deriveLifecycle({
      entry: { id: "codex" },
      agent: base.agents[0],
      installed: true,
      activeAgentId: "alpha",
    }),
    {
      id: "codex",
      software: "installed",
      profile: "active",
      health: "unknown",
      active: true,
    },
  );
  assert.deepEqual(
    deriveLifecycle({ entry: { id: "cline" }, agent: null, installed: true }),
    {
      id: "cline",
      software: "installed",
      profile: "absent",
      health: "unknown",
      active: false,
    },
  );
  assert.deepEqual(
    deriveLifecycle({
      agent: base.agents[1],
      installed: false,
      activeAgentId: "alpha",
    }),
    {
      id: "beta",
      software: "not_installed",
      profile: "disabled",
      health: "unknown",
      active: false,
    },
  );
});

test("activate changes only the active pointer and rejects disabled agents", () => {
  const activated = applyLifecycleChange(base, {
    type: "activate",
    id: "alpha",
  });
  assert.deepEqual(activated.agents, base.agents);
  assert.equal(activated.activeAgentId, "alpha");
  assert.throws(
    () => applyLifecycleChange(base, { type: "activate", id: "beta" }),
    /disabled/i,
  );
});

test("disable clears the active pointer and enable does not activate implicitly", () => {
  const disabled = applyLifecycleChange(base, { type: "disable", id: "alpha" });
  assert.equal(disabled.agents[0].enabled, false);
  assert.equal(disabled.activeAgentId, null);

  const enabled = applyLifecycleChange(base, { type: "enable", id: "beta" });
  assert.equal(enabled.agents[1].enabled, true);
  assert.equal(enabled.activeAgentId, "alpha");
});

test("edit accepts only name, role, and note and preserves immutable integration fields", () => {
  const edited = applyLifecycleChange(base, {
    type: "edit",
    id: "alpha",
    patch: {
      id: "hijacked",
      name: "  Alpha Prime  ",
      role: "  Lead  ",
      note: "  Safe note  ",
      enabled: false,
      gateway: { trigger: "evil" },
    },
  });
  assert.deepEqual(edited.agents[0], {
    ...base.agents[0],
    name: "Alpha Prime",
    role: "Lead",
    note: "Safe note",
  });
});

test("unknown agents and commands fail closed without mutating input", () => {
  const before = structuredClone(base);
  assert.throws(
    () => applyLifecycleChange(base, { type: "enable", id: "missing" }),
    /not found/i,
  );
  assert.throws(
    () => applyLifecycleChange(base, { type: "explode", id: "alpha" }),
    /unsupported/i,
  );
  assert.deepEqual(base, before);
});
