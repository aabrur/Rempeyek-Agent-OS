import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const SOURCE_REF = "b45cc6b9c686c30615b971f880c532b1ed48e80b";
const SOURCE_URL = "https://github.com/aabrur/hypertaks-agent";
const ROOTS = [
  ".agents/plugins/hypertaks.json",
  "skills/hypertaks",
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..");
const expectedTarget = path.resolve(
  repositoryRoot,
  "marketplace",
  "bundles",
  "hypertaks-agent",
);

const inside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative);
};

async function hash(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function copyReviewed(sourceRoot, relative, destinationRoot, files) {
  const source = path.resolve(sourceRoot, relative);
  const destination = path.resolve(destinationRoot, relative);
  if (!inside(sourceRoot, source) || !inside(destinationRoot, destination)) {
    throw new Error(`reviewed path escapes its root: ${relative}`);
  }
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) throw new Error(`symlink is not allowed: ${relative}`);
  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      await copyReviewed(
        sourceRoot,
        path.join(relative, entry.name),
        destinationRoot,
        files,
      );
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`unsupported source entry: ${relative}`);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  const manifestPath = path.relative(destinationRoot, destination).replaceAll("\\", "/");
  files.push({ path: manifestPath, sha256: await hash(destination) });
}

async function main() {
  if (process.argv.length !== 3) {
    throw new Error("usage: node scripts/sync-hypertaks-bundle.mjs <source-checkout>");
  }
  const sourceRoot = path.resolve(process.argv[2]);
  const target = expectedTarget;
  if (!inside(repositoryRoot, target) ||
      target !== path.join(repositoryRoot, "marketplace", "bundles", "hypertaks-agent")) {
    throw new Error("refusing unverified bundle destination");
  }

  const revision = (await run("git", ["-C", sourceRoot, "rev-parse", "HEAD"], {
    windowsHide: true,
    encoding: "utf8",
  })).stdout.trim();
  if (revision !== SOURCE_REF) {
    throw new Error(`source ref mismatch: expected ${SOURCE_REF}, received ${revision}`);
  }
  const dirty = (await run(
    "git",
    ["-C", sourceRoot, "status", "--porcelain", "--", ...ROOTS],
    { windowsHide: true, encoding: "utf8" },
  )).stdout.trim();
  if (dirty) throw new Error(`reviewed source paths are dirty:\n${dirty}`);

  for (const relative of ROOTS) {
    await fs.access(path.resolve(sourceRoot, relative));
  }

  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  const files = [];
  for (const relative of ROOTS) {
    await copyReviewed(sourceRoot, relative, target, files);
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schemaVersion: 1,
    entityId: "hypertaks-agent",
    sourceUrl: SOURCE_URL,
    sourceRef: SOURCE_REF,
    roots: ROOTS,
    files,
  };
  await fs.writeFile(
    path.join(target, "bundle.manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`synced ${files.length} files from ${SOURCE_REF}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
