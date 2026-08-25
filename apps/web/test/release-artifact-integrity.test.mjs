import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

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
    const setup = path.join(dir, "Rempeyek-Agent-OS-Setup-2.4.6.exe");
    const portable = path.join(dir, "Rempeyek-Agent-OS-Portable-2.4.6.exe");
    fs.writeFileSync(setup, "setup-bytes");
    fs.writeFileSync(portable, "portable-bytes");
    const setupHash = createHash("sha256").update("setup-bytes").digest("hex");
    const portableHash = createHash("sha256").update("portable-bytes").digest("hex");
    fs.writeFileSync(
      path.join(dir, "SHA256SUMS.txt"),
      `${setupHash}  Rempeyek-Agent-OS-Setup-2.4.6.exe\n${portableHash}  Rempeyek-Agent-OS-Portable-2.4.6.exe\n`,
    );
    fs.writeFileSync(
      path.join(dir, "latest.yml"),
      "version: 2.4.6\nfiles:\n  - url: Rempeyek-Agent-OS-Setup-2.4.6.exe\n    sha512: abc\n",
    );
    fs.writeFileSync(path.join(dir, "Rempeyek-Agent-OS-Setup-2.4.6.exe.blockmap"), "blockmap");
    const ok = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr || ok.stdout);

    fs.writeFileSync(setup, "tampered");
    const bad = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
    assert.notEqual(bad.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
