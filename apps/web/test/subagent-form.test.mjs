import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSubagentForm,
  validateSubagentForm,
} from "../src/lib/subagent-form.mjs";

test("normalizes required and advanced values", () => {
  assert.deepEqual(normalizeSubagentForm({
    name: "  Security Reviewer ",
    domain: " AppSec ",
    outcome: " Review the diff ",
    workspaceScope: "current-project",
    permissionProfile: "read-only",
    allowedPaths: "apps/web\npackages/ui",
    toolIds: "rg, git",
    skillIds: "backend-code-review",
  }), {
    name: "Security Reviewer",
    domain: "AppSec",
    outcome: "Review the diff",
    workspaceScope: "current-project",
    permissionProfile: "read-only",
    memoryPolicy: "isolated",
    activation: "manual",
    modelProvider: "",
    allowedPaths: ["apps/web", "packages/ui"],
    toolIds: ["rg", "git"],
    skillIds: ["backend-code-review"],
    cadence: "",
    eventTrigger: "",
    checkpointRule: "",
    instructions: "",
  });
});

test("requires name, domain, outcome, and scope", () => {
  assert.deepEqual(validateSubagentForm({}), {
    name: "Name is required",
    domain: "Field/domain is required",
    outcome: "Concrete outcome is required",
    workspaceScope: "Workspace scope is required",
  });
});
