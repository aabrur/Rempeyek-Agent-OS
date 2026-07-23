import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyCopyPlan,
  buildHypertaksCopyPlan,
  inspectCopyPlan,
  removeManagedFiles,
} from "../lib/managed-bundle.mjs";

const hash = file =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

test("Hypertaks plan targets only managed plugin and skill paths", () => {
  const plan = buildHypertaksCopyPlan({
    sourceRoot: "C:\\cache\\hypertaks",
    userHome: "C:\\Users\\test",
    kind: "plugin",
  });
  assert.deepEqual(plan.map(item => item.to.replaceAll("\\", "/")), [
    "C:/Users/test/.agents/plugins/hypertaks.json",
    "C:/Users/test/.agents/skills/hypertaks",
  ]);
});

test("committed bundle matches its pinned source ref and every recorded hash", () => {
  const root = path.resolve("marketplace/bundles/hypertaks-agent");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "bundle.manifest.json"), "utf8"),
  );
  assert.equal(
    manifest.sourceRef,
    "b45cc6b9c686c30615b971f880c532b1ed48e80b",
  );
  assert.deepEqual(manifest.roots, [
    ".agents/plugins/hypertaks.json",
    "skills/hypertaks",
  ]);

  const actual = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`unexpected symlink: ${absolute}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.name !== "bundle.manifest.json") {
        actual.push(path.relative(root, absolute).replaceAll("\\", "/"));
      }
    }
  };
  walk(root);
  assert.deepEqual(actual.sort(), manifest.files.map(file => file.path).sort());
  for (const file of manifest.files) {
    const absolute = path.resolve(root, file.path);
    assert.equal(absolute.startsWith(path.resolve(root) + path.sep), true);
    assert.equal(hash(absolute), file.sha256);
  }
});

test("Git preserves exact bundle bytes across platforms", () => {
  const attributes = fs.readFileSync(path.resolve(".gitattributes"), "utf8");
  assert.match(
    attributes,
    /^marketplace\/bundles\/hypertaks-agent\/\*\* -text$/m,
  );
});

test("install refuses collisions and uninstall preserves user edits", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-bundle-"));
  const source = path.join(root, "source");
  const home = path.join(root, "home");
  const receipt = path.join(root, "receipt.json");
  try {
    fs.mkdirSync(path.join(source, ".agents", "plugins"), { recursive: true });
    fs.mkdirSync(path.join(source, "skills", "hypertaks"), { recursive: true });
    fs.writeFileSync(
      path.join(source, ".agents", "plugins", "hypertaks.json"),
      "{\"name\":\"hypertaks\"}\n",
    );
    fs.writeFileSync(
      path.join(source, "skills", "hypertaks", "SKILL.md"),
      "# Hypertaks\n",
    );

    const plan = buildHypertaksCopyPlan({
      sourceRoot: source,
      userHome: home,
      kind: "plugin",
    });
    assert.deepEqual(inspectCopyPlan(plan).collisions, []);
    assert.equal(applyCopyPlan(plan, receipt).ok, true);

    const skill = path.join(home, ".agents", "skills", "hypertaks", "SKILL.md");
    fs.appendFileSync(skill, "\nuser edit\n");
    const removed = removeManagedFiles(receipt);
    assert.deepEqual(removed.preserved, [skill]);
    assert.equal(
      fs.existsSync(path.join(home, ".agents", "plugins", "hypertaks.json")),
      false,
    );
    assert.equal(fs.existsSync(skill), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
