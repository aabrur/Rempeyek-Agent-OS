import assert from "node:assert/strict";
import test from "node:test";

import {
  formatUserSafeErrorMessage,
  evaluateBootPhaseStatus,
} from "../lib/boot-recovery-helpers.mjs";

test("evaluateBootPhaseStatus maps active startup phases correctly", () => {
  const status = evaluateBootPhaseStatus("react-mounted");
  assert.equal(status.shell, "ok");
  assert.equal(status.service, "ok");
  assert.equal(status.renderer, "ok");
  assert.equal(status.bundle, "ok");
  assert.equal(status.api, "pending");
});

test("evaluateBootPhaseStatus handles startup failure at bundle phase", () => {
  const status = evaluateBootPhaseStatus("bundle-evaluation-failed");
  assert.equal(status.shell, "ok");
  assert.equal(status.service, "ok");
  assert.equal(status.renderer, "ok");
  assert.equal(status.bundle, "error");
  assert.equal(status.api, "pending");
});

test("formatUserSafeErrorMessage sanitizes raw error objects and paths", () => {
  const error = new Error("Failed to load script at C:\\Users\\secret_user\\AppData\\Local\\Rempeyek-Agent-OS\\apps\\web\\dist\\assets\\index.js with token 1234567890abcdef1234567890abcdef");
  const formatted = formatUserSafeErrorMessage(error, "C:\\Users\\secret_user");
  assert.equal(formatted.includes("secret_user"), false);
  assert.equal(formatted.includes("1234567890abcdef"), false);
  assert.equal(formatted.includes("[REDACTED_PATH]"), true);
  assert.equal(formatted.includes("[REDACTED_TOKEN]"), true);
});
