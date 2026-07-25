import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedExternalUrl,
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
