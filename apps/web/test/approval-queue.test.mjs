import test from "node:test";
import assert from "node:assert/strict";
import { createApprovalQueue } from "../lib/approval-queue.mjs";

test("approval lifecycle is auditable and approved scope can be consumed once", () => {
  let time = 1000;
  const queue = createApprovalQueue({ now: () => time });
  const approval = queue.request({ type: "process.stop", target: "codex", consequence: "Stops the local process", actor: "founder" });
  assert.equal(approval.status, "pending");
  assert.equal(queue.authorize(approval.id, { type: "process.stop", target: "codex" }).allowed, false);
  queue.decide(approval.id, { decision: "approved", actor: "founder" });
  assert.equal(queue.authorize(approval.id, { type: "process.stop", target: "codex" }).allowed, true);
  assert.equal(queue.authorize(approval.id, { type: "process.stop", target: "codex" }).allowed, false);
  assert.deepEqual(queue.audit().map(e => e.action), ["requested", "approved", "consumed"]);
});

test("rejects mismatched scope and expires stale approvals", () => {
  let time = 0;
  const queue = createApprovalQueue({ now: () => time, ttlMs: 10 });
  const rejected = queue.request({ type: "vault.write", target: "Projects/a.md", consequence: "Writes a note", actor: "user" });
  queue.decide(rejected.id, { decision: "rejected", actor: "user" });
  assert.equal(queue.authorize(rejected.id, { type: "vault.write", target: "Projects/a.md" }).reason, "rejected");
  const expiring = queue.request({ type: "process.start", target: "codex", consequence: "Starts a process", actor: "user" });
  queue.decide(expiring.id, { decision: "approved", actor: "user" });
  time = 11;
  assert.equal(queue.authorize(expiring.id, { type: "process.start", target: "codex" }).reason, "expired");
  assert.equal(queue.get(expiring.id).status, "expired");
});

test("requires consequence, target, scope type, and actor", () => {
  const queue = createApprovalQueue();
  assert.throws(() => queue.request({ type: "process.stop", target: "codex" }), /consequence/);
});
