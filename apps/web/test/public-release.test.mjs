import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tracked = () => execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);

test("public example starts with no personal agents", () => {
  const example = JSON.parse(fs.readFileSync(path.join(ROOT, "agents.config.example.json"), "utf8"));
  assert.deepEqual(example.agents, []);
  assert.equal(String(example.workdir || "").includes("abrur"), false);
});

test("tracked public text contains no owner-specific absolute Windows path", () => {
  const textExtensions = new Set([".md", ".json", ".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx", ".css", ".html", ".txt", ".yml", ".yaml"]);
  const offenders = tracked().filter(file => textExtensions.has(path.extname(file).toLowerCase())).filter(file => {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    return /C:\\Users\\abrur(?:\\|\b)/i.test(text);
  });
  assert.deepEqual(offenders, []);
});

test("personal QA and raster design references are not tracked public assets", () => {
  const offenders = tracked().filter(file => /^(docs\/qa-screenshots|docs\/design-refs)\/.*\.png$/i.test(file));
  assert.deepEqual(offenders, []);
});

test("runtime and personal data boundaries are ignored", () => {
  const ignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
  for (const rule of [".env", "agents.config.json", "Obsidian Vault/", "runtime/", "telemetry/*.jsonl", "apps/web/dist/"]) {
    assert.match(ignore, new RegExp(`^${rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  }
});
