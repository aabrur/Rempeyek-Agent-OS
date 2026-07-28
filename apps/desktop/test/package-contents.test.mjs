import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const root = path.join(desktopRoot, "dist", "win-unpacked", "resources");
const distRoot = path.join(desktopRoot, "dist");

test("packaged app contains required runtime and excludes user data", {
  skip: fs.existsSync(root)
    ? false
    : "desktop package has not been built in this checkout",
}, () => {
  assert.equal(fs.existsSync(path.join(root, "app.asar")), true);
  assert.equal(
    fs.existsSync(
      path.join(root, "app-root", "apps", "web", "server.js"),
    ),
    true,
  );
  assert.equal(
    fs.existsSync(
      path.join(root, "app-root", "apps", "web", "dist", "index.html"),
    ),
    true,
  );
  const names = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else names.push(path.relative(root, full).replaceAll("\\", "/"));
    }
  };
  walk(root);
  for (const forbidden of [
    "agents.config.json",
    "Obsidian Vault/",
    "telemetry/",
    ".env",
    "checkpoint.md",
  ]) {
    assert.equal(
      names.some(name => name.includes(forbidden)),
      false,
      forbidden,
    );
  }
  assert.equal(
    fs.existsSync(
      path.join(
        root,
        "app-root",
        "marketplace",
        "bundles",
        "hypertaks-agent",
        "bundle.manifest.json",
      ),
    ),
    true,
  );
  assert.equal(
    fs.existsSync(
      path.join(
        root,
        "app-root",
        "prompts",
        "operational-synchronization.md",
      ),
    ),
    true,
  );
});

const sourceWebDist = path.resolve(desktopRoot, "..", "web", "dist");
const packagedWebDist = path.join(
  root,
  "app-root",
  "apps",
  "web",
  "dist",
);

function assetPathsFromHtml(html) {
  return [...html.matchAll(/(?:src|href)=["']\/(assets\/[^"']+)["']/g)]
    .map(match => match[1]);
}

test("packaged renderer exactly matches the built web entry and assets", {
  skip: fs.existsSync(root)
    ? false
    : "desktop package has not been built in this checkout",
}, () => {
  const sourceIndex = fs.readFileSync(path.join(sourceWebDist, "index.html"));
  const packagedIndex = fs.readFileSync(path.join(packagedWebDist, "index.html"));
  assert.deepEqual(packagedIndex, sourceIndex);

  for (const assetPath of assetPathsFromHtml(sourceIndex.toString("utf8"))) {
    const sourceAsset = fs.readFileSync(path.join(sourceWebDist, assetPath));
    const packagedAsset = fs.readFileSync(path.join(packagedWebDist, assetPath));
    assert.deepEqual(packagedAsset, sourceAsset, assetPath);
  }
});

test("latest.yml names an existing installer with the recorded SHA-512", {
  skip: fs.existsSync(path.join(distRoot, "latest.yml"))
    ? false
    : "desktop release metadata has not been built in this checkout",
}, () => {
  const metadata = fs.readFileSync(
    path.join(distRoot, "latest.yml"),
    "utf8",
  );
  const entry = metadata.match(
    /^\s*-\s+url:\s*(?<url>[^\r\n]+)\r?\n\s+sha512:\s*(?<sha>[A-Za-z0-9+/=]{40,})\s*$/m,
  );
  assert.ok(entry, "latest.yml must contain an installer SHA-512");
  const artifactName = decodeURIComponent(entry.groups.url.trim());
  const artifactPath = path.join(distRoot, artifactName);
  assert.equal(fs.existsSync(artifactPath), true, artifactName);
  const actual = crypto
    .createHash("sha512")
    .update(fs.readFileSync(artifactPath))
    .digest("base64");
  assert.equal(actual, entry.groups.sha);
});
