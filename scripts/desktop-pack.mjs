import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv.includes("--dist") ? "dist" : "pack";
const builder = path.join(ROOT, "node_modules", "electron-builder", "cli.js");
const vite = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");

function sanitizedEnv() {
  const delimiter = path.delimiter;
  const parts = String(process.env.PATH || "")
    .split(delimiter)
    .filter(entry => entry && !/AppData[\\/]+Roaming[\\/]+npm/i.test(entry));
  const prepend = process.platform === "win32"
    ? ["C:\\Windows\\System32", "C:\\Program Files\\nodejs"]
    : [];
  return {
    ...process.env,
    PATH: [...prepend, ...parts].join(delimiter),
    NPM_CONFIG_LOGLEVEL: "silent",
  };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: sanitizedEnv(),
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [vite, "--config", path.join("apps", "web", "vite.config.mjs"), "build"]);
const builderArgs = ["--projectDir", path.join("apps", "desktop"), "--win"];
if (mode === "pack") builderArgs.push("--dir");
else builderArgs.push("--publish", "never");
run(process.execPath, [builder, ...builderArgs]);
