import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SOURCE_URL = "https://github.com/aabrur/hypertaks-agent";
const SOURCE_REF = "b45cc6b9c686c30615b971f880c532b1ed48e80b";

const hash = file =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const inside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative);
};

function filesUnder(root) {
  const files = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        throw new Error("managed bundle may not contain symbolic links");
      }
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files.push(absolute);
    }
  };
  walk(root);
  return files.sort((left, right) => left.localeCompare(right));
}

export function buildHypertaksCopyPlan({ sourceRoot, userHome, kind }) {
  if (!sourceRoot || !userHome) throw new Error("sourceRoot and userHome are required");
  if (!["plugin", "skill"].includes(kind)) throw new Error("kind must be plugin or skill");
  const targetRoot = path.join(userHome, ".agents");
  const pairs = kind === "skill"
    ? [[
        path.join(sourceRoot, "skills", "hypertaks"),
        path.join(targetRoot, "skills", "hypertaks"),
      ]]
    : [
        [
          path.join(sourceRoot, ".agents", "plugins", "hypertaks.json"),
          path.join(targetRoot, "plugins", "hypertaks.json"),
        ],
        [
          path.join(sourceRoot, "skills", "hypertaks"),
          path.join(targetRoot, "skills", "hypertaks"),
        ],
      ];
  return pairs.map(([from, to]) => ({ from, to, sourceRoot, targetRoot }));
}

function expandedFiles(plan) {
  const files = [];
  for (const item of plan) {
    const sourceIsDirectory = fs.statSync(item.from).isDirectory();
    const sources = sourceIsDirectory ? filesUnder(item.from) : [item.from];
    for (const source of sources) {
      const relative = sourceIsDirectory ? path.relative(item.from, source) : "";
      const target = relative ? path.join(item.to, relative) : item.to;
      if (!inside(item.sourceRoot, source) || !inside(item.targetRoot, target)) {
        throw new Error("bundle file escapes its root");
      }
      files.push({ source, target });
    }
  }
  return files;
}

export function inspectCopyPlan(plan) {
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new Error("non-empty copy plan is required");
  }
  for (const item of plan) {
    if (!inside(item.sourceRoot, item.from) || !inside(item.targetRoot, item.to)) {
      throw new Error("bundle path escapes its root");
    }
    if (!fs.existsSync(item.from)) {
      throw new Error(`missing reviewed source: ${item.from}`);
    }
    if (fs.lstatSync(item.from).isSymbolicLink()) {
      throw new Error("managed bundle may not contain symbolic links");
    }
  }
  const files = expandedFiles(plan);
  const collisions = files
    .filter(file => fs.existsSync(file.target))
    .map(file => file.target);
  return { collisions, files };
}

export function applyCopyPlan(plan, receiptPath) {
  const check = inspectCopyPlan(plan);
  if (check.collisions.length) {
    return { ok: false, collisions: check.collisions };
  }

  const copied = [];
  try {
    for (const file of check.files) {
      fs.mkdirSync(path.dirname(file.target), { recursive: true });
      fs.copyFileSync(file.source, file.target, fs.constants.COPYFILE_EXCL);
      copied.push(file.target);
    }
    const receipt = {
      schemaVersion: 1,
      entityId: "hypertaks-agent",
      sourceUrl: SOURCE_URL,
      sourceRef: SOURCE_REF,
      installedAt: new Date().toISOString(),
      files: copied.map(file => ({ path: file, sha256: hash(file) })),
    };
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    const temporary = `${receiptPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, receiptPath);
    return { ok: true, receipt };
  } catch (error) {
    for (const file of copied.reverse()) {
      try { fs.unlinkSync(file); } catch {}
    }
    throw error;
  }
}

export function removeManagedFiles(receiptPath) {
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  if (receipt.schemaVersion !== 1 || !Array.isArray(receipt.files)) {
    throw new Error("invalid managed bundle receipt");
  }
  const removed = [];
  const preserved = [];
  for (const file of receipt.files) {
    if (!fs.existsSync(file.path)) continue;
    if (hash(file.path) !== file.sha256) {
      preserved.push(file.path);
      continue;
    }
    fs.unlinkSync(file.path);
    removed.push(file.path);
  }
  return { removed, preserved };
}
