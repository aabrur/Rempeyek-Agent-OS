import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_RELEASE = path.join(ROOT, "dist-release");

// 1. Ensure dist-release directory exists
if (!fs.existsSync(DIST_RELEASE)) {
  fs.mkdirSync(DIST_RELEASE, { recursive: true });
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version || "2.2.2";
const zipName = `Rempeyek-Agent-OS-v${version}-Source-Public.zip`;
const installerZipName = `Rempeyek-Agent-OS-v${version}-Windows-Setup.zip`;

const sourceZipPath = path.join(DIST_RELEASE, zipName);
const installerZipPath = path.join(DIST_RELEASE, installerZipName);

console.log(`📦 Creating clean public release archives for v${version}...`);

// 2. Export clean public source ZIP (respects .gitattributes export-ignore)
try {
  execFileSync("git", ["archive", "--format=zip", "-o", sourceZipPath, "HEAD"], {
    cwd: ROOT,
    stdio: "inherit",
  });
  console.log(`✅ Source ZIP created: ${sourceZipPath}`);
} catch (err) {
  console.error("❌ Failed to create source ZIP:", err.message);
  process.exit(1);
}

// 3. Create clean Windows installer ZIP (Installer EXE + README)
try {
  const installerExe = `Rempeyek-Agent-OS-Setup-${version}.exe`;
  const installerPath = path.join(ROOT, installerExe);
  if (fs.existsSync(installerPath)) {
    execFileSync(
      "powershell",
      [
        "-Command",
        `Compress-Archive -Path '${installerPath}', '${path.join(ROOT, "README.md")}' -DestinationPath '${installerZipPath}' -Force`,
      ],
      { cwd: ROOT, stdio: "inherit" },
    );
    console.log(`✅ Installer ZIP created: ${installerZipPath}`);
  }
} catch (err) {
  console.warn("⚠️ Could not create installer zip:", err.message);
}

console.log("\n✨ Export complete! Clean public files ready in dist-release/\n");
