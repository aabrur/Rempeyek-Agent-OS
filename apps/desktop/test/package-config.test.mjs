import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { APP_VERSION } from "../../web/lib/version.mjs";

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(DESKTOP, "..", "..");

test("root, web, and desktop report the same release version", () => {
  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  const webPackage = JSON.parse(
    fs.readFileSync(path.join(ROOT, "apps", "web", "package.json"), "utf8"),
  );
  const desktopPackage = JSON.parse(
    fs.readFileSync(path.join(DESKTOP, "package.json"), "utf8"),
  );
  assert.equal(rootPackage.version, APP_VERSION);
  assert.equal(webPackage.version, rootPackage.version);
  assert.equal(desktopPackage.version, rootPackage.version);
});

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
  assert.equal(pkg.build.files.includes("notification-service.mjs"), true);
  assert.deepEqual(
    pkg.build.win.target.map(target => target.target),
    ["nsis", "portable"],
  );
  assert.equal(
    pkg.build.nsis.artifactName,
    "Rempeyek-Agent-OS-Setup-${version}.${ext}",
  );
  assert.equal(
    pkg.build.portable.artifactName,
    "Rempeyek-Agent-OS-Portable-${version}.${ext}",
  );
  assert.equal(JSON.stringify(pkg.build).includes("Obsidian Vault"), false);
  assert.equal(JSON.stringify(pkg.build).includes("telemetry"), false);
});

test("desktop fileset includes every local module imported by main.mjs", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(DESKTOP, "package.json"), "utf8"),
  );
  const mainSource = fs.readFileSync(path.join(DESKTOP, "main.mjs"), "utf8");
  const localImports = [
    ...mainSource.matchAll(/from\s+["']\.\/([^"']+)["']/g),
  ].map(match => match[1]);
  assert.ok(localImports.length > 0, "main.mjs must import local modules");
  for (const specifier of localImports) {
    assert.equal(
      pkg.build.files.includes(specifier),
      true,
      `${specifier} is imported by main.mjs but missing from build.files`,
    );
  }
});

test("root workspace exposes desktop scripts", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  assert.equal(pkg.workspaces.includes("apps/desktop"), true);
  assert.equal(
    pkg.scripts["test:desktop"],
    "node --test apps/desktop/test/*.test.mjs",
  );
  assert.equal(
    pkg.scripts["desktop:dist"],
    "node scripts/desktop-pack.mjs --dist",
  );
  assert.equal(
    pkg.scripts["desktop:dev"],
    "node node_modules/vite/bin/vite.js --config apps/web/vite.config.mjs build && node node_modules/electron/cli.js apps/desktop",
  );
  assert.equal(
    pkg.scripts["desktop:pack"],
    "node scripts/desktop-pack.mjs",
  );
  assert.equal(
    pkg.scripts["desktop:test-package"],
    "node --test apps/desktop/test/package-contents.test.mjs",
  );
});
