#!/usr/bin/env node
/* Rempeyek Agent OS launcher.
   Builds the UI on first run, starts the zero-dependency server, opens the browser.
   Usage: node bin/rempeyek-agent-os.mjs  (or double-click start.cmd on Windows) */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4321);
const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error(`Rempeyek Agent OS needs Node.js 18 or newer — you are running ${process.version}.`);
  process.exit(1);
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

if (!fs.existsSync(path.join(ROOT, "node_modules"))) {
  console.log("First run: installing dependencies (npm install)…");
  const r = spawnSync(npmCmd, ["install", "--no-audit", "--no-fund"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!fs.existsSync(path.join(ROOT, "apps", "web", "dist", "index.html"))) {
  console.log("Building the dashboard UI (one-time)…");
  const r = spawnSync(npmCmd, ["run", "build"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`Starting Rempeyek Agent OS on http://localhost:${PORT} …`);
const server = spawn(process.execPath, [path.join(ROOT, "apps", "web", "server.js")], {
  cwd: ROOT, stdio: "inherit", env: process.env,
});
server.on("exit", code => process.exit(code ?? 0));

/* Open the browser once the port answers (first launch may take a moment). */
const openBrowser = () => {
  const url = `http://localhost:${PORT}`;
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
      : ["xdg-open", [url]];
  spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref();
  console.log(`Dashboard ready: ${url}`);
  console.log("First steps: open Marketplace to install/register your agents, and Settings to pick a theme.");
};

let tries = 0;
const probe = () => {
  const socket = net.connect(PORT, "127.0.0.1");
  socket.once("connect", () => { socket.destroy(); openBrowser(); });
  socket.once("error", () => {
    socket.destroy();
    if (++tries < 60) setTimeout(probe, 500);
  });
};
setTimeout(probe, 700);
