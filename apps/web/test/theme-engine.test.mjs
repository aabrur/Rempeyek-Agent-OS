import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME, THEMES, activateTheme, applyTheme, normalizeTheme, readTheme, themeSelectionFromKey } from "../../../packages/theme-engine/src/themes.js";

test("registry exposes exactly the four approved structural modes", () => {
  assert.deepEqual(THEMES.map(({ id }) => id), ["minimalist", "brutalist", "glassmorph", "cyberpunk"]);
  assert.deepEqual(THEMES.find(({ id }) => id === "minimalist"), {
    id: "minimalist", name: "Minimalist", description: "Calm, quiet, and content-first", sw: "#805B3E", bg: "#F4EFE6",
  });
  assert.deepEqual(THEMES.find(({ id }) => id === "cyberpunk"), {
    id: "cyberpunk", name: "Cyberpunk", description: "Signal-grid terminal with controlled neon", sw: "#C6FF39", bg: "#080A0D",
  });
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

test("theme activation applies the canonical attribute before reading its accent", () => {
  const root = { dataset: {} };
  const activated = activateTheme("minimalist", root, { setItem() {} }, currentRoot => {
    assert.equal(currentRoot.dataset.theme, "minimalist");
    return "#805B3E";
  });
  assert.deepEqual(activated, { theme: "minimalist", accent: "#805B3E" });
});

test("theme keyboard navigation follows radiogroup order and wraps", () => {
  assert.equal(themeSelectionFromKey("minimalist", "ArrowRight"), "brutalist");
  assert.equal(themeSelectionFromKey("minimalist", "ArrowDown"), "brutalist");
  assert.equal(themeSelectionFromKey("minimalist", "ArrowLeft"), "cyberpunk");
  assert.equal(themeSelectionFromKey("cyberpunk", "ArrowUp"), "glassmorph");
});

test("theme keyboard navigation supports Home and End without consuming other keys", () => {
  assert.equal(themeSelectionFromKey("glassmorph", "Home"), "minimalist");
  assert.equal(themeSelectionFromKey("minimalist", "End"), "cyberpunk");
  assert.equal(themeSelectionFromKey("brutalist", "Enter"), null);
  assert.equal(themeSelectionFromKey("unknown", "ArrowRight"), "minimalist");
});

test("themes.css contains explicit readable surface and pill tokens for minimalist and brutalist", async () => {
  const fs = await import("node:fs/promises");
  const css = await fs.readFile(new URL("../../../packages/theme-engine/src/themes.css", import.meta.url), "utf8");
  assert.match(css, /:root\[data-theme="minimalist"\]\s*\{[^}]*--pill-bg:#e4d9c9/);
  assert.match(css, /:root\[data-theme="brutalist"\]\s*\{[^}]*--pill-bg:#ffe574/);
  assert.match(css, /:root\[data-theme="minimalist"\]\s*:is\(\.tile,\.panel,\.agent-card,\.ws-card,\.today-panel,\.dsec,\.wf,\.approval-queue,\.aa-cat-card\)\s*\{[^}]*background:var\(--card\)/);
});

test("glassmorph and cyberpunk themes keep distinct material, color, and geometry", async () => {
  const fs = await import("node:fs/promises");
  const css = await fs.readFile(new URL("../../../packages/theme-engine/src/themes.css", import.meta.url), "utf8");
  assert.match(css, /:root\[data-theme="glassmorph"\]\s*\{[^}]*--acc:#38bdf8/);
  assert.match(css, /:root\[data-theme="glassmorph"\]\s*\{[^}]*--surface-blur:22px/);
  assert.match(css, /:root\[data-theme="glassmorph"\]\s*\{[^}]*--surface-radius:18px/);
  assert.match(css, /:root\[data-theme="cyberpunk"\]\s*\{[^}]*--acc:#c6ff39/);
  assert.match(css, /:root\[data-theme="cyberpunk"\]\s*\{[^}]*--surface-blur:0px;\s*--surface-radius:6px;\s*--control-radius:3px/);
  assert.match(css, /:root\[data-theme="cyberpunk"\]\s*:is\(\.tile,\.panel,\.agent-card,\.ws-card,\.today-panel,\.dsec,\.wf,\.approval-queue,\.aa-cat-card\)\s*\{[^}]*backdrop-filter:none/);
  assert.match(css, /:root\[data-theme="cyberpunk"\]\s+\.agent-card\s*\{[^}]*border-left:2px solid color-mix\(in srgb,var\(--ac,var\(--cyan\)\) 72%,transparent\)/);
});


