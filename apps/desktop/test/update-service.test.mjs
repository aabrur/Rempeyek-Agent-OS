import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createUpdateService } from "../update-service.mjs";

class FakeUpdater extends EventEmitter {
  autoDownload = false;
  allowPrerelease = false;
  checks = 0;
  downloads = 0;
  installs = 0;

  checkForUpdates() {
    this.checks += 1;
    return Promise.resolve();
  }

  downloadUpdate() {
    this.downloads += 1;
    return Promise.resolve();
  }

  quitAndInstall() {
    this.installs += 1;
  }
}

const stableSettings = {
  read: () => ({
    autoCheck: true,
    autoDownload: true,
    updateChannel: "stable",
  }),
};

test("stable updater checks, downloads, and waits for approved restart", async () => {
  const autoUpdater = new FakeUpdater();
  const emitted = [];
  const service = createUpdateService({
    autoUpdater,
    settingsStore: stableSettings,
    lifecycleBusy: () => false,
    emit: state => emitted.push(state),
    now: () => new Date("2026-07-26T00:00:00.000Z"),
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
  });
  service.start();
  assert.equal(autoUpdater.checks, 1);
  autoUpdater.emit("update-available", { version: "2.3.0" });
  assert.equal(autoUpdater.downloads, 1);
  autoUpdater.emit("update-downloaded", { version: "2.3.0" });
  assert.equal(service.snapshot().phase, "ready");
  assert.equal(service.snapshot().checkedAt, "2026-07-26T00:00:00.000Z");
  assert.equal(autoUpdater.installs, 0);
  await service.restartToUpdate();
  assert.equal(autoUpdater.installs, 1);
  assert.equal(emitted.some(state => state.phase === "ready"), true);
});

test("preview channel allows prereleases while stable channel excludes them", () => {
  const stableUpdater = new FakeUpdater();
  createUpdateService({
    autoUpdater: stableUpdater,
    settingsStore: stableSettings,
    lifecycleBusy: () => false,
    emit: () => {},
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
  }).start();
  assert.equal(stableUpdater.allowPrerelease, false);

  const previewUpdater = new FakeUpdater();
  createUpdateService({
    autoUpdater: previewUpdater,
    settingsStore: {
      read: () => ({
        autoCheck: false,
        autoDownload: true,
        updateChannel: "preview",
      }),
    },
    lifecycleBusy: () => false,
    emit: () => {},
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
  }).start();
  assert.equal(previewUpdater.allowPrerelease, true);
});

test("update application is blocked while lifecycle mutation is active", async () => {
  const autoUpdater = new FakeUpdater();
  const service = createUpdateService({
    autoUpdater,
    settingsStore: stableSettings,
    lifecycleBusy: async () => true,
    emit: () => {},
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
  });
  service.start();
  autoUpdater.emit("update-downloaded", { version: "2.3.0" });
  await assert.rejects(
    service.restartToUpdate(),
    /lifecycle operation/,
  );
  assert.equal(autoUpdater.installs, 0);
});

test("restart is rejected until a verified download is ready", async () => {
  const autoUpdater = new FakeUpdater();
  const service = createUpdateService({
    autoUpdater,
    settingsStore: stableSettings,
    lifecycleBusy: () => false,
    emit: () => {},
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
  });
  await assert.rejects(service.restartToUpdate(), /no downloaded update/);
  assert.equal(autoUpdater.installs, 0);
});

test("missing latest.yml is not an error and never exposes HTTP internals", async () => {
  class MissingFeedUpdater extends FakeUpdater {
    checkForUpdates() {
      this.checks += 1;
      return Promise.reject(new Error(
        "Cannot find latest.yml in the latest release artifacts: "
        + "HttpError: 404 Headers: { sensitive: true } "
        + "at C:\\Users\\owner\\AppData\\app.asar",
      ));
    }
  }

  const emitted = [];
  const service = createUpdateService({
    autoUpdater: new MissingFeedUpdater(),
    settingsStore: stableSettings,
    lifecycleBusy: () => false,
    emit: state => emitted.push(state),
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
  });

  await service.checkNow();

  assert.equal(service.snapshot().phase, "not-available");
  assert.equal(service.snapshot().error, null);
  assert.equal(
    emitted.some(state => JSON.stringify(state).includes("C:\\Users")),
    false,
  );
});

test("unexpected updater errors expose only a bounded user-safe message", () => {
  const autoUpdater = new FakeUpdater();
  const service = createUpdateService({
    autoUpdater,
    settingsStore: stableSettings,
    lifecycleBusy: () => false,
    emit: () => {},
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
  });

  autoUpdater.emit(
    "error",
    new Error("Headers: { token: secret } at C:\\Users\\owner\\private"),
  );

  assert.deepEqual(service.snapshot(), {
    phase: "error",
    version: null,
    error: "The desktop updater could not complete this request. "
      + "Check your connection and try again.",
    checkedAt: null,
  });
});
