import test from "node:test";
import assert from "node:assert/strict";
import { createAccessPolicy } from "../lib/access-policy.mjs";

const request = ({ method = "GET", host = "127.0.0.1:4321", origin, token, remoteAddress = "127.0.0.1", url = "/api/state" } = {}) => ({
  method,
  url,
  headers: {
    host,
    ...(origin ? { origin } : {}),
    ...(token ? { "x-dash-token": token } : {}),
  },
  socket: { remoteAddress },
});

test("local mode permits loopback hosts and rejects DNS rebinding hosts", () => {
  const policy = createAccessPolicy({});
  assert.equal(policy.authorize(request({ host: "localhost:4321" })).allowed, true);
  assert.equal(policy.authorize(request({ host: "127.0.0.1:4321" })).allowed, true);
  assert.equal(policy.authorize(request({ host: "evil.example:4321" })).status, 403);
});

test("remote mode fails closed unless token and allowed origins are configured", () => {
  assert.throws(() => createAccessPolicy({ DASH_REMOTE: "1" }), /DASH_TOKEN/);
  assert.throws(() => createAccessPolicy({ DASH_REMOTE: "1", DASH_TOKEN: "secret" }), /DASH_ALLOWED_ORIGINS/);
});

test("remote mode requires the token for every API request, including loopback clients", () => {
  const policy = createAccessPolicy({
    DASH_REMOTE: "1",
    DASH_TOKEN: "secret",
    DASH_ALLOWED_ORIGINS: "https://agent.example",
  });
  const missing = policy.authorize(request({ host: "agent.example", remoteAddress: "127.0.0.1" }));
  assert.equal(missing.status, 401);
  assert.equal(policy.authorize(request({ host: "agent.example", token: "secret" })).allowed, true);
});

test("remote Host must match an allowed origin", () => {
  const policy = createAccessPolicy({
    DASH_REMOTE: "1",
    DASH_TOKEN: "secret",
    DASH_ALLOWED_ORIGINS: "https://agent.example,https://ops.example:8443",
  });
  assert.equal(policy.authorize(request({ host: "evil.example", token: "secret" })).status, 403);
  assert.equal(policy.authorize(request({ host: "ops.example:8443", token: "secret" })).allowed, true);
});

test("remote mutations require an exact allowed Origin", () => {
  const policy = createAccessPolicy({
    DASH_REMOTE: "1",
    DASH_TOKEN: "secret",
    DASH_ALLOWED_ORIGINS: "https://agent.example",
  });
  const base = { method: "POST", host: "agent.example", token: "secret" };
  assert.equal(policy.authorize(request(base)).status, 403);
  assert.equal(policy.authorize(request({ ...base, origin: "https://evil.example" })).status, 403);
  assert.equal(policy.authorize(request({ ...base, origin: "https://agent.example" })).allowed, true);
});

test("policy never supplies permissive CORS headers", () => {
  const policy = createAccessPolicy({});
  assert.deepEqual(policy.responseHeaders, {});
});
