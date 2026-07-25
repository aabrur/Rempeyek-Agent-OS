import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createDesktopSettingsStore } from "../desktop-settings.mjs";

test("desktop settings bootstrap and accept only allowlisted values", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "rempeyek-desktop-settings-"),
  );
  const file = path.join(root, "desktop-settings.json");
  const store = createDesktopSettingsStore(file);
  assert.deepEqual(store.read(), {
    autoCheck: true,
    autoDownload: true,
    updateChannel: "stable",
    launchAtLogin: false,
    closeBehavior: "tray",
    startMinimized: false,
    nativeNotifications: true,
  });
  const next = store.update({
    launchAtLogin: true,
    closeBehavior: "exit",
    injected: "no",
  });
  assert.equal(next.launchAtLogin, true);
  assert.equal(next.closeBehavior, "exit");
  assert.equal(Object.hasOwn(next, "injected"), false);
  assert.throws(
    () => store.update({ updateChannel: "nightly" }),
    /updateChannel/,
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test("desktop settings replace the document atomically", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "rempeyek-desktop-settings-"),
  );
  const file = path.join(root, "desktop-settings.json");
  const calls = [];
  const deps = {
    ...fs,
    renameSync(from, to) {
      calls.push({ from, to });
      return fs.renameSync(from, to);
    },
  };
  const store = createDesktopSettingsStore(file, deps);
  store.update({ autoCheck: false });
  assert.equal(calls.length >= 2, true);
  assert.equal(calls.at(-1).to, file);
  assert.notEqual(calls.at(-1).from, file);
  assert.equal(store.read().autoCheck, false);
  fs.rmSync(root, { recursive: true, force: true });
});
