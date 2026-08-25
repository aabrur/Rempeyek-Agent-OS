import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createServer, whenHttpModulesReady } = require(path.join(repoRoot, "apps", "web", "server.js"));

export async function startIsolatedApp() {
  const dist = path.join(repoRoot, "apps", "web", "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    throw new Error("apps/web/dist is missing; run npm run build before test:e2e");
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-e2e-"));
  const configPath = path.join(root, "agents.config.json");
  const vaultPath = path.join(root, "Vault");
  const telemetryDir = path.join(root, "telemetry");
  fs.mkdirSync(vaultPath, { recursive: true });
  fs.mkdirSync(telemetryDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    agency: "E2E Zero Agent OS",
    agents: [],
  }));
  await whenHttpModulesReady();
  const server = createServer({
    configPath,
    stateRoot: root,
    vaultPath,
    telemetryDir,
    userHome: path.join(root, "home"),
    bundleRoot: path.join(repoRoot, "marketplace", "bundles"),
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    root,
    async close() {
      await new Promise(resolve => server.close(resolve));
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
