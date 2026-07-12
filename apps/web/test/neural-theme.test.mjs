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
});
