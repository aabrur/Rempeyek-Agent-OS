import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureEmptyConfig, resolveRuntimePaths } from "../lib/runtime-paths.cjs";
import { resolveProbe } from "../lib/process-adapters.mjs";
import { MARKETPLACE_ENTRIES, marketplaceEntry } from "../lib/marketplace-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/*
 * Consent contract: the public OS never registers an agent without an explicit,
 * user-initiated, install-detected registration. These tests lock in that posture
 * so a future change cannot silently re-seed or auto-add agents on fresh install
 * or on a legacy repo-dir run.
 */
test("fresh install writes a zero-agent registry - nothing auto-registers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raos-fresh-"));
  try {
    const cfgPath = path.join(dir, "agents.config.json");
    const cfg = ensureEmptyConfig(cfgPath, { home: "C:\\Users\\public-test" });
    assert.ok(Array.isArray(cfg.agents));
    assert.equal(cfg.agents.length, 0);
    // No owner-specific path leaks into a fresh public config.
    assert.equal(String(cfg.workdir || "").includes("abrur"), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("legacy repo-dir run resolves config but never injects catalog agents", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raos-legacy-"));
  try {
    const cfgPath = path.join(dir, "agents.config.json");
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({ agency: "REMPEYEK AGENT OS", workdir: dir, agents: [] }),
      "utf8",
    );
    const paths = resolveRuntimePaths({ root: dir, home: "C:\\Users\\public-test", platform: "win32" });
    assert.equal(paths.legacyConfig, true);
    assert.equal(paths.configPath, cfgPath);
    const cfg = JSON.parse(fs.readFileSync(paths.configPath, "utf8"));
    // A full marketplace catalog exists, but reading it must not seed the config.
    assert.ok(MARKETPLACE_ENTRIES.length >= 23);
    assert.equal(cfg.agents.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("marketplace descriptors are a pure catalog - importing them registers nothing", () => {
  const before = MARKETPLACE_ENTRIES.length;
  for (const entry of MARKETPLACE_ENTRIES.filter(e => e.kind === "agent")) {
    const probe = resolveProbe({ entry, platform: "win32" });
    assert.ok(probe && probe.args.length === 1, `entry ${entry.id} must expose an install probe`);
    assert.equal(probe.args[0], entry.agent.trigger);
    // A catalog read is a metadata lookup only; it must never add an enabled profile.
    assert.equal(entry.enabled, undefined);
  }
  // Reading the frozen catalog must be side-effect-free.
  assert.equal(MARKETPLACE_ENTRIES.length, before);
});

test("shipped public registry example stays empty - the consent default is zero agents", () => {
  const example = JSON.parse(
    fs.readFileSync(path.join(ROOT, "agents.config.example.json"), "utf8"),
  );
  assert.deepEqual(example.agents, []);
});