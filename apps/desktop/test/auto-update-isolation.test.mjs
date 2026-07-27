import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createUpdateService } from "../update-service.mjs";

class FakeAutoUpdater extends EventEmitter {
  constructor() {
    super();
    this.allowPrerelease = false;
    this.autoDownload = false;
    this.checkCalled = false;
    this.downloadCalled = false;
    this.quitAndInstallCalled = false;
  }
  checkForUpdates() {
    this.checkCalled = true;
    return Promise.resolve({ version: "2.3.0" });
  }
  downloadUpdate() {
    this.downloadCalled = true;
    return Promise.resolve();
  }
  quitAndInstall(isSilent, isForceRunAfter) {
    this.quitAndInstallCalled = true;
  }
}

class FakeSettingsStore {
  constructor(data = {}) {
    this.data = { autoCheck: true, autoDownload: false, updateChannel: "stable", ...data };
  }
  read() {
    return { ...this.data };
  }
  write(patch) {
    this.data = { ...this.data, ...patch };
  }
}

test("update-service redacts raw updater exceptions and blocks restart during active lifecycle operations", async () => {
  const autoUpdater = new FakeAutoUpdater();
  const settingsStore = new FakeSettingsStore();
  let busy = false;
  const events = [];

  const service = createUpdateService({
    autoUpdater,
    settingsStore,
    lifecycleBusy: async () => busy,
    emit: patch => events.push(patch),
  });

  // Emulate update downloaded state
  autoUpdater.emit("update-downloaded", { version: "2.3.0" });
  assert.equal(service.snapshot().phase, "ready");

  // Attempt restart while lifecycle operation is busy
  busy = true;
  await assert.rejects(
    service.restartToUpdate(),
    /finish the active lifecycle operation before restarting/
  );
  assert.equal(autoUpdater.quitAndInstallCalled, false);

  // When not busy, restart succeeds
  busy = false;
  await service.restartToUpdate();
  assert.equal(autoUpdater.quitAndInstallCalled, true);
});

test("update-service redacts raw network error messages", () => {
  const autoUpdater = new FakeAutoUpdater();
  const settingsStore = new FakeSettingsStore();
  const events = [];

  const service = createUpdateService({
    autoUpdater,
    settingsStore,
    lifecycleBusy: async () => false,
    emit: patch => events.push(patch),
  });

  // Emit raw error
  autoUpdater.emit("error", new Error("https://github.com/aabrur/Rempeyek-Agent-OS/releases/download/v2.3.0/latest.yml 500 Internal Server Error"));
  const lastEvent = events[events.length - 1];
  assert.equal(lastEvent.phase, "error");
  assert.equal(lastEvent.error, "The desktop updater could not complete this request. Check your connection and try again.");
});
