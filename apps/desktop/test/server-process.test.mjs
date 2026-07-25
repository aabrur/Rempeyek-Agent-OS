import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { startServerProcess } from "../server-process.mjs";

class FakeChild extends EventEmitter {
  killCalls = 0;
  kill() {
    this.killCalls += 1;
  }
}

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
