import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTelemetry, isHeartbeat, selectTelemetryWindow, telemetryActivity, coAssignments,
  triggerExe, laneScaffold,
} from "../lib/agent-detail.mjs";

test("parseTelemetry skips blank and malformed lines", () => {
  const text = `{"type":"info","name":"a"}\n\nnot json\n{"type":"task_done","name":"b"}\n{"no":"type"}`;
  const events = parseTelemetry(text);
  assert.deepEqual(events.map(e => e.name), ["a", "b"]);
});

test("isHeartbeat recognises explicit type and legacy named task_progress", () => {
  assert.equal(isHeartbeat({ type: "heartbeat" }), true);
  assert.equal(isHeartbeat({ type: "task_progress", name: "Heartbeat Hermes" }), true);
  assert.equal(isHeartbeat({ type: "task_progress", name: "Scan BTC market" }), false);
  assert.equal(isHeartbeat({ type: "subagent_start", name: "worker" }), false);
});

test("selectTelemetryWindow keeps real signal even under a heartbeat flood", () => {
  // 2 real events buried under 100 heartbeats — the old slice(-30) hid them entirely.
  const real = [
    { type: "subagent_start", name: "telemetry-writer", ts: "2026-07-06T19:41:02Z" },
    { type: "task_done", name: "Ringkas agentic-os", ts: "2026-07-06T19:41:03Z" },
  ];
  const heartbeats = Array.from({ length: 100 }, (_, i) => ({ type: "heartbeat", name: "Heartbeat Hermes", ts: `2026-07-14T${String(i % 24).padStart(2, "0")}:00:00Z` }));
  const events = [...real, ...heartbeats];
  const window = selectTelemetryWindow(events, { limit: 30 });
  assert.ok(window.some(e => e.type === "subagent_start"), "subagent event survived");
  assert.ok(window.some(e => e.name === "Ringkas agentic-os"), "task event survived");
  assert.ok(window.length <= 30);
});

test("selectTelemetryWindow returns newest-first and never exceeds the limit", () => {
  const events = Array.from({ length: 50 }, (_, i) => ({ type: "task_progress", name: `t${i}`, ts: `2026-07-01T00:00:${String(i).padStart(2, "0")}Z` }));
  const window = selectTelemetryWindow(events, { limit: 10 });
  assert.equal(window.length, 10);
  assert.equal(window[0].name, "t49", "newest first");
});

test("telemetryActivity drops heartbeats and surfaces buried subagents", () => {
  const events = selectTelemetryWindow([
    { type: "subagent_start", name: "telemetry-writer", detail: "append", ts: "2026-07-06T19:41:02Z" },
    ...Array.from({ length: 40 }, () => ({ type: "heartbeat", name: "Heartbeat Hermes" })),
  ], { limit: 30 });
  const activity = telemetryActivity(events);
  assert.equal(activity.subagents.length, 1);
  assert.equal(activity.subagents[0].desc, "telemetry-writer");
  assert.equal(activity.sessions.length, 0, "heartbeats never become sessions");
});

test("telemetryActivity renders an info event as an idle session (OpenClaw's only signal)", () => {
  const activity = telemetryActivity([{ type: "info", name: "Registered to Agentic OS", detail: "pipeline configured", ts: "2026-07-05T13:38:17Z" }]);
  assert.equal(activity.sessions.length, 1);
  assert.equal(activity.sessions[0].status, "idle");
  assert.equal(activity.sessions[0].lastPrompt, "Registered to Agentic OS");
});

test("telemetryActivity dedupes a task to its latest status", () => {
  // newest-first: done wins over the earlier start of the same-named task.
  const activity = telemetryActivity([
    { type: "task_done", name: "Build", ts: "2026-07-06T02:00:00Z", progress: 100 },
    { type: "task_start", name: "Build", ts: "2026-07-06T01:00:00Z", progress: 0 },
  ]);
  assert.equal(activity.sessions.length, 1);
  assert.equal(activity.sessions[0].status, "idle");
});

const AGENTS = [
  { id: "claude-code", name: "Claude Code", lane: "ClaudeCode" },
  { id: "hermes", name: "Hermes", lane: "Hermes" },
  { id: "openclaw", name: "OpenClaw", lane: "OpenClaw" },
  { id: "codex", name: "Codex", lane: "Codex" },
  { id: "kilo-code", name: "Kilo Code", lane: "KiloCode" },
  { id: "cline", name: "Cline", lane: "Cline" },
  { id: "pi", name: "Pi", lane: "Pi" },
  { id: "antigravity", name: "Antigravity", lane: "Antigravity" },
];

test("coAssignments links agents sharing a workspace, resolving display names to ids", () => {
  const taskFiles = [{
    rel: "Tasks/Inbox Tasks.md", text: [
      "- [ ] Resume project: Skill Hypertaks — Codex — 2026-07-14 · Workspace: Projects/skill-hypertaks/",
      "- [ ] Resume project: Skill Hypertaks — Kilo Code — 2026-07-14 · Workspace: Projects/skill-hypertaks/",
      "- [x] Resume project: Skill Hypertaks — Pi — 2026-07-14 · Workspace: Projects/skill-hypertaks/",
    ].join("\n"),
  }];
  const links = coAssignments(taskFiles, AGENTS);
  // 3 members → C(3,2) = 3 undirected pairs
  assert.equal(links.length, 3);
  for (const l of links) { assert.ok(l.a < l.b, "pairs are sorted/unordered"); assert.equal(l.project, "skill-hypertaks"); }
  const pairs = links.map(l => `${l.a}|${l.b}`).sort();
  assert.deepEqual(pairs, ["codex|kilo-code", "codex|pi", "kilo-code|pi"]);
});

test("coAssignments ignores unknown/retired agents and single-member projects", () => {
  const taskFiles = [{
    rel: "Tasks/Active Tasks.md", text: [
      "- [x] Sinkronkan skill junction Copilot CLI — Copilot CLI — 2026-07-06",       // retired → dropped
      "- [ ] Resume project: Lonely — Hermes — 2026-07-14 · Workspace: Projects/lonely/", // single member → no edge
    ].join("\n"),
  }];
  assert.deepEqual(coAssignments(taskFiles, AGENTS), []);
});

test("triggerExe takes the first token of trigger, falls back to bin, else empty", () => {
  assert.equal(triggerExe({ trigger: "codex" }), "codex");
  assert.equal(triggerExe({ trigger: "claude gateway" }), "claude");
  assert.equal(triggerExe({ bin: "C:\\x\\hermes.exe gateway" }), "C:\\x\\hermes.exe");
  assert.equal(triggerExe({}), "");
  assert.equal(triggerExe(null), "");
});

test("laneScaffold emits the canonical Brains lane shape", () => {
  const entries = laneScaffold("Codex", { node: "Node-12", icon: "⬜", date: "2026-07-15" });
  const rels = entries.map(e => e.rel);
  assert.deepEqual(rels, ["Identity.md", "Memory.md", "Rules.md", "Knowledge/.gitkeep", "Notes/.gitkeep"]);
  assert.match(entries[0].content, /# ⬜ Codex — Identity/);
  assert.match(entries[0].content, /Node-12/);
  assert.equal(entries[3].content, "");   // gitkeeps are empty
});

test("coAssignments dedupes an agent that appears twice in one project", () => {
  const taskFiles = [{
    rel: "Tasks/Inbox Tasks.md", text: [
      "- [x] Resume project: Pivot — Claude Code — 2026-07-12 · Workspace: Projects/rempeyek-workspace-pivot/",
      "- [x] Resume project: Pivot — Claude Code — 2026-07-13 · Workspace: Projects/rempeyek-workspace-pivot/",
      "- [ ] Resume project: Pivot — Pi — 2026-07-13 · Workspace: Projects/rempeyek-workspace-pivot/",
    ].join("\n"),
  }];
  const links = coAssignments(taskFiles, AGENTS);
  assert.equal(links.length, 1);
  assert.deepEqual([links[0].a, links[0].b], ["claude-code", "pi"]);
});
