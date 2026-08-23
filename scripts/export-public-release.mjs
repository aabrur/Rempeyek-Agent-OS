import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_RELEASE = path.join(ROOT, "dist-release");

// Generated public archives have one dedicated home outside tracked source.
fs.mkdirSync(DIST_RELEASE, { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version;
const sourceZipPath = path.join(DIST_RELEASE, `Rempeyek-Agent-OS-v${version}-Source-Public.zip`);
const installerZipPath = path.join(DIST_RELEASE, `Rempeyek-Agent-OS-v${version}-Windows-Setup.zip`);
const installerPath = path.join(
  ROOT,
  "apps",
  "desktop",
  "dist",
  `Rempeyek-Agent-OS-Setup-${version}.exe`,
);

console.log(`Creating clean public release archives for v${version}...`);

try {
  execFileSync("git", ["archive", "--format=zip", "-o", sourceZipPath, "HEAD"], {
    cwd: ROOT,
    stdio: "inherit",
  });
  console.log(`Source ZIP created: ${sourceZipPath}`);
} catch (error) {
  console.error("Failed to create source ZIP:", error.message);
  process.exit(1);
}

if (!fs.existsSync(installerPath)) {
  console.error(`Missing desktop installer: ${installerPath}`);
  process.exit(1);
}

try {
  execFileSync(
    "powershell",
    [
      "-Command",
      `Compress-Archive -LiteralPath '${installerPath}', '${path.join(ROOT, "README.md")}' -DestinationPath '${installerZipPath}' -Force`,
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
  console.log(`Installer ZIP created: ${installerZipPath}`);
} catch (error) {
  console.error("Failed to create installer ZIP:", error.message);
  process.exit(1);
}

// Keep the latest installer in project root and clean up older versions
try {
  const rootFiles = fs.readdirSync(ROOT);
  for (const file of rootFiles) {
    if (file.startsWith("Rempeyek-Agent-OS-Setup-") && file.endsWith(".exe") && file !== `Rempeyek-Agent-OS-Setup-${version}.exe`) {
      fs.rmSync(path.join(ROOT, file), { force: true });
    }
  }
  fs.copyFileSync(installerPath, path.join(ROOT, `Rempeyek-Agent-OS-Setup-${version}.exe`));
  console.log(`Root installer synced: Rempeyek-Agent-OS-Setup-${version}.exe`);
} catch (e) {
  console.warn("Could not sync root installer:", e.message);
}

console.log("\nExport complete. Public files are ready in dist-release/ and project root.\n");
