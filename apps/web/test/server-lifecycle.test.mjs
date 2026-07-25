import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const serverPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "server.js",
);

test("importing the server does not bind a listening socket", () => {
  const serverModule = require("../server.js");
  assert.equal(typeof serverModule.createServer, "function");

  const server = serverModule.createServer();
  assert.equal(server.listening, false);
  server.close();
});

test("server creation accepts isolated runtime paths without changing process globals", () => {
  const serverModule = require("../server.js");
  const before = {
    config: process.env.AGENTS_CONFIG,
    state: process.env.AGENT_STATE_DIR,
    vault: process.env.VAULT_PATH,
  };
  const server = serverModule.createServer({
    configPath: "C:\\isolated\\agents.json",
    stateRoot: "C:\\isolated",
    vaultPath: "C:\\isolated\\Vault",
  });
  assert.deepEqual({
    config: process.env.AGENTS_CONFIG,
    state: process.env.AGENT_STATE_DIR,
    vault: process.env.VAULT_PATH,
  }, before);
  server.close();
});

test("desktop child announces an assigned loopback port and enforces its session", async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-desktop-"));
  fs.writeFileSync(
    path.join(stateRoot, "agents.config.json"),
    JSON.stringify({ agency: "Desktop Test", agents: [] }),
  );
  const child = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: "0",
      DASH_HOST: "127.0.0.1",
      AGENT_STATE_DIR: stateRoot,
      AGENTS_CONFIG: path.join(stateRoot, "agents.config.json"),
      VAULT_PATH: path.join(stateRoot, "Vault"),
      DESKTOP_SESSION_TOKEN: "desktop-test-secret",
    },
    silent: true,
  });
  try {
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("desktop child did not send ready IPC")),
        15000,
      );
      child.on("message", message => {
        if (message?.type !== "rempeyek:ready") return;
        clearTimeout(timer);
        resolve(message);
      });
      child.once("exit", code => {
        clearTimeout(timer);
        reject(new Error(`desktop child exited before ready (${code})`));
      });
    });
    assert.equal(Number.isInteger(ready.port), true);
    assert.equal(ready.port > 0, true);
    const origin = `http://127.0.0.1:${ready.port}`;
    assert.equal((await fetch(`${origin}/api/state`)).status, 401);
    assert.equal((await fetch(`${origin}/api/state`, {
      headers: { "x-desktop-session": "desktop-test-secret" },
    })).status, 200);
  } finally {
    child.kill();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
