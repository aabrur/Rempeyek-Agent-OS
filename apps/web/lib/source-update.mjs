import { execFile } from "node:child_process";

const MAX_BUFFER = 2 * 1024 * 1024;
const MAX_LINE = 4_096;
const MAX_LINES = 1_000;

export function sourceUpdateSteps(root, platform = process.platform) {
  if (!root) throw new Error("source update root is required");
  const npm = platform === "win32" ? "npm.cmd" : "npm";
  return [
    {
      program: "git",
      args: ["status", "--porcelain"],
      cwd: root,
      expectEmpty: true,
    },
    {
      program: "git",
      args: ["pull", "--ff-only"],
      cwd: root,
    },
    { program: npm, args: ["ci"], cwd: root },
    {
      program: npm,
      args: ["run", "build"],
      cwd: root,
    },
  ];
}

function boundedLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, MAX_LINES)
    .map(line => line.slice(0, MAX_LINE));
}

function runStep(step, execFileImpl, onLine) {
  return new Promise((resolve, reject) => {
    execFileImpl(
      step.program,
      step.args,
      {
        cwd: step.cwd,
        windowsHide: true,
        maxBuffer: MAX_BUFFER,
      },
      (error, stdout = "", stderr = "") => {
        for (const line of [
          ...boundedLines(stdout),
          ...boundedLines(stderr),
        ]) {
          onLine(line);
        }
        if (error) return reject(error);
        if (step.expectEmpty && String(stdout).trim()) {
          return reject(new Error("working tree is not clean"));
        }
        resolve();
      },
    );
  });
}

export async function runSourceUpdate({
  root,
  platform = process.platform,
  execFileImpl = execFile,
  onLine = () => {},
} = {}) {
  for (const step of sourceUpdateSteps(root, platform)) {
    await runStep(step, execFileImpl, onLine);
  }
}
