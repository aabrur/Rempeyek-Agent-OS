import assert from "node:assert/strict";
import test from "node:test";

import { createDesktopNotifier } from "../notification-service.mjs";

class FakeNotification {
  static shown = [];
  static isSupported() {
    return true;
  }
  constructor(options) {
    this.options = options;
  }
  show() {
    FakeNotification.shown.push(this.options);
  }
}

test("native update notifications honor settings and deduplicate milestones", () => {
  FakeNotification.shown = [];
  let enabled = true;
  const notify = createDesktopNotifier({
    NotificationImpl: FakeNotification,
    settingsStore: {
      read: () => ({ nativeNotifications: enabled }),
    },
  });

  assert.equal(notify({ phase: "available", version: "2.3.0" }), true);
  assert.equal(notify({ phase: "available", version: "2.3.0" }), false);
  assert.equal(notify({ phase: "ready", version: "2.3.0" }), true);
  enabled = false;
  assert.equal(notify({ phase: "ready", version: "2.4.0" }), false);
  assert.deepEqual(
    FakeNotification.shown.map(item => item.title),
    ["Update available", "Update ready"],
  );
});

test("unsupported platforms and unrelated states stay silent", () => {
  const notify = createDesktopNotifier({
    NotificationImpl: {
      isSupported: () => false,
    },
    settingsStore: {
      read: () => ({ nativeNotifications: true }),
    },
  });
  assert.equal(notify({ phase: "checking" }), false);
  assert.equal(notify({ phase: "ready", version: "2.3.0" }), false);
});
