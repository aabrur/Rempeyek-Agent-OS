import test from "node:test";
import assert from "node:assert/strict";
import { formatAgentTelemetry, ALLOWED_EVENT_TYPES } from "../lib/subagent-record.mjs";

test("ALLOWED_EVENT_TYPES contains all base lifecycle evidence types", () => {
  const required = [
    "session_start",
    "session_end",
    "process_start",
    "process_exit",
    "install_start",
    "install_progress",
    "install_done",
    "install_failed",
    "gateway_start",
    "gateway_stop",
    "gateway_restart",
    "gateway_status",
    "summon_start",
    "summon_ready",
    "summon_exit",
    "update_start",
    "update_progress",
    "update_done",
    "update_failed",
  ];

  for (const type of required) {
    assert.ok(ALLOWED_EVENT_TYPES.has(type), `Telemetry type ${type} must be allowed`);
  }
});

test("formatAgentTelemetry returns Not reported by this agent when no subagents/tasks exist", () => {
  const result = formatAgentTelemetry({ agentId: "hermes", events: [] });
  assert.equal(result.tasksState, "Not reported by this agent");
  assert.equal(result.subagentsState, "Not reported by this agent");
  assert.deepEqual(result.tasks, []);
  assert.deepEqual(result.subagents, []);
});
