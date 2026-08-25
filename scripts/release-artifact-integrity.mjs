import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const DEFAULT_VERSION = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
).version;

export function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function writeSha256Sums(dir) {
  const names = fs.readdirSync(dir).filter(name => name.endsWith(".exe")).sort();
  const body = names.map(name => `${sha256File(path.join(dir, name))}  ${name}`).join("\n") + "\n";
  fs.writeFileSync(path.join(dir, "SHA256SUMS.txt"), body);
  return names;
}

export function parseSha256Sums(text) {
  const entries = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})\s+\*?(.+?)\s*$/i);
    if (match) entries.push({ hash: match[1].toLowerCase(), name: path.basename(match[2].trim()) });
  }
  return entries;
}

export function verifyReleaseArtifacts(dir, version = DEFAULT_VERSION) {
  const errors = [];
  const setupName = `Rempeyek-Agent-OS-Setup-${version}.exe`;
  const portableName = `Rempeyek-Agent-OS-Portable-${version}.exe`;
  const required = [setupName, portableName, `${setupName}.blockmap`, "latest.yml", "SHA256SUMS.txt"];
  for (const name of required) {
    if (!fs.existsSync(path.join(dir, name))) errors.push(`missing ${name}`);
  }
  if (errors.length) return { ok: false, errors };

  const sumsPath = path.join(dir, "SHA256SUMS.txt");
  const listed = parseSha256Sums(fs.readFileSync(sumsPath, "utf8"));
  if (!listed.length) errors.push("SHA256SUMS.txt has no checksum lines");

  const byName = new Map(listed.map(entry => [entry.name, entry.hash]));
  for (const name of [setupName, portableName]) {
    const actual = sha256File(path.join(dir, name));
    const expected = byName.get(name);
    if (!expected) errors.push(`SHA256SUMS.txt missing ${name}`);
    else if (expected !== actual) errors.push(`${name} hash mismatch`);
  }

  const latest = fs.readFileSync(path.join(dir, "latest.yml"), "utf8");
  if (!new RegExp(`version:\\s*['\"]?${version.replace(/\./g, "\\.")}\\b`).test(latest)) {
    errors.push(`latest.yml version is not ${version}`);
  }
  if (!latest.includes(setupName)) errors.push("latest.yml does not reference Setup artifact");

  return { ok: errors.length === 0, errors };
}

function copyAndVerify(source, dest) {
  fs.copyFileSync(source, dest);
  const sourceHash = sha256File(source);
  const destHash = sha256File(dest);
  if (sourceHash !== destHash) {
    throw new Error(`hash mismatch after copy: ${path.basename(dest)}`);
  }
  return destHash;
}

export function syncRootInstaller({ source, dest }) {
  if (!fs.existsSync(source)) {
    throw new Error(`missing canonical installer: ${source}`);
  }
  return copyAndVerify(source, dest);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes("--write");
  const dir = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--"));
  if (!dir) {
    console.error("usage: node scripts/release-artifact-integrity.mjs [--write] <artifact-dir>");
    process.exit(1);
  }
  if (write) writeSha256Sums(dir);
  const result = verifyReleaseArtifacts(dir);
  if (!result.ok) {
    console.error("Release artifact integrity failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Release artifact integrity passed: ${dir}`);
}
