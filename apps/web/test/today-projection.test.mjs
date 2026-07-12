import test from "node:test";
import assert from "node:assert/strict";
import { buildTodayProjection } from "../lib/today-projection.mjs";

test("selects the most recently active project and orders unfinished work deterministically", () => {
  const result = buildTodayProjection([
    { id: "old", status: "active", updatedAt: "2026-07-10T00:00:00Z", tasks: [] },
    { id: "apollo", title: "Apollo", status: "active", updatedAt: "2026-07-12T08:00:00Z",
      tasks: [
        { id: "later", title: "Later", status: "pending", priority: 3 },
        { id: "blocked", title: "Needs approval", status: "blocked", priority: 1 },
        { id: "next", title: "Ship Today", status: "pending", priority: 1 },
        { id: "done", title: "Done", status: "completed", priority: 0 },
      ],
      decisions: [{ id: "d1", text: "Choose graph layout", status: "unresolved" }],
      artifacts: [{ path: "output.md", updatedAt: "2026-07-12T07:00:00Z" }],
    },
  ]);
  assert.equal(result.state, "ready");
  assert.equal(result.project.id, "apollo");
  assert.deepEqual(result.unfinishedTasks.map(t => t.id), ["next", "blocked", "later"]);
  assert.equal(result.nextAction.taskId, "next");
  assert.equal(result.unresolvedDecisions.length, 1);
});

test("accepts numeric filesystem timestamps when selecting the current project", () => {
  const result = buildTodayProjection([
    { id: "older", status: "active", updatedAt: 1000 },
    { id: "newer", status: "active", updatedAt: 2000 },
  ]);
  assert.equal(result.project.id, "newer");
});

test("preserves recent output from the production project projection", () => {
  const result = buildTodayProjection([{
    id: "apollo", status: "active", updatedAt: 2000,
    recentArtifacts: [{ path: "Projects/apollo/output.md", updatedAt: 1900 }],
  }]);
  assert.deepEqual(result.recentArtifacts, [
    { path: "Projects/apollo/output.md", updatedAt: 1900 },
  ]);
});

test("orders equal-priority tasks by status and stable id", () => {
  const result = buildTodayProjection([{
    id: "apollo", status: "active", updatedAt: 2000,
    tasks: [
      { id: "a-task", title: "A", status: "pending", priority: 1 },
      { id: "z-task", title: "Z", status: "pending", priority: 1 },
      { id: "blocked", title: "Blocked", status: "blocked", priority: 1 },
    ],
  }]);
  assert.deepEqual(result.unfinishedTasks.map(task => task.id), ["a-task", "z-task", "blocked"]);
});

test("returns an explicit empty state", () => {
  assert.deepEqual(buildTodayProjection([]), { state: "empty", project: null, unfinishedTasks: [], unresolvedDecisions: [], recentArtifacts: [], nextAction: null });
});
