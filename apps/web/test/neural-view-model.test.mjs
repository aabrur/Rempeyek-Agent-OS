import test from "node:test";
import assert from "node:assert/strict";
import {
  breadcrumbFor, changedNodeIds, datasetIdentity, layersForMode,
  layoutGraph, nextNodeId, nodeSemantics, projectGraph,
} from "../../../packages/neural-engine/src/graph-view.js";

const DATA = {
  nodes: [
    { id: "Projects/A.md", label: "A", folder: "Projects", type: "note", degree: 3, mtime: 20 },
    { id: "Projects/B.md", label: "B", folder: "Projects", type: "note", degree: 2, mtime: 10 },
    { id: "ghost:Missing", label: "Missing", folder: "(unresolved)", type: "ghost", degree: 1, mtime: 0 },
    { id: "tag:agent", label: "#agent", folder: "(tags)", type: "tag", degree: 1, mtime: 0 },
    { id: "folder:Projects", label: "Projects", folder: "Projects", type: "folder", degree: 2, mtime: 0 },
  ],
  edges: [
    { source: "Projects/A.md", target: "Projects/B.md", type: "link" },
    { source: "Projects/B.md", target: "ghost:Missing", type: "ghost" },
    { source: "Projects/A.md", target: "tag:agent", type: "tag" },
    { source: "Projects/A.md", target: "folder:Projects", type: "folder" },
  ],
  metadata: { generatedAt: "2026-07-13T00:00:00.000Z", effectTier: "full" },
};

test("seeded layout is stable across reload and input order", () => {
  const reversed = { ...DATA, nodes: [...DATA.nodes].reverse(), edges: [...DATA.edges].reverse() };
  assert.equal(datasetIdentity(DATA), datasetIdentity(reversed));
  const a = layoutGraph(DATA, { width: 1000, height: 700, iterations: 24 });
  const b = layoutGraph(reversed, { width: 1000, height: 700, iterations: 24 });
  assert.deepEqual(a, b);
  assert.ok(a.every(node => Number.isFinite(node.x) && Number.isFinite(node.y) && node.mass >= 1));
});

test("parity defaults to notes plus resolved and ghost links", () => {
  assert.deepEqual(layersForMode("parity"), { link: true, ghost: true, tag: false, folder: false });
  const view = projectGraph(DATA, { mode: "parity" });
  assert.deepEqual(view.nodes.map(node => node.type).sort(), ["ghost", "note", "note"]);
  assert.deepEqual(view.edges.map(edge => edge.type).sort(), ["ghost", "link"]);
  assert.deepEqual(view.counts, { nodes: 3, edges: 2, notes: 2, ghosts: 1, tags: 0, folders: 0 });
});

test("neighborhood projection uses the same filtered nodes and edges", () => {
  const view = projectGraph(DATA, { mode: "cosmos", focusId: "Projects/A.md" });
  assert.deepEqual(view.nodes.map(node => node.id).sort(), ["Projects/A.md", "Projects/B.md", "folder:Projects", "tag:agent"]);
  assert.equal(view.edges.length, 3);
  assert.equal(view.counts.nodes, view.nodes.length);
  assert.equal(view.counts.edges, view.edges.length);
  assert.equal(view.metadata.datasetIdentity, datasetIdentity(DATA));
  const hiddenFocus = projectGraph(DATA, { mode: "parity", focusId: "tag:agent" });
  assert.equal(hiddenFocus.metadata.focusId, null);
  assert.equal(hiddenFocus.counts.nodes, 3);
});

test("keyboard order reaches every visible node and breadcrumbs preserve path", () => {
  const nodes = projectGraph(DATA, { mode: "parity" }).nodes;
  let current = null; const visited = [];
  for (let index = 0; index < nodes.length; index += 1) {
    current = nextNodeId(nodes, current, 1); visited.push(current);
  }
  assert.equal(new Set(visited).size, nodes.length);
  assert.deepEqual(breadcrumbFor(DATA.nodes[0]), ["Projects", "A"]);
});

test("snapshot comparison marks only new or materially changed nodes", () => {
  const previous = { nodes: DATA.nodes.map(node => ({ ...node })) };
  const next = { nodes: DATA.nodes.map(node => node.id === "Projects/B.md" ? { ...node, mtime: 99 } : node).concat({ id: "New.md", label: "New", type: "note", folder: "(root)", degree: 0, mtime: 100 }) };
  assert.deepEqual([...changedNodeIds(previous, next)].sort(), ["New.md", "Projects/B.md"]);
});

test("visual semantics derive only from degree, recency, ghost state, and snapshot changes", () => {
  assert.deepEqual(nodeSemantics(DATA.nodes[0], {
    generatedAt: "2026-07-13T00:00:00.000Z", changedNodeIds: ["Projects/A.md"], recentDays: 7,
  }), { mass: 3, halo: false, recent: false, unresolved: false, changed: true });
  assert.deepEqual(nodeSemantics(DATA.nodes[2], {
    generatedAt: "2026-07-13T00:00:00.000Z", changedNodeIds: [], recentDays: 7,
  }), { mass: 2, halo: false, recent: false, unresolved: true, changed: false });
});
