import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("full agent profile exposes Stop, Gateway run, Log, and Status controls", () => {
  const controls = read("apps/web/src/components/GatewayControls.jsx");
  const detail = read("apps/web/src/components/AgentDetail.jsx");
  assert.match(controls, />\s*Gateway run\s*</);
  assert.match(controls, />\s*Log\s*</);
  assert.match(controls, />\s*Status\s*</);
  assert.match(controls, />\s*Stop\s*</);
  assert.match(detail, /onOpenLog=/);
});
