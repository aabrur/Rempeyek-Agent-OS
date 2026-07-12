import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME, THEMES, applyTheme, normalizeTheme, readTheme } from "../../../packages/theme-engine/src/themes.js";

test("registry exposes exactly the four approved structural modes", () => {
  assert.deepEqual(THEMES.map(({ id }) => id), ["minimalist", "brutalist", "glassmorph", "cyberpunk"]);
});
test("unknown and malformed persisted values fail safely", () => {
  assert.equal(normalizeTheme(undefined), DEFAULT_THEME);
  assert.equal(normalizeTheme("../../bad"), DEFAULT_THEME);
  assert.equal(normalizeTheme(" GLASSMORPH "), "glassmorph");
});
test("legacy IDs migrate to the closest structural mode", () => {
  assert.equal(normalizeTheme("rempeyek"), "cyberpunk");
  assert.equal(normalizeTheme("quantum-glass"), "glassmorph");
  assert.equal(normalizeTheme("nothing-os"), "brutalist");
});
test("readTheme tolerates unavailable storage", () => {
  assert.equal(readTheme({ getItem() { throw new Error("denied"); } }), DEFAULT_THEME);
});
test("applyTheme applies and persists one canonical ID", () => {
  const root = { dataset: {} }; const writes = [];
  const result = applyTheme("quantum-glass", root, { setItem: (...args) => writes.push(args) });
  assert.equal(result, "glassmorph"); assert.equal(root.dataset.theme, "glassmorph");
  assert.deepEqual(writes, [["aos-theme", "glassmorph"]]);
});
