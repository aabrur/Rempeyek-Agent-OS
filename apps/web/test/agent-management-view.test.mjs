import assert from "node:assert/strict";
import test from "node:test";

import {
  agentManagementRows,
  removalImpact,
} from "../src/lib/agent-management-view.mjs";

test("management rows keep software and profile state separate", () => {
  const rows = agentManagementRows([
    {
      id: "codex",
      name: "Codex",
      software: "installed",
      profile: "disabled",
      active: false,
    },
  ]);
  assert.deepEqual(rows[0].badges, ["installed", "disabled"]);
  assert.deepEqual(rows[0].actions, [
    "edit",
    "enable",
    "activate",
    "remove",
    "uninstall",
  ]);
});

test("non-uninstallable rows never offer uninstall", () => {
  const [row] = agentManagementRows([{
    id: "custom",
    name: "Custom",
    software: "unknown",
    profile: "registered",
    active: false,
    uninstallable: false,
  }]);
  assert.deepEqual(row.actions, ["edit", "disable", "activate", "remove"]);
});

test("absent or unverified software has no destructive action", () => {
  const [row] = agentManagementRows([{
    id: "catalog-only",
    name: "Catalog only",
    software: "unknown",
    profile: "absent",
    active: false,
    uninstallable: true,
  }]);
  assert.deepEqual(row.actions, []);
});

test("removal impact names retained data and child blocker", () => {
  const impact = removalImpact(
    { id: "codex", name: "Codex" },
    [{ id: "reviewer" }],
  );
  assert.deepEqual(impact.retained, [
    "vault",
    "telemetry",
    "activity",
    "workflows",
    "logs",
    "credentials",
    "software",
    "user files",
  ]);
  assert.deepEqual(impact.childIds, ["reviewer"]);
});
