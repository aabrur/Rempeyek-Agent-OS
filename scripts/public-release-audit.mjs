import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const errors = [];
const deleted = execFileSync("git", ["ls-files", "--deleted"], { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
for (const file of deleted) errors.push(`${file}: tracked file is deleted from the working tree`);
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
  if (!fs.existsSync(path.join(ROOT, file))) continue;
  if (forbiddenPath.test(file)) errors.push(`${file}: forbidden runtime or personal path is tracked`);
  if (personalRaster.test(file)) errors.push(`${file}: personal raster evidence is tracked`);
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/C:[\\/]{1,2}Users[\\/]{1,2}abrur/i.test(text)) errors.push(`${file}: owner-specific absolute path`);
  if (secretPatterns.some(pattern => pattern.test(text))) errors.push(`${file}: high-confidence secret pattern`);
}

const example = JSON.parse(fs.readFileSync(path.join(ROOT, "agents.config.example.json"), "utf8"));
if (!Array.isArray(example.agents) || example.agents.length) errors.push("agents.config.example.json: public roster must be empty");

const desktopPackage = JSON.parse(
  fs.readFileSync(path.join(ROOT, "apps", "desktop", "package.json"), "utf8"),
);
const desktopBuildText = JSON.stringify(desktopPackage.build);
for (const forbidden of [
  "agents.config.json",
  "Obsidian Vault",
  "telemetry/",
  ".env",
  "checkpoint.md",
]) {
  if (desktopBuildText.includes(forbidden)) {
    errors.push(`apps/desktop/package.json: packaged runtime includes ${forbidden}`);
  }
}
if (desktopPackage.build?.nsis?.deleteAppDataOnUninstall !== false) {
  errors.push("apps/desktop/package.json: uninstall must preserve app data");
}

const ciWorkflow = fs.readFileSync(
  path.join(ROOT, ".github", "workflows", "ci.yml"),
  "utf8",
);
for (const gate of [
  "npm test",
  "npm run test:desktop",
  "npm run build",
  "npm run audit:public",
  "npm run desktop:pack",
  "npm run desktop:test-package",
]) {
  if (!ciWorkflow.includes(gate)) {
    errors.push(`ci.yml: missing required gate ${gate}`);
  }
}

const releaseWorkflow = fs.readFileSync(
  path.join(ROOT, ".github", "workflows", "release.yml"),
  "utf8",
);
for (const boundary of [
  "unsigned-desktop-test",
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "DESKTOP_PUBLISHER_SUBJECT",
  "Get-AuthenticodeSignature",
  'Status -ne "Valid"',
  "latest.yml",
  "sha512",
  "npm run audit:release",
  "prerelease:",
  "make_latest:",
]) {
  if (!releaseWorkflow.includes(boundary)) {
    errors.push(`release.yml: missing signed-release boundary ${boundary}`);
  }
}
if (!releaseWorkflow.includes("if: startsWith(github.ref, 'refs/tags/v')")) {
  errors.push("release.yml: public release must be restricted to a v* tag");
}
for (const match of releaseWorkflow.matchAll(
  /^\s*-\s+uses:\s*([^\s#]+)/gm,
)) {
  if (!/@[0-9a-f]{40}$/.test(match[1])) {
    errors.push(`release.yml: action is not pinned to a full SHA: ${match[1]}`);
  }
}

const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
if (!gitignore.split(/\r?\n/).includes("apps/desktop/dist/")) {
  errors.push(".gitignore: generated desktop artifacts must stay untracked");
}

if (errors.length) {
  console.error(`Public release audit failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Public release audit passed: ${tracked.length} tracked paths checked; no runtime data, personal paths, roster, raster evidence, or high-confidence secrets found.`);
}
