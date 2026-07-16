import assert from "node:assert/strict";
import test from "node:test";

import { agentTopologyRevision, beginTopologyRefresh, buildAgentMap } from "../lib/agent-map.mjs";

const agents = [
  { id: "codex", name: "Codex", enabled: true, actions: ["run"] },
  { id: "hermes", name: "Hermes", enabled: true, actions: ["run"] },
  { id: "pi", name: "Pi", enabled: true, actions: [] },
  { id: "cline", name: "Cline", enabled: true, actions: [] },
];

test("topology revision is order-independent and changes with configured dependencies", () => {
  const first = agentTopologyRevision([
    { id: "hermes", dependencies: ["pi", "codex"], proc: { status: "running", mode: "service" } },
    { id: "codex", dependencies: [] },
  ]);
  const reordered = agentTopologyRevision([
    { id: "codex", dependencies: [] },
    { id: "hermes", dependencies: ["codex", "pi"], proc: { status: "running", mode: "service" } },
  ]);
  const changed = agentTopologyRevision([
    { id: "codex", dependencies: [] },
    { id: "hermes", dependencies: ["codex"], proc: { status: "running", mode: "service" } },
  ]);

  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test("beginning a topology refresh clears previous relationships until new evidence arrives", () => {
  const previous = {
    nodes: agents,
    edges: [{ source: "codex", target: "hermes", type: "dependency", provenance: { source: "configuration", id: "old" } }],
    metadata: { nodeCount: 4, edgeCount: 1, droppedRelations: 0, hasRelationships: true },
  };
  const refreshing = beginTopologyRefresh(previous, agents.slice(0, 3));

  assert.deepEqual(refreshing.edges, []);
  assert.deepEqual(refreshing.nodes, agents.slice(0, 3));
  assert.deepEqual(refreshing.metadata, { nodeCount: 3, edgeCount: 0, droppedRelations: 0, hasRelationships: false });
});

test("lays out the same relationship graph deterministically without an artificial hub", () => {
  const topology = {
    nodes: agents,
    edges: [
      { source: "codex", target: "hermes", type: "dependency", provenance: { source: "configuration", id: "hermes:codex" }, flowing: false },
      { source: "hermes", target: "pi", type: "task_assignment", provenance: { source: "task", id: "task-1" }, flowing: true },
    ],
  };

  const first = buildAgentMap(topology);
  const second = buildAgentMap({ nodes: [...agents].reverse(), edges: [...topology.edges].reverse() });

  assert.deepEqual(first.nodes.map(({ id, x, y }) => ({ id, x, y })), second.nodes.map(({ id, x, y }) => ({ id, x, y })));
  assert.deepEqual(first.edges.map(({ id, path }) => ({ id, path })), second.edges.map(({ id, path }) => ({ id, path })));
  assert.equal(first.nodes.some(node => node.id === "core" || node.synthetic), false);
  assert.equal(new Set(first.nodes.map(node => `${node.x},${node.y}`)).size, agents.length);
});

test("anchors each connected constellation on the highest-degree real agent", () => {
  const map = buildAgentMap({
    nodes: agents,
    edges: [
      { source: "codex", target: "hermes", type: "dependency", provenance: { source: "configuration", id: "hermes:codex" } },
      { source: "hermes", target: "pi", type: "task_assignment", provenance: { source: "task", id: "task-1" } },
    ],
  });

  const anchors = map.nodes.filter(node => node.isAnchor);
  assert.deepEqual(anchors.map(node => node.id), ["hermes"]);
  assert.ok(Math.abs(anchors[0].x - 380) < 1);
  assert.ok(Math.abs(anchors[0].y - 240) < 1);
  assert.equal(map.nodes.some(node => node.synthetic), false);
  assert.equal(map.nodes.every(node => node.width > 0 && node.height > 0), true);
  assert.equal(new Set(map.nodes.map(node => `${node.x},${node.y}`)).size, agents.length);
});

test("breaks equal-degree anchor ties by stable agent id", () => {
  const map = buildAgentMap({
    nodes: agents.slice(0, 2),
    edges: [{ source: "codex", target: "hermes", type: "communication", provenance: { source: "communication", id: "message" } }],
  });

  assert.deepEqual(map.nodes.filter(node => node.isAnchor).map(node => node.id), ["codex"]);
});

test("separates connected components and marks unrelated agents as isolated", () => {
  const map = buildAgentMap({
    nodes: agents,
    edges: [{ source: "codex", target: "hermes", type: "dependency", provenance: { source: "configuration", id: "hermes:codex" } }],
  });

  const componentByNode = Object.fromEntries(map.nodes.map(node => [node.id, node.componentId]));
  assert.equal(componentByNode.codex, componentByNode.hermes);
  assert.notEqual(componentByNode.codex, componentByNode.pi);
  assert.notEqual(componentByNode.pi, componentByNode.cline);
  assert.deepEqual(map.nodes.filter(node => node.isolated).map(node => node.id), ["cline", "pi"]);
});

test("projects an honest zero-edge state with evidence guidance", () => {
  const map = buildAgentMap({ nodes: agents, edges: [], metadata: { droppedRelations: 2 } });

  assert.equal(map.metadata.hasRelationships, false);
  assert.equal(map.edges.length, 0);
  assert.equal(map.nodes.every(node => node.isolated), true);
  assert.equal(map.nodes.every(node => !node.isAnchor), true);
  assert.match(map.emptyState.title, /No verified relationships/i);
  assert.match(map.emptyState.detail, /configuration|task|subagent|communication/i);
  assert.equal(map.metadata.droppedRelations, 2);
});

test("projects the complete edge vocabulary and provenance into inspectable rows", () => {
  const topology = {
    nodes: agents,
    edges: [
      { source: "codex", target: "hermes", type: "dependency", provenance: { source: "configuration", id: "hermes:codex" }, flowing: false },
      { source: "hermes", target: "pi", type: "task_assignment", provenance: { source: "task", id: "task-1" }, flowing: true },
      { source: "codex", target: "cline", type: "spawned_subagent", provenance: { source: "subagent", id: "spawn-1" }, flowing: false },
      { source: "pi", target: "cline", type: "communication", provenance: { source: "communication", id: "message-1" }, flowing: false },
    ],
  };

  const map = buildAgentMap(topology);
  assert.deepEqual(map.legend.relations.map(item => item.type), ["dependency", "co_assignment", "task_assignment", "spawned_subagent", "communication"]);
  assert.deepEqual(map.rows.filter(row => row.kind === "relationship").map(row => ({ type: row.type, provenanceId: row.provenanceId, provenanceSource: row.provenanceSource })), [
    { type: "communication", provenanceId: "message-1", provenanceSource: "communication" },
    { type: "dependency", provenanceId: "hermes:codex", provenanceSource: "configuration" },
    { type: "spawned_subagent", provenanceId: "spawn-1", provenanceSource: "subagent" },
    { type: "task_assignment", provenanceId: "task-1", provenanceSource: "task" },
  ]);
});

test("uses semantic node states and animates only verified live flow when motion is allowed", () => {
  const nodes = [
    { id: "running", name: "Running", enabled: true, actions: ["run"], proc: { status: "running", mode: "owned" } },
    { id: "error", name: "Error", enabled: true, actions: ["run"], proc: { status: "error", mode: "service" } },
    { id: "observe", name: "Observe", enabled: true, actions: [] },
    { id: "idle", name: "Idle", enabled: true, actions: ["run"], proc: { status: "stopped", mode: "terminal" } },
    { id: "disabled", name: "Disabled", enabled: false, actions: ["run"], proc: { status: "running", mode: "cli" } },
  ];
  const edges = [{ source: "running", target: "idle", type: "task_assignment", provenance: { source: "task", id: "task-live" }, status: "running", flowing: true }];

  const live = buildAgentMap({ nodes, edges }, { reducedMotion: false });
  const reduced = buildAgentMap({ nodes, edges }, { reducedMotion: true });

  assert.deepEqual(live.nodes.map(node => [node.id, node.status, node.mode]), [
    ["disabled", "disabled", "cli"],
    ["error", "error", "service"],
    ["idle", "idle", "terminal"],
    ["observe", "observe", null],
    ["running", "running", "owned"],
  ]);
  assert.equal(live.edges[0].animated, true);
  assert.equal(reduced.edges[0].animated, false);
  assert.equal(reduced.edges[0].directional, true);
  assert.deepEqual(live.legend.statuses.map(item => item.status), ["disabled", "running", "error", "observe", "idle"]);
});

test("lays out cyclic evidence without requiring an artificial root", () => {
  const map = buildAgentMap({
    nodes: agents.slice(0, 2),
    edges: [
      { source: "codex", target: "hermes", type: "communication", provenance: { source: "communication", id: "one" } },
      { source: "hermes", target: "codex", type: "communication", provenance: { source: "communication", id: "two" } },
    ],
  });
  assert.equal(map.nodes.length, 2);
  assert.equal(new Set(map.nodes.map(node => `${node.x},${node.y}`)).size, 2);
});

test("rejects unsupported or provenance-incomplete relationships at the view seam", () => {
  const map = buildAgentMap({
    nodes: agents.slice(0, 2),
    edges: [
      { source: "codex", target: "hermes", type: "heartbeat", provenance: { source: "heartbeat", id: "fake" } },
      { source: "codex", target: "hermes", type: "communication", provenance: { source: "communication" } },
    ],
    metadata: { droppedRelations: 1 },
  });
  assert.equal(map.edges.length, 0);
  assert.equal(map.metadata.droppedRelations, 3);
});

test("enforces ontology provenance and semantic animation at the view seam", () => {
  const nodes = agents.slice(0, 3);
  const edges = [
    { source: "codex", target: "hermes", type: "dependency", provenance: { source: "task", id: "wrong-source" }, status: "queued", flowing: true },
    { source: "codex", target: "hermes", type: "task_assignment", provenance: { source: "task", id: "recorded-task" }, status: "recorded", flowing: true },
    { source: "codex", target: "pi", type: "task_assignment", provenance: { source: "task", id: "queued-task" }, status: "queued", flowing: true },
    { source: "hermes", target: "pi", type: "spawned_subagent", provenance: { source: "subagent", id: "spawn" }, status: "running", flowing: true },
    { source: "pi", target: "hermes", type: "communication", provenance: { source: "communication", id: "not-flowing" }, status: "running", flowing: false },
    { source: "pi", target: "codex", type: "communication", provenance: { source: "communication", id: "live-message" }, status: "running", flowing: true },
    { source: "hermes", target: "codex", type: "communication", provenance: { source: "unknown", id: "unknown-source" }, status: "running", flowing: true },
  ];

  const live = buildAgentMap({ nodes, edges }, { reducedMotion: false });
  const reduced = buildAgentMap({ nodes, edges }, { reducedMotion: true });

  assert.deepEqual(live.edges.map(edge => [edge.provenance.id, edge.animated]), [
    ["live-message", true],
    ["not-flowing", false],
    ["spawn", false],
    ["recorded-task", false],
    ["queued-task", true],
  ]);
  assert.equal(live.metadata.droppedRelations, 2);
  assert.equal(reduced.edges.every(edge => edge.animated === false), true);
});
