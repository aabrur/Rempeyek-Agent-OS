import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

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
