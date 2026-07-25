import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(DESKTOP, "..", "..");

test("desktop package pins the reviewed runtime and packages only required app files", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(DESKTOP, "package.json"), "utf8"),
  );
  assert.equal(pkg.name, "@rempeyek/desktop");
  assert.equal(pkg.main, "main.mjs");
  assert.equal(pkg.devDependencies.electron, "43.2.0");
  assert.equal(pkg.devDependencies["electron-builder"], "26.15.3");
  assert.equal(pkg.devDependencies.sharp, "0.35.3");
  assert.equal(pkg.devDependencies["png-to-ico"], "3.0.2");
  assert.equal(pkg.dependencies["electron-updater"], "6.8.9");
  assert.equal(pkg.build.appId, "com.rempeyek.agentos");
  assert.equal(pkg.build.productName, "Rempeyek Agent OS");
  assert.equal(pkg.build.files.includes("preload.cjs"), true);
  assert.equal(pkg.build.files.includes("preload.mjs"), false);
  assert.deepEqual(
    pkg.build.win.target.map(target => target.target),
    ["nsis", "portable"],
  );
  assert.equal(JSON.stringify(pkg.build).includes("Obsidian Vault"), false);
  assert.equal(JSON.stringify(pkg.build).includes("telemetry"), false);
});

test("root workspace exposes desktop scripts", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  assert.equal(pkg.workspaces.includes("apps/desktop"), true);
  assert.equal(
    pkg.scripts["test:desktop"],
    "npm test --workspace @rempeyek/desktop",
  );
  assert.equal(
    pkg.scripts["desktop:dist"],
    "npm run dist --workspace @rempeyek/desktop",
  );
  assert.equal(
    pkg.scripts["desktop:test-package"],
    "node --test apps/desktop/test/package-contents.test.mjs",
  );
});
