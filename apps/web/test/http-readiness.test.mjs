import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const readinessPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "http-readiness.cjs",
);

test("delayed required module keeps registry unready until it resolves", async () => {
  const { createHttpReadinessRegistry, MODULE_STATES, REQUIRED_HTTP_MODULE_IDS } = require(readinessPath);
  assert.ok(REQUIRED_HTTP_MODULE_IDS.includes("work-lifecycle"));
  assert.ok(REQUIRED_HTTP_MODULE_IDS.includes("publishing-domain"));
  assert.ok(REQUIRED_HTTP_MODULE_IDS.includes("publishing-gateway"));
  assert.ok(REQUIRED_HTTP_MODULE_IDS.includes("publishing-scheduler"));
  assert.ok(REQUIRED_HTTP_MODULE_IDS.includes("switchboard"));
  assert.ok(REQUIRED_HTTP_MODULE_IDS.includes("process-manager"));

  let resolveWork;
  const work = new Promise(resolve => { resolveWork = resolve; });
  const registry = createHttpReadinessRegistry([
    { id: "work-lifecycle", promise: work, required: true },
  ]);
  assert.equal(registry.status("work-lifecycle"), MODULE_STATES.LOADING);
  assert.equal(registry.isReady(), false);

  const raced = await Promise.race([
    registry.awaitReady().then(() => "ready"),
    new Promise(resolve => setTimeout(() => resolve("timeout"), 40)),
  ]);
  assert.equal(raced, "timeout");

  resolveWork({ ok: true });
  await registry.awaitReady();
  assert.equal(registry.isReady(), true);
  assert.equal(registry.status("work-lifecycle"), MODULE_STATES.READY);
});

test("rejected required module becomes failed, not loading, and awaitReady still settles", async () => {
  const { createHttpReadinessRegistry, MODULE_STATES, routeModuleError } = require(readinessPath);
  const registry = createHttpReadinessRegistry([
    { id: "publishing-domain", promise: Promise.reject(new Error("boom")), required: true },
  ]);
  await registry.awaitReady();
  assert.equal(registry.isReady(), true);
  assert.equal(registry.status("publishing-domain"), MODULE_STATES.FAILED);
  const err = routeModuleError(registry, "publishing-domain", {
    loading: "publishing store loading",
    failed: "publishing store unavailable",
  });
  assert.equal(err.state, "unavailable");
  assert.equal(err.error, "publishing store unavailable");
});
