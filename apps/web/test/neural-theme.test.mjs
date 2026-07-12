import test from "node:test";
import assert from "node:assert/strict";
import { resolveGraphPalette } from "../../../packages/neural-engine/src/NeuralGraph.js";

test("graph palette resolves every node and edge layer from semantic tokens", () => {
  const values = {
    "--graph-note": "#111111", "--graph-tag": "#222222", "--graph-ghost": "#333333", "--graph-folder": "#444444",
    "--graph-edge-link": "1,2,3", "--graph-edge-ghost": "4,5,6", "--graph-edge-tag": "7,8,9", "--graph-edge-folder": "10,11,12",
    "--graph-star": "13,14,15", "--violet": "#555555", "--cyan": "#666666", "--amber": "#777777",
    "--lime": "#888888", "--acc": "#999999", "--red": "#aaaaaa",
  };
  const palette = resolveGraphPalette((name, fallback) => values[name] || fallback);
  assert.deepEqual(palette.nodes, { note: "#111111", tag: "#222222", ghost: "#333333", folder: "#444444" });
  assert.deepEqual(palette.edges, { link: "1,2,3", ghost: "4,5,6", tag: "7,8,9", folder: "10,11,12" });
  assert.equal(palette.starRgb, "13,14,15");
  assert.ok(palette.folderPalette.includes("#111111"));
  assert.deepEqual(palette.effects, { glow: true, halo: true, shadow: true });
});

test("light graph palette resolves readable foreground and disables decorative effects", () => {
  const values = {
    "--graph-label": "#26221d", "--graph-label-folder": "#4c443c", "--graph-label-hover": "#111111",
    "--graph-meta": "#6f665d", "--graph-core": "#f4efe6", "--graph-particle": "#4c6670",
    "--graph-particle-glow": "#4c6670", "--graph-edge-highlight": "54,107,118", "--graph-wave": "38,34,29",
    "--graph-effect-glow": "0", "--graph-effect-halo": "false", "--graph-effect-shadow": "off",
  };
  const palette = resolveGraphPalette((name, fallback) => values[name] || fallback);
  assert.deepEqual(palette.foreground, {
    label: "#26221d", folderLabel: "#4c443c", hoverLabel: "#111111", meta: "#6f665d", core: "#f4efe6",
    particle: "#4c6670", particleGlow: "#4c6670", edgeHighlight: "54,107,118", wave: "38,34,29",
  });
  assert.deepEqual(palette.effects, { glow: false, halo: false, shadow: false });
});
