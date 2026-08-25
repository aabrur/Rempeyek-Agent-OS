import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("E2E release gate is declared and cannot silently skip the browser", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts["test:e2e"], "playwright test");
  assert.ok(pkg.devDependencies?.["@playwright/test"]);
  const spec = fs.readFileSync(path.join(ROOT, "tests", "playwright", "ui-all-buttons.spec.mjs"), "utf8");
  assert.doesNotMatch(spec, /Verification via Playwright Request \/ HTTP API/);
  assert.match(spec, /Playwright Chromium is required/);
  const ci = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(ci, /npm run test:e2e/);
  assert.match(ci, /playwright install/);
});
