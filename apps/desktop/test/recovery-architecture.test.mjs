import assert from "node:assert/strict";
import test from "node:test";

import {
  createBootWatchdog,
  createIncidentRecord,
  scrubSensitiveData,
} from "../boot-recovery.mjs";

test("scrubSensitiveData strips tokens, API keys, and full homedir paths", () => {
  const raw = "Error: Failed at C:\\Users\\john_doe\\AppData\\Local\\Rempeyek-Agent-OS with x-desktop-session=a1b2c3d4e5f6 and sk-proj-1234567890abcdef";
  const scrubbed = scrubSensitiveData(raw, "C:\\Users\\john_doe");
  assert.equal(scrubbed.includes("a1b2c3d4e5f6"), false);
  assert.equal(scrubbed.includes("sk-proj-1234567890abcdef"), false);
  assert.equal(scrubbed.includes("john_doe"), false);
  assert.equal(scrubbed.includes("[REDACTED_TOKEN]"), true);
  assert.equal(scrubbed.includes("[REDACTED_API_KEY]"), true);
});

test("createIncidentRecord generates structured user-safe boot incident", () => {
  const incident = createIncidentRecord({
    phase: "bundle-evaluation",
    error: new Error("Failed to fetch /dist/assets/index-main.js"),
    appVersion: "2.4.0",
    packaged: true,
    userHome: "C:\\Users\\testuser",
  });

  assert.ok(incident.incidentId.startsWith("inc_"));
  assert.equal(incident.phase, "bundle-evaluation");
  assert.equal(incident.appVersion, "2.4.0");
  assert.equal(incident.packaged, true);
  assert.equal(incident.retryable, true);
  assert.equal(typeof incident.timestamp, "string");
  assert.equal(incident.userSafeMessage.includes("testuser"), false);
});

test("createBootWatchdog triggers failure when renderer does not send ready signal within timeout", async () => {
  let failedIncident = null;
  const watchdog = createBootWatchdog({
    timeoutMs: 100,
    onBootFailure: (incident) => {
      failedIncident = incident;
    },
  });

  watchdog.start();
  assert.equal(watchdog.isReady(), false);

  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.ok(failedIncident);
  assert.equal(failedIncident.phase, "boot-timeout");
  assert.equal(watchdog.isReady(), false);
});

test("createBootWatchdog resolves successfully when app-ready signal arrives before timeout", async () => {
  let failedIncident = null;
  const watchdog = createBootWatchdog({
    timeoutMs: 200,
    onBootFailure: (incident) => {
      failedIncident = incident;
    },
  });

  watchdog.start();
  watchdog.markPhase("renderer-init");
  watchdog.markPhase("react-mounted");
  watchdog.notifyReady();

  await new Promise((resolve) => setTimeout(resolve, 250));

  assert.equal(failedIncident, null);
  assert.equal(watchdog.isReady(), true);
});

test("createBootWatchdog handles repeated crash loop prevention", () => {
  const watchdog = createBootWatchdog({ maxRetries: 3 });

  assert.deepEqual(watchdog.recordRetryAttempt(1), { retryAllowed: true, attempt: 1 });
  assert.deepEqual(watchdog.recordRetryAttempt(2), { retryAllowed: true, attempt: 2 });
  assert.deepEqual(watchdog.recordRetryAttempt(3), { retryAllowed: true, attempt: 3 });
  assert.deepEqual(watchdog.recordRetryAttempt(4), { retryAllowed: false, attempt: 4 });
});
