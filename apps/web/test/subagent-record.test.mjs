import assert from "node:assert/strict";
import test from "node:test";

import { buildSubagentRecord } from "../lib/subagent-record.mjs";

const parent = {
  id: "codex",
  name: "Codex",
  lane: "Codex",
  node: "Node-12",
  kind: "agent",
};

test("builds a parent-bound subagent with safe defaults", () => {
  const result = buildSubagentRecord({
    name: "Security Reviewer",
    domain: "Application security",
    outcome: "Review changed code and report actionable findings",
    workspaceScope: "current-project",
  }, {
    parent,
    existingIds: ["codex"],
    existingNodeNums: [12],
    now: "2026-07-24T00:00:00.000Z",
  });

  assert.equal(result.error, undefined);
  assert.deepEqual(result.agent, {
    id: "codex-security-reviewer",
    kind: "subagent",
    parentId: "codex",
    name: "Security Reviewer",
    domain: "Application security",
    role: "Application security",
    outcome: "Review changed code and report actionable findings",
    workspaceScope: "current-project",
    permissions: { profile: "standard", allowedPaths: [] },
    memoryPolicy: "isolated",
    activation: "manual",
    modelProvider: "",
    toolIds: [],
    skillIds: [],
    cadence: "",
    eventTrigger: "",
    checkpointRule: "",
    instructions: "",
    node: "Node-13",
    lane: "Codex/Subagents/SecurityReviewer",
    enabled: true,
    createdAt: "2026-07-24T00:00:00.000Z",
  });
});

test("rejects missing purpose, non-primary parent, and escaping paths", () => {
  assert.match(
    buildSubagentRecord(
      { name: "X" },
      { parent, existingIds: [], existingNodeNums: [] },
    ).error,
    /domain/,
  );
  assert.match(
    buildSubagentRecord({
      name: "X",
      domain: "D",
      outcome: "O",
      workspaceScope: "current-project",
    }, {
      parent: { ...parent, kind: "subagent" },
      existingIds: [],
      existingNodeNums: [],
    }).error,
    /primary/,
  );
  assert.match(
    buildSubagentRecord({
      name: "X",
      domain: "D",
      outcome: "O",
      workspaceScope: "current-project",
      allowedPaths: ["..\\secret"],
    }, {
      parent,
      existingIds: [],
      existingNodeNums: [],
    }).error,
    /allowed path/,
  );
});
