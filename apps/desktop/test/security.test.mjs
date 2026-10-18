import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTrustedIpcSender,
  isAllowedExternalUrl,
  isAllowedIpcSender,
  isAllowedLocalNavigation,
  withDesktopSessionHeader,
} from "../security.mjs";

test("external links allow only http and https", () => {
  assert.equal(
    isAllowedExternalUrl("https://github.com/aabrur/Rempeyek-Agent-OS"),
    true,
  );
  assert.equal(isAllowedExternalUrl("http://127.0.0.1:4321"), true);
  assert.equal(isAllowedExternalUrl("file:///C:/secret"), false);
  assert.equal(isAllowedExternalUrl("javascript:alert(1)"), false);
});

test("window navigation stays on the owned local origin", () => {
  assert.equal(
    isAllowedLocalNavigation(
      "http://127.0.0.1:51999/settings",
      "http://127.0.0.1:51999",
    ),
    true,
  );
  assert.equal(
    isAllowedLocalNavigation(
      "http://127.0.0.1:52000",
      "http://127.0.0.1:51999",
    ),
    false,
  );
  assert.equal(
    isAllowedLocalNavigation(
      "https://example.com",
      "http://127.0.0.1:51999",
    ),
    false,
  );
});

test("session header is injected only for the exact owned origin", () => {
  const owned = withDesktopSessionHeader({
    url: "http://127.0.0.1:51999/api/state",
    requestHeaders: { Accept: "application/json" },
  }, "http://127.0.0.1:51999", "secret-value");
  assert.equal(owned["x-desktop-session"], "secret-value");
  const external = withDesktopSessionHeader({
    url: "https://example.com/",
    requestHeaders: {
      Accept: "text/html",
      "X-DeSkToP-SeSsIoN": "must-not-leak",
    },
  }, "http://127.0.0.1:51999", "secret-value");
  assert.equal(Object.hasOwn(external, "x-desktop-session"), false);
});

test("IPC sender validation allows only matching owned origin", () => {
  const origin = "http://127.0.0.1:51999";
  assert.equal(
    isAllowedIpcSender({ senderFrame: { origin: "http://127.0.0.1:51999" } }, origin),
    true,
  );
  assert.equal(
    isAllowedIpcSender({ senderFrame: { origin: "http://127.0.0.1:52000" } }, origin),
    false,
  );
  assert.equal(
    isAllowedIpcSender({ senderFrame: { origin: "https://evil.com" } }, origin),
    false,
  );
  assert.equal(
    isAllowedIpcSender({ senderFrame: { url: "http://127.0.0.1:51999/settings" } }, origin),
    true,
  );
  assert.equal(
    isAllowedIpcSender({ senderFrame: { url: "http://127.0.0.1:51999/" } }, origin),
    true,
  );
  assert.equal(
    isAllowedIpcSender({ senderFrame: { url: "http://127.0.0.1:52000/" } }, origin),
    false,
  );
  assert.equal(
    isAllowedIpcSender({ senderFrame: { url: "https://evil.com/" } }, origin),
    false,
  );
  assert.equal(
    isAllowedIpcSender({ senderFrame: { url: "file:///C:/path/index.html" } }, origin),
    false,
  );
  assert.equal(
    isAllowedIpcSender({ sender: { getURL: () => "http://127.0.0.1:51999/api" } }, origin),
    true,
  );
  assert.equal(
    isAllowedIpcSender({ sender: { getURL: () => "https://malicious.org" } }, origin),
    false,
  );
  assert.equal(isAllowedIpcSender(null, origin), false);
  assert.equal(isAllowedIpcSender({}, origin), false);
  assert.equal(isAllowedIpcSender({ senderFrame: { url: "" } }, origin), false);
  assert.equal(isAllowedIpcSender({ senderFrame: { url: "http://127.0.0.1:51999/" } }, null), false);
  assert.equal(isAllowedIpcSender({ senderFrame: { url: "invalid-url" } }, origin), false);

  // Frame isolation: an iframe with null origin or empty url must never fall back to sender.getURL()
  assert.equal(
    isAllowedIpcSender(
      { senderFrame: { origin: "null", url: "" }, sender: { getURL: () => origin } },
      origin,
    ),
    false,
  );
  assert.equal(
    isAllowedIpcSender(
      { senderFrame: { origin: "https://evil.com", url: "" }, sender: { getURL: () => origin } },
      origin,
    ),
    false,
  );
  assert.equal(
    isAllowedIpcSender(
      { senderFrame: { url: "about:blank" }, sender: { getURL: () => origin } },
      origin,
    ),
    false,
  );
  assert.equal(
    isAllowedIpcSender(
      { senderFrame: { url: "" }, sender: { getURL: () => origin } },
      origin,
    ),
    false,
  );
});

test("assertTrustedIpcSender validates sender and fails closed on missing origin", () => {
  const origin = "http://127.0.0.1:51999";
  const validEvent = { senderFrame: { origin } };
  const invalidEvent = { senderFrame: { origin: "https://evil.com" } };

  assert.doesNotThrow(() => assertTrustedIpcSender(validEvent, origin));
  assert.throws(
    () => assertTrustedIpcSender(invalidEvent, origin),
    /unauthorized IPC sender/,
  );
  assert.throws(
    () => assertTrustedIpcSender(validEvent, null),
    /unauthorized IPC sender/,
  );
  assert.throws(
    () => assertTrustedIpcSender(validEvent, undefined),
    /unauthorized IPC sender/,
  );
  assert.throws(
    () => assertTrustedIpcSender(validEvent, ""),
    /unauthorized IPC sender/,
  );
});

