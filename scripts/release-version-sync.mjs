import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_MANIFESTS = [
  "package.json",
  "apps/web/package.json",
  "apps/desktop/package.json",
];
const LOCK_WORKSPACES = ["", "apps/web", "apps/desktop"];
const INDEPENDENT = {
  "packages/ui": "2.1.0",
  "packages/theme-engine": "2.1.0",
  "packages/neural-engine": "2.1.0",
  "packages/design-system": "2.1.0",
};

export function collectVersionDrift(root = ROOT) {
  const errors = [];
  const productVersions = PRODUCT_MANIFESTS.map(relative => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    return { relative, version: pkg.version };
  });
  const expected = productVersions[0].version;
  for (const item of productVersions) {
    if (item.version !== expected) {
      errors.push(`${item.relative}: ${item.version} != ${expected}`);
    }
  }

  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  if (lock.version !== expected) errors.push(`package-lock.json version: ${lock.version} != ${expected}`);
  for (const key of LOCK_WORKSPACES) {
    const entry = lock.packages?.[key];
    if (!entry) {
      errors.push(`package-lock.json missing packages[${JSON.stringify(key)}]`);
      continue;
    }
    if (entry.version !== expected) {
      errors.push(`package-lock.json packages[${key}].version: ${entry.version} != ${expected}`);
    }
  }
  for (const [key, version] of Object.entries(INDEPENDENT)) {
    const entry = lock.packages?.[key];
    if (entry && entry.version !== version) {
      errors.push(`package-lock.json packages[${key}].version: ${entry.version} != ${version}`);
    }
  }
  return { expected, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = collectVersionDrift();
  if (result.errors.length) {
    console.error(`Release version sync failed (${result.errors.length}):`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Release version sync passed: product + lockfile workspaces are ${result.expected}`);
}
