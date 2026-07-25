import assert from "node:assert/strict";
import test from "node:test";

import { desktopRuntime } from "../src/lib/desktop-runtime.mjs";

test("browser runtime is explicit and inert", async () => {
  const runtime = desktopRuntime(null);
  assert.equal(runtime.desktop, false);
  assert.deepEqual(await runtime.getSettings(), null);
  assert.equal(runtime.onUpdateState(() => {}), null);
});

test("desktop runtime delegates only the narrow bridge", async () => {
  const calls = [];
  const runtime = desktopRuntime({
    getRuntime: async () => ({ desktop: true, packaged: true }),
    getSettings: async () => ({ autoCheck: true }),
    openPath: async kind => calls.push(kind),
    arbitrary: () => {
      throw new Error("must not be exposed");
    },
  });
  assert.equal(runtime.desktop, true);
  assert.deepEqual(await runtime.getSettings(), { autoCheck: true });
  await runtime.openPath("vault");
  assert.deepEqual(calls, ["vault"]);
  assert.equal(Object.hasOwn(runtime, "arbitrary"), false);
});
