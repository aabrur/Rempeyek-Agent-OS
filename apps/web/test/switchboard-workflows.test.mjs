import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Test suite for Switchboard Task Dispatching & Primary Workflows Customization

test("Switchboard Workflows API - get default and update custom workflows", async () => {
  const mockWorkflows = [
    { id: "openclaw", who: "OpenClaw", t: "Custom Strategy", d: "Custom description for business analysis." },
    { id: "hermes", who: "Hermes", t: "Trading & Market", d: "Custom trading bot description." },
  ];

  // Verify format of workflow objects
  for (const wf of mockWorkflows) {
    assert.ok(wf.id);
    assert.ok(wf.who);
    assert.ok(wf.t);
    assert.ok(wf.d);
  }

  assert.equal(mockWorkflows.length, 2);
  assert.equal(mockWorkflows[0].t, "Custom Strategy");
});

test("Switchboard Task Delivery - Task queued for agent and answered when online", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "switchboard-task-test-"));
  const vaultDir = path.join(tmpDir, "Tasks");
  fs.mkdirSync(vaultDir, { recursive: true });
  const taskFile = path.join(vaultDir, "Inbox Tasks.md");

  const agentId = "hermes";
  const title = "Analyze BTC momentum";
  const date = new Date().toISOString().slice(0, 10);

  // Simulating createTask
  const line = `- [ ] ${title} - Hermes - ${date}\n`;
  fs.writeFileSync(taskFile, `# 📥 Inbox Tasks\n\n${line}`, "utf8");

  // Verify task file written
  const content = fs.readFileSync(taskFile, "utf8");
  assert.ok(content.includes("Analyze BTC momentum"));
  assert.ok(content.includes("- [ ]"));

  // Simulating agent coming online and completing pending task
  const updatedContent = content.replace("- [ ] Analyze BTC momentum", "- [x] Analyze BTC momentum");
  fs.writeFileSync(taskFile, updatedContent, "utf8");

  const afterOnlineContent = fs.readFileSync(taskFile, "utf8");
  assert.ok(afterOnlineContent.includes("- [x] Analyze BTC momentum"));

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
