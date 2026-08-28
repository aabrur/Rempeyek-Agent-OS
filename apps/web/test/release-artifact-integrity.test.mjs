import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { APP_VERSION } from "../lib/version.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "release-artifact-integrity.mjs");
const EXPORT = path.join(ROOT, "scripts", "export-public-release.mjs");

test("export-public-release fails closed instead of warn-only on copy", () => {
  const src = fs.readFileSync(EXPORT, "utf8");
  assert.match(src, /process\.exit\(1\)/);
  assert.doesNotMatch(src, /Could not sync root installer/);
  assert.match(src, /sha256|createHash/i);
});

test("integrity script verifies checksums against actual bytes and latest.yml", () => {
  assert.equal(fs.existsSync(SCRIPT), true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-integrity-"));
  try {
    const setupName = `Rempeyek-Agent-OS-Setup-${APP_VERSION}.exe`;
    const portableName = `Rempeyek-Agent-OS-Portable-${APP_VERSION}.exe`;
    const setup = path.join(dir, setupName);
    const portable = path.join(dir, portableName);
    fs.writeFileSync(setup, "setup-bytes");
    fs.writeFileSync(portable, "portable-bytes");
    const setupHash = createHash("sha256").update("setup-bytes").digest("hex");
    const portableHash = createHash("sha256").update("portable-bytes").digest("hex");
    fs.writeFileSync(
      path.join(dir, "SHA256SUMS.txt"),
      `${setupHash}  ${setupName}\n${portableHash}  ${portableName}\n`,
    );
    fs.writeFileSync(
      path.join(dir, "latest.yml"),
      `version: ${APP_VERSION}\nfiles:\n  - url: ${setupName}\n    sha512: abc\n`,
    );
    fs.writeFileSync(path.join(dir, `${setupName}.blockmap`), "blockmap");
    const ok = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr || ok.stdout);

    fs.writeFileSync(setup, "tampered");
    const bad = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
    assert.notEqual(bad.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
