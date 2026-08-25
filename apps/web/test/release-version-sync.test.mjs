import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { APP_VERSION } from "../lib/version.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
}

test("package-lock workspace metadata matches 2.4.6 product manifests only", () => {
  const lock = readJson("package-lock.json");
  const root = readJson("package.json");
  const web = readJson("apps/web/package.json");
  const desktop = readJson("apps/desktop/package.json");
  const ui = readJson("packages/ui/package.json");

  assert.equal(APP_VERSION, "2.4.6");
  assert.equal(root.version, APP_VERSION);
  assert.equal(web.version, APP_VERSION);
  assert.equal(desktop.version, APP_VERSION);
  assert.equal(ui.version, "2.1.0");

  assert.equal(lock.version, APP_VERSION);
  assert.equal(lock.packages[""].version, APP_VERSION);
  assert.equal(lock.packages["apps/web"].version, APP_VERSION);
  assert.equal(lock.packages["apps/desktop"].version, APP_VERSION);
  assert.equal(lock.packages["packages/ui"].version, "2.1.0");
});
