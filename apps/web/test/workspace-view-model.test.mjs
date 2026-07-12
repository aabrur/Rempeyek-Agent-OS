import test from "node:test";
import assert from "node:assert/strict";

import { buildContinuityModel, projectTabFromKey, tasksForProject } from "../lib/workspace-view-model.mjs";

test("builds the Today continuity model only from fields present in the projection", () => {
  const model = buildContinuityModel({
    state: "ready",
    project: { id: "apollo", slug: "apollo", name: "Apollo", goal: "Ship the workspace", rel: "Projects/apollo/project.md" },
    nextAction: { type: "task", taskId: "task-1", label: "Review the interface" },
    unfinishedTasks: [{ id: "task-1", title: "Review the interface", status: "pending" }],
    unresolvedDecisions: [{ id: "decision-1", text: "Choose the information hierarchy" }],
    recentArtifacts: [{ path: "Projects/apollo/prototype.md" }],
  });

  assert.equal(model.project.slug, "apollo");
  assert.equal(model.initialTab, "tasks");
  assert.deepEqual(model.items.map(item => item.kind), ["goal", "task", "artifact", "decision", "memory"]);
  assert.equal(model.items.every(item => item.value), true);
  assert.equal(model.items.find(item => item.kind === "artifact").target, "Projects/apollo/prototype.md");
});

test("moves through the six project destinations with standard tab keys", () => {
  assert.equal(projectTabFromKey("overview", "ArrowRight"), "tasks");
  assert.equal(projectTabFromKey("overview", "ArrowLeft"), "activity");
  assert.equal(projectTabFromKey("files", "Home"), "overview");
  assert.equal(projectTabFromKey("tasks", "End"), "activity");
  assert.equal(projectTabFromKey("memory", "Enter"), "memory");
});

test("shows task details only when the open project owns the Today task projection", () => {
  const today = { project: { id: "apollo" }, unfinishedTasks: [{ id: "task-1", title: "Ship Today" }] };
  assert.deepEqual(tasksForProject({ slug: "apollo" }, today), today.unfinishedTasks);
  assert.deepEqual(tasksForProject({ slug: "zeus" }, today), []);
});

test("does not call a blocked task the next task when the next action is a decision", () => {
  const model = buildContinuityModel({
    state: "ready", project: { id: "apollo", rel: "Projects/apollo/project.md" },
    nextAction: { type: "decision", decisionId: "d1", label: "Choose a direction" },
    unfinishedTasks: [{ id: "blocked", title: "Publish", status: "blocked" }],
    unresolvedDecisions: [{ id: "d1", text: "Choose a direction" }],
  });
  assert.equal(model.initialTab, "decisions");
  assert.equal(model.items.find(item => item.kind === "task").label, "Blocked task");
});
