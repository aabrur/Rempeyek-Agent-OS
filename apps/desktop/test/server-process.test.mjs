import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  buildServerEnvironment,
  startServerProcess,
} from "../server-process.mjs";

class FakeChild extends EventEmitter {
  killCalls = 0;
  kill() {
    this.killCalls += 1;
  }
}

test("desktop server environment removes inherited source and remote overrides", () => {
  const env = buildServerEnvironment({
    baseEnv: {
      SystemRoot: "C:\\Windows",
      PATH: "C:\\Tools",
      AGENT_STATE_DIR: "C:\\WrongState",
      AGENTS_CONFIG: "C:\\Outside\\agents.json",
      VAULT_PATH: "C:\\Outside\\Vault",
      DASH_REMOTE: "1",
      DASH_TOKEN: "wrong-token",
      DASH_ALLOWED_ORIGINS: "https://outside.example",
      DASH_HOST: "0.0.0.0",
      PORT: "9999",
      DESKTOP_SESSION_TOKEN: "old-token",
    },
    stateRoot: "C:\\State",
    desktopToken: "desktop-token",
  });

  assert.equal(env.SystemRoot, "C:\\Windows");
  assert.equal(env.PATH, "C:\\Tools");
  assert.equal(env.AGENT_STATE_DIR, "C:\\State");
  assert.equal(env.DESKTOP_SESSION_TOKEN, "desktop-token");
  assert.equal(env.DASH_HOST, "127.0.0.1");
  assert.equal(env.PORT, "0");
  for (const key of [
    "AGENTS_CONFIG",
    "VAULT_PATH",
    "DASH_REMOTE",
    "DASH_TOKEN",
    "DASH_ALLOWED_ORIGINS",
  ]) {
    assert.equal(Object.hasOwn(env, key), false, key);
  }
});

test("server child resolves only after a valid ready message", async () => {
  const child = new FakeChild();
  const started = startServerProcess({
    forkImpl: () => child,
    execPath: "electron.exe",
    serverPath: "server.js",
    stateRoot: "C:\\State",
    desktopToken: "token",
    timeoutMs: 100,
  });
  child.emit("message", { type: "rempeyek:ready", port: 51999 });
  const result = await started;
  assert.equal(result.origin, "http://127.0.0.1:51999");
  result.stop();
  assert.equal(child.killCalls, 1);
});

test("startup rejects on timeout and kills the child", async () => {
  const child = new FakeChild();
  await assert.rejects(startServerProcess({
    forkImpl: () => child,
    execPath: "electron.exe",
    serverPath: "server.js",
    stateRoot: "C:\\State",
    desktopToken: "token",
    timeoutMs: 5,
  }), /did not become ready/);
  assert.equal(child.killCalls, 1);
});
