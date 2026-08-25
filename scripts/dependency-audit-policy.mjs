import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = path.join(
  ROOT,
  "scripts",
  "dependency-audit-policy.json",
);

function normalizedVia(via) {
  return (via || [])
    .map(item => (
      typeof item === "string"
        ? { package: item }
        : {
            source: item?.source ?? null,
            name: item?.name ?? null,
            dependency: item?.dependency ?? null,
            title: item?.title ?? null,
            url: item?.url ?? null,
            severity: item?.severity ?? null,
            range: item?.range ?? null,
          }
    ))
    .sort((left, right) => (
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    ));
}

export function canonicalAuditFindings(report) {
  return Object.entries(report?.vulnerabilities || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, finding]) => ({
      name,
      severity: finding?.severity ?? null,
      isDirect: Boolean(finding?.isDirect),
      via: normalizedVia(finding?.via),
    }));
}

export function auditFingerprint(report) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalAuditFindings(report)))
    .digest("hex");
}

export function evaluateAuditPolicy({
  productionReport,
  fullReport,
  policy,
  now = new Date(),
} = {}) {
  const errors = [];
  if (policy?.schema !== 1) errors.push("audit policy schema must be 1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(policy?.expiresOn || "")) {
    errors.push("audit policy expiresOn must be YYYY-MM-DD");
  } else if (now.toISOString().slice(0, 10) > policy.expiresOn) {
    errors.push(`audit policy expired on ${policy.expiresOn}`);
  }

  const production = productionReport?.vulnerabilities || {};
  if (
    Object.keys(production).length ||
    productionReport?.metadata?.vulnerabilities?.total
  ) {
    errors.push("production dependency audit must contain zero vulnerabilities");
  }

  const findings = canonicalAuditFindings(fullReport);
  for (const finding of findings) {
    if (finding.severity === "critical") {
      errors.push(`${finding.name}: critical findings are never allowed`);
    }
  }
  if (findings.length !== policy?.reviewedFindingCount) {
    errors.push(
      `audit finding count changed: reviewed=${policy?.reviewedFindingCount}, ` +
      `observed=${findings.length}`,
    );
  }
  const observedFingerprint = auditFingerprint(fullReport);
  if (!/^[0-9a-f]{64}$/.test(policy?.reviewedFingerprint || "")) {
    errors.push(
      `audit policy reviewedFingerprint must be a SHA-256 hex value; ` +
      `observed=${observedFingerprint}`,
    );
  } else if (observedFingerprint !== policy.reviewedFingerprint) {
    errors.push(
      `audit fingerprint changed: reviewed=${policy.reviewedFingerprint}, ` +
      `observed=${observedFingerprint}`,
    );
  }
  return errors;
}

function runAudit(args) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("npm_execpath is required; run this policy through npm");
  }
  const result = spawnSync(
    process.execPath,
    [npmCli, "audit", ...args, "--json"],
    {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (!result.stdout?.trim()) {
    throw new Error(result.stderr?.trim() || "npm audit returned no JSON");
  }
  return JSON.parse(result.stdout);
}

function main() {
  const versionSync = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "release-version-sync.mjs")],
    { cwd: ROOT, encoding: "utf8", windowsHide: true },
  );
  if (versionSync.status !== 0) {
    if (versionSync.stdout) process.stdout.write(versionSync.stdout);
    if (versionSync.stderr) process.stderr.write(versionSync.stderr);
    process.exitCode = 1;
    return;
  }
  if (versionSync.stdout) process.stdout.write(versionSync.stdout);

  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, "utf8"));
  const productionReport = runAudit(["--omit=dev"]);
  const fullReport = runAudit([]);
  const errors = evaluateAuditPolicy({
    productionReport,
    fullReport,
    policy,
  });
  if (errors.length) {
    console.error("Release dependency audit policy failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  const reviewed = Object.keys(fullReport.vulnerabilities || {}).length;
  console.log(
    `Release dependency audit policy passed: production=0, ` +
    `reviewed development high=${reviewed}, expires=${policy.expiresOn}.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
