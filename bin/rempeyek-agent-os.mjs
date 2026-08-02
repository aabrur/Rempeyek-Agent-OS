#!/usr/bin/env node
/* Rempeyek Agent OS launcher.
   Builds the UI on first run, starts the zero-dependency server, opens the browser.
   Usage: node bin/rempeyek-agent-os.mjs  (or double-click start.cmd on Windows)

   Flags:
     --non-interactive   Skip browser open, suppress prompts (CI/headless)
     --portable          Run in portable mode (data stays in repo root)
     --port <N>          Override default port 4321
     status              Print runtime health and exit
     export-data         Export Vault + config as timestamped archive */
import { spawn, spawnSync, execSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

/* ---- argument parsing ---- */
function hasFlag(name) { return args.includes(`--${name}`); }
function flagValue(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}
const subcommand = args.find(a => !a.startsWith("--"));
const nonInteractive = hasFlag("non-interactive") || hasFlag("headless") || !!process.env.CI;
const portableMode = hasFlag("portable");
const portOverride = flagValue("port");
const PORT = Number(portOverride || process.env.PORT || 4321);

/* ---- prerequisites ---- */
const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error(`Rempeyek Agent OS needs Node.js 18 or newer - you are running ${process.version}.`);
  process.exit(1);
}

if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  console.error(`Invalid port: ${portOverride || process.env.PORT}. Must be 0-65535.`);
  process.exit(1);
}

/* ---- subcommands ---- */
if (subcommand === "status") {
  await runStatus();
  process.exit(0);
}

if (subcommand === "export-data") {
  await runExportData();
  process.exit(0);
}

if (subcommand === "help" || hasFlag("help")) {
  printHelp();
  process.exit(0);
}

if (subcommand === "version" || hasFlag("version")) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    console.log(`Rempeyek Agent OS v${pkg.version || "unknown"}`);
  } catch { console.log("Rempeyek Agent OS (version unknown)"); }
  process.exit(0);
}

/* ---- portable mode: set env before server starts ---- */
if (portableMode) {
  process.env.REMPEYEK_MODE = "portable";
  process.env.REMPEYEK_RUNTIME_ROOT = path.join(ROOT, ".rempeyek-data");
  process.env.REMPEYEK_VAULT_PATH = path.join(ROOT, ".rempeyek-data", "Vault");
}

/* ---- install deps if needed ---- */
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
if (!fs.existsSync(path.join(ROOT, "node_modules"))) {
  if (nonInteractive) {
    console.log("Installing dependencies…");
  } else {
    console.log("First run: installing dependencies (npm install)…");
  }
  const r = spawnSync(npmCmd, ["install", "--no-audit", "--no-fund"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/* ---- build UI if needed ---- */
if (!fs.existsSync(path.join(ROOT, "apps", "web", "dist", "index.html"))) {
  console.log("Building the dashboard UI (one-time)…");
  const r = spawnSync(npmCmd, ["run", "build"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/* ---- start server ---- */
console.log(`Starting Rempeyek Agent OS on http://localhost:${PORT} …`);
const env = { ...process.env, PORT: String(PORT) };
const server = spawn(process.execPath, [path.join(ROOT, "apps", "web", "server.js")], {
  cwd: ROOT, stdio: "inherit", env,
});
server.on("exit", code => process.exit(code ?? 0));

/* ---- open browser (unless non-interactive) ---- */
if (!nonInteractive) {
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
} else {
  console.log("Non-interactive mode: browser will not open automatically.");
}

/* ---- subcommand implementations ---- */
async function runStatus() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const runtimeRoot = process.env.REMPEYEK_RUNTIME_ROOT || path.join(localAppData, "Rempeyek-Agent-OS");
  const configDir = path.join(runtimeRoot, "Config");
  const manifestPath = path.join(configDir, "runtime-manifest.json");

  console.log("\n  Rempeyek Agent OS - Status\n");
  console.log(`  Runtime root:  ${runtimeRoot}`);
  console.log(`  Config dir:    ${configDir}`);

  // Check manifest
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      console.log(`  Bootstrapped:  ${manifest.bootstrapCompleted ? "yes" : "no"}`);
      console.log(`  Mode:          ${manifest.mode || "unknown"}`);
      console.log(`  Platform:      ${manifest.platform}/${manifest.architecture}`);
      console.log(`  Version:       ${manifest.applicationVersion || "unknown"}`);
      console.log(`  Vault path:    ${manifest.vaultPath || "not set"}`);
      console.log(`  Last startup:  ${manifest.lastStartupAt || "never"}`);
      console.log(`  Last shutdown: ${manifest.lastShutdownAt || "never"}`);
      console.log(`  Migration ver: ${manifest.migrationVersion || 0}`);
    } catch (e) {
      console.log(`  Manifest:      CORRUPT (${e.message})`);
    }
  } else {
    console.log("  Manifest:      not found (not bootstrapped)");
  }

  // Check Vault
  const vaultPath = process.env.REMPEYEK_VAULT_PATH || path.join(runtimeRoot, "Vault");
  console.log(`  Vault exists:  ${fs.existsSync(vaultPath) ? "yes" : "no"}`);

  // Check port
  console.log(`  Default port:  ${PORT}`);
  await new Promise(resolve => {
    const socket = net.connect(PORT, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); console.log(`  Server:        RUNNING on port ${PORT}`); resolve(); });
    socket.once("error", () => { socket.destroy(); console.log(`  Server:        not running`); resolve(); });
  });

  // Check Node version
  console.log(`  Node.js:       ${process.version}`);
  console.log("");
}

async function runExportData() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const runtimeRoot = process.env.REMPEYEK_RUNTIME_ROOT || path.join(localAppData, "Rempeyek-Agent-OS");
  const vaultPath = process.env.REMPEYEK_VAULT_PATH || path.join(runtimeRoot, "Vault");
  const configDir = path.join(runtimeRoot, "Config");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const exportDir = path.join(ROOT, `rempeyek-export-${timestamp}`);

  console.log("\n  Exporting Rempeyek Agent OS data…\n");

  if (!fs.existsSync(vaultPath) && !fs.existsSync(configDir)) {
    console.error("  Nothing to export: Vault and Config directories do not exist.");
    process.exit(1);
  }

  fs.mkdirSync(exportDir, { recursive: true });

  // Export config
  if (fs.existsSync(configDir)) {
    const configExport = path.join(exportDir, "Config");
    copyDirRecursive(configDir, configExport);
    console.log(`  Config:  exported to ${configExport}`);
  }

  // Export vault (metadata only - not massive session data)
  if (fs.existsSync(vaultPath)) {
    const vaultExport = path.join(exportDir, "Vault");
    copyDirRecursive(vaultPath, vaultExport, { maxDepth: 4, maxFileSize: 1024 * 1024 });
    console.log(`  Vault:   exported to ${vaultExport}`);
  }

  console.log(`\n  Export complete: ${exportDir}\n`);
}

function copyDirRecursive(src, dest, opts = {}, depth = 0) {
  if (opts.maxDepth && depth > opts.maxDepth) return;
  fs.mkdirSync(dest, { recursive: true });
  let entries;
  try { entries = fs.readdirSync(src, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, opts, depth + 1);
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(srcPath);
        if (opts.maxFileSize && stat.size > opts.maxFileSize) continue;
        fs.copyFileSync(srcPath, destPath);
      } catch { /* skip unreadable files */ }
    }
  }
}

function printHelp() {
  console.log(`
  Rempeyek Agent OS

  Usage:
    node bin/rempeyek-agent-os.mjs [command] [options]

  Commands:
    (none)          Start the server and open the dashboard
    status          Show runtime health information and exit
    export-data     Export Vault + config as timestamped directory
    help            Show this help message
    version         Show version

  Options:
    --non-interactive   Skip browser open, suppress prompts (CI/headless)
    --portable          Run in portable mode (data stays in repo root)
    --port <N>          Override default port (default: 4321)
    --help              Show this help message
    --version           Show version

  Environment Variables:
    PORT                        Server port (default: 4321)
    DASH_TOKEN                  Authentication token for remote access
    REMPEYEK_RUNTIME_ROOT       Override runtime data location
    REMPEYEK_VAULT_PATH         Override Vault location
    REMPEYEK_SKILLS_PATH        Override skills warehouse location
    REMPEYEK_MODE               Runtime mode (installed|portable|development)
    CI                          Enables non-interactive mode
`);
}
