import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { APP_VERSION } from "../lib/version.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("README download copy matches APP_VERSION and drops stale release pins", () => {
  const readme = read("README.md");
  const escaped = APP_VERSION.replace(/\./g, "\\.");
  assert.match(readme, new RegExp(`Download v${escaped}`));
  assert.match(readme, new RegExp(`releases/tag/v${escaped}`));
  assert.match(readme, new RegExp(`Rempeyek-Agent-OS-Setup-${escaped}\\.exe`));
  assert.match(readme, /Empty by default/);
  assert.equal(readme.includes("v2.3.9"), false);
  assert.equal(readme.includes("v2.4.2"), false);
});

test("GETTING-STARTED does not auto-register agents and does not claim macOS/Linux desktop", () => {
  const text = read("docs/GETTING-STARTED.md");
  assert.equal(/registering system agents/i.test(text), false);
  assert.match(text, /zero agents/i);
  assert.equal(/macOS/i.test(text), false);
  assert.equal(/Linux/i.test(text), false);
});

test("FIRST-RUN example registry starts empty", () => {
  const text = read("docs/FIRST-RUN.md");
  assert.equal(text.includes("\"nodeCount\": 4"), false);
  assert.match(text, /"nodeCount": 0/);
  assert.match(text, /zero agents|nodeCount is 0/i);
});

test("server doctor export and recovery shell do not hardcode 2.4.2", () => {
  const server = read("apps/web/server.js");
  const recovery = read("apps/web/index.html");
  const escaped = APP_VERSION.replace(/\./g, "\\.");
  assert.match(server, new RegExp(`const APP_VERSION\\s*=\\s*"${escaped}";`));
  assert.equal(server.includes('require("./package.json").version'), false);
  assert.match(server, /appVersion:\s*APP_VERSION/);
  assert.equal(/appVersion:\s*"2\.4\.2"/.test(server), false);
  assert.match(recovery, new RegExp(`Build Version: ${escaped}`));
  assert.equal(recovery.includes("Build Version: 2.4.2"), false);
});

test("legacy web dashboard does not claim 21 registered agents", () => {
  const html = read("web/index.html");
  assert.equal(html.includes("21 Registered Agents"), false);
  assert.match(html, /No registered agents/i);
});
