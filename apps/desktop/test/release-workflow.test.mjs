import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const workflow = fs.readFileSync(
  path.join(root, ".github", "workflows", "release.yml"),
  "utf8",
);

test("release workflow classifies prereleases and protects stable latest", () => {
  assert.match(workflow, /id:\s*release_meta/);
  assert.match(
    workflow,
    /prerelease:\s*\$\{\{\s*steps\.release_meta\.outputs\.prerelease\s*\}\}/,
  );
  assert.match(
    workflow,
    /make_latest:\s*\$\{\{\s*steps\.release_meta\.outputs\.prerelease\s*==\s*'false'\s*\}\}/,
  );
});

test("release actions are immutable and signing secrets are step-scoped", () => {
  const uses = [...workflow.matchAll(/^\s*-\s+uses:\s*([^\s#]+)/gm)]
    .map(match => match[1]);
  assert.ok(uses.length >= 4);
  for (const action of uses) {
    assert.match(action, /@[0-9a-f]{40}$/, action);
  }
  const signedJob = workflow.split("  signed-tag-release:")[1];
  const jobPrefix = signedJob.split("    steps:")[0];
  assert.doesNotMatch(jobPrefix, /CSC_LINK|CSC_KEY_PASSWORD/);
  assert.match(workflow, /Build signed desktop artifacts[\s\S]*?env:[\s\S]*?CSC_LINK:/);
  assert.match(workflow, /npm run audit:release/);
});

test("signed tag release requires the web workspace version to match", () => {
  assert.match(
    workflow,
    /\$webVersion\s*=\s*\(Get-Content apps\/web\/package\.json -Raw \| ConvertFrom-Json\)\.version/,
  );
  assert.match(workflow, /\$tagVersion -ne \$webVersion/);
});

