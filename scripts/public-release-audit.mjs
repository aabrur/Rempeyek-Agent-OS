import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const errors = [];
const forbiddenPath = /^(?:\.env$|agents\.config\.json$|Obsidian Vault\/|runtime\/|telemetry\/.*\.jsonl$|apps\/web\/public\/avatars\/[^.])/i;
const personalRaster = /^(?:docs\/qa-screenshots|docs\/design-refs)\/.*\.png$/i;
const textExtensions = new Set([".md", ".json", ".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx", ".css", ".html", ".txt", ".yml", ".yaml"]);
const secretPatterns = [
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\b(?:sk|rk|pk)-(?:live|proj)-[0-9A-Za-z_-]{20,}\b/,
  /\bgh[opusr]_[0-9A-Za-z]{30,}\b/,
  /\bgithub_pat_[0-9A-Za-z_]{30,}\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
];

for (const file of tracked) {
  if (forbiddenPath.test(file)) errors.push(`${file}: forbidden runtime or personal path is tracked`);
  if (personalRaster.test(file)) errors.push(`${file}: personal raster evidence is tracked`);
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/C:\\Users\\abrur(?:\\|\b)/i.test(text)) errors.push(`${file}: owner-specific absolute path`);
  if (secretPatterns.some(pattern => pattern.test(text))) errors.push(`${file}: high-confidence secret pattern`);
}

const example = JSON.parse(fs.readFileSync(path.join(ROOT, "agents.config.example.json"), "utf8"));
if (!Array.isArray(example.agents) || example.agents.length) errors.push("agents.config.example.json: public roster must be empty");

if (errors.length) {
  console.error(`Public release audit failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Public release audit passed: ${tracked.length} tracked paths checked; no runtime data, personal paths, roster, raster evidence, or high-confidence secrets found.`);
}
