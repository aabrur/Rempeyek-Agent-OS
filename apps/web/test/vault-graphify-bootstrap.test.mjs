import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scaffoldVaultStructure, getVaultHealth } from "../lib/vault-project-store.mjs";

test("scaffoldVaultStructure idempotently creates required vault directories and Brains lanes", () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-vault-test-"));
  try {
    const agents = [
      { id: "hermes", name: "Hermes", lane: "Hermes", icon: "🟢" },
      { id: "claude-code", name: "Claude Code", lane: "ClaudeCode", icon: "⚫" },
    ];
    scaffoldVaultStructure(tmpVault, { agents });

    // Verify root folders exist
    for (const dir of ["Brains", "Projects", "Tasks", "Inbox", "Reports", "Memory", "Attachments", ".obsidian"]) {
      assert.ok(fs.existsSync(path.join(tmpVault, dir)), `Directory ${dir} should exist`);
    }

    // Verify Brains lane for Hermes exists
    for (const sub of ["Identity.md", "Memory.md", "Rules.md", "Knowledge", "Notes", "Daily"]) {
      assert.ok(fs.existsSync(path.join(tmpVault, "Brains", "Hermes", sub)), `Brains/Hermes/${sub} should exist`);
    }

    // Idempotency test: second run does not overwrite existing Identity.md
    fs.writeFileSync(path.join(tmpVault, "Brains", "Hermes", "Identity.md"), "CUSTOM_CONTENT", "utf8");
    scaffoldVaultStructure(tmpVault, { agents });
    assert.equal(fs.readFileSync(path.join(tmpVault, "Brains", "Hermes", "Identity.md"), "utf8"), "CUSTOM_CONTENT");
  } finally {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});

test("getVaultHealth returns writable status, note count, and obsidian status", () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-vault-health-"));
  try {
    scaffoldVaultStructure(tmpVault, { agents: [] });
    const health = getVaultHealth(tmpVault);
    assert.equal(health.exists, true);
    assert.equal(health.writable, true);
    assert.ok(typeof health.noteCount === "number");
  } finally {
    fs.rmSync(tmpVault, { recursive: true, force: true });
  }
});
