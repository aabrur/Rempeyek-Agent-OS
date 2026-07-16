import test from "node:test";
import assert from "node:assert/strict";
import {
  breadcrumbFor, changedNodeIds, datasetIdentity, layersForMode,
  graphRenderProfile, labelForNodeId, layoutGraph, nextNodeId, nodeSemantics,
  labelBudgetForWidth, projectGraph, resolveMotionState, selectLabelNodeIds,
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
  assert.deepEqual(layersForMode("parity"), { link: true, ghost: true, tag: false, folder: false, asset: false, code: false });
  const view = projectGraph(DATA, { mode: "parity" });
  assert.deepEqual(view.nodes.map(node => node.type).sort(), ["ghost", "note", "note"]);
  assert.deepEqual(view.edges.map(edge => edge.type).sort(), ["ghost", "link"]);
  assert.deepEqual(view.counts, { nodes: 3, edges: 2, notes: 2, ghosts: 1, tags: 0, folders: 0, assets: 0, codeFiles: 0 });
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

test("effect tiers monotonically reduce label and decorative render work", () => {
  const full = graphRenderProfile("full", 200);
  const reduced = graphRenderProfile("reduced", 500);
  const aggregate = graphRenderProfile("aggregate-ready", 1500);
  assert.ok(full.layoutIterations > reduced.layoutIterations && reduced.layoutIterations > aggregate.layoutIterations);
  assert.ok(full.maxHalos > reduced.maxHalos && reduced.maxHalos > aggregate.maxHalos);
  assert.ok(full.starAreaPerPoint < reduced.starAreaPerPoint && reduced.starAreaPerPoint < aggregate.starAreaPerPoint);
  assert.ok(full.labelMinDegree < reduced.labelMinDegree && reduced.labelMinDegree < aggregate.labelMinDegree);
  assert.ok(full.labelZoom < reduced.labelZoom && reduced.labelZoom < aggregate.labelZoom);
  assert.ok(full.maxLabels > reduced.maxLabels && reduced.maxLabels > aggregate.maxLabels);
  assert.equal(full.drawNodeCores, true);
  assert.equal(aggregate.drawNodeCores, false);
  assert.equal(full.shadowMode, "all");
  assert.equal(reduced.shadowMode, "active");
  assert.equal(graphRenderProfile(undefined, 500).tier, "reduced");
});

test("label selection is deterministic, bounded, and prioritizes meaningful hubs", () => {
  const nodes = Array.from({ length: 80 }, (_, index) => ({
    id: `Folder-${index % 8}/Note-${index}.md`, label: `Note ${index}`,
    folder: `Folder-${index % 8}`, type: index < 8 ? "folder" : "note", degree: index % 13,
  }));
  const profile = { ...graphRenderProfile("reduced"), maxLabels: 12 };
  const first = selectLabelNodeIds(nodes, profile);
  const reversed = selectLabelNodeIds([...nodes].reverse(), profile);
  assert.equal(first.size, 12);
  assert.deepEqual([...first], [...reversed]);
  assert.ok(first.has("Folder-7/Note-7.md"), "the strongest structural cluster remains discoverable");
  assert.ok(first.has("Folder-0/Note-64.md"), "high-degree hub is labeled");
  assert.ok([...first].filter(id => Number(id.match(/Note-(\d+)/)?.[1]) < 8).length <= 5, "folders cannot consume the whole label budget");
});

test("label budget contracts on narrow canvases without hiding every landmark", () => {
  const profile = graphRenderProfile("reduced");
  assert.equal(labelBudgetForWidth(profile, 1400), 28);
  assert.equal(labelBudgetForWidth(profile, 840), 20);
  assert.equal(labelBudgetForWidth(profile, 390), 9);
  assert.equal(labelBudgetForWidth({ ...profile, maxLabels: 0 }, 390), 0);
});

test("system reduced motion blocks Resume until the OS preference clears", () => {
  assert.deepEqual(resolveMotionState(true, true), { enabled: false, disabled: true, label: "SYSTEM MOTION OFF" });
  assert.deepEqual(resolveMotionState(false, false), { enabled: false, disabled: false, label: "RESUME" });
  assert.deepEqual(resolveMotionState(true, false), { enabled: true, disabled: false, label: "PAUSE" });
});

test("neighborhood label is resolved from focus id independently of selection", () => {
  assert.equal(labelForNodeId(DATA.nodes, "Projects/A.md"), "A");
  assert.equal(labelForNodeId(DATA.nodes, "missing-id"), "missing-id");
});

test("asset and code layers render in cosmos and stay out of parity (Obsidian default)", () => {
  const data = { nodes: [
    { id: "A.md", type: "note", degree: 1 },
    { id: "Assets/x.png", type: "asset", degree: 1 },
    { id: "Repo/server.js", type: "code", degree: 0 },
  ], edges: [{ source: "A.md", target: "Assets/x.png", type: "link" }] };
  const cosmos = projectGraph(data, { mode: "cosmos" });
  assert.deepEqual(cosmos.nodes.map(n => n.id).sort(), ["A.md", "Assets/x.png", "Repo/server.js"]);
  const parity = projectGraph(data, { mode: "parity" });
  assert.deepEqual(parity.nodes.map(n => n.id), ["A.md"], "parity mirrors Obsidian: notes+ghosts only");
  assert.equal(layersForMode("cosmos").asset, true);
  assert.equal(layersForMode("parity").code, false);
});
