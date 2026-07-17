import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentMap } from "../lib/agent-map.mjs";
import {
  COSMOS_HEIGHT, COSMOS_WIDTH, CORE_ID, TIER_BY_TYPE,
  buildCosmosMap, cosmosPositions, curvePath, starField,
} from "../lib/cosmos-map.mjs";

const agent = (id, extra = {}) => ({ id, name: id, enabled: true, actions: ["run"], ...extra });

const topologyOf = (agents, edges = []) => ({
  nodes: agents,
  edges,
  metadata: { nodeCount: agents.length, edgeCount: edges.length, droppedRelations: 0, hasRelationships: edges.length > 0 },
});

const EDGES = [
  { source: "codex", target: "hermes", type: "dependency", provenance: { source: "configuration", id: "hermes:codex" }, status: "configured" },
  { source: "hermes", target: "pi", type: "task_assignment", provenance: { source: "task", id: "t-1" }, status: "queued", flowing: true },
  { source: "cline", target: "pi", type: "co_assignment", provenance: { source: "co_assignment", id: "proj:cline:pi" }, status: "co-assigned" },
];

test("positions are deterministic and stay inside the stage at every roster size", () => {
  for (const n of [0, 1, 3, 8, 14]) {
    const ids = Array.from({ length: n }, (_, i) => `agent-${String(i).padStart(2, "0")}`);
    const first = cosmosPositions(ids);
    const second = cosmosPositions([...ids].reverse());
    assert.equal(first.size, n);
    for (const id of ids) {
      assert.deepEqual(first.get(id), second.get(id), `order must not change agent ${id}`);
      const { x, y } = first.get(id);
      assert.ok(x >= 64 && x <= COSMOS_WIDTH - 64, `x in bounds for n=${n}`);
      assert.ok(y >= 64 && y <= COSMOS_HEIGHT - 64, `y in bounds for n=${n}`);
    }
  }
});

test("every cosmos edge is a verified buildAgentMap edge — nothing is synthesized", () => {
  const agents = ["codex", "hermes", "pi", "cline"].map(id => agent(id));
  const topology = topologyOf(agents, [
    ...EDGES,
    // provenance-incomplete record: must be dropped by the shared evidence filter
    { source: "codex", target: "pi", type: "communication", provenance: { source: "communication" }, status: "queued" },
  ]);
  const verified = new Set(buildAgentMap(topology, { width: COSMOS_WIDTH, height: COSMOS_HEIGHT }).edges.map(edge => edge.id));
  const cosmos = buildCosmosMap(topology, agents);

  assert.equal(cosmos.edges.length, verified.size);
  for (const edge of cosmos.edges) {
    assert.ok(verified.has(edge.id), `edge ${edge.id} must come from the verified set`);
    assert.match(edge.path, /^M [\d.]+ [\d.]+ Q /);
  }
  assert.equal(cosmos.metadata.droppedRelations, 1);
});

test("relationship types map onto the donor visual tiers", () => {
  assert.deepEqual(TIER_BY_TYPE, {
    dependency: "strong",
    spawned_subagent: "strong",
    task_assignment: "data",
    communication: "data",
    co_assignment: "weak",
  });
  const agents = ["codex", "hermes", "pi", "cline"].map(id => agent(id));
  const cosmos = buildCosmosMap(topologyOf(agents, EDGES), agents);
  const tierOf = Object.fromEntries(cosmos.edges.map(edge => [edge.type, edge.tier]));
  assert.equal(tierOf.dependency, "strong");
  assert.equal(tierOf.task_assignment, "data");
  assert.equal(tierOf.co_assignment, "weak");
});

test("vault lanes appear only with lane or observed vault-write evidence", () => {
  const agents = [
    agent("codex", { lane: "Codex" }),
    agent("hermes", { lastSeen: "2026-07-15" }),
    agent("pi"),                                  // no lane, never seen → no link
    agent("ghost", { lane: "Ghost" }),            // not in the topology → no link
  ];
  const cosmos = buildCosmosMap(topologyOf(agents.slice(0, 3)), agents);
  assert.deepEqual(cosmos.laneLinks.map(link => link.agentId), ["codex", "hermes"]);
  assert.equal(cosmos.core.id, CORE_ID);
  assert.equal(cosmos.core.laneCount, 2);
});

test("reduced motion strips every ambient particle", () => {
  const agents = ["codex", "hermes", "pi", "cline"].map(id => agent(id));
  const animated = buildCosmosMap(topologyOf(agents, EDGES), agents, { reducedMotion: false });
  const calm = buildCosmosMap(topologyOf(agents, EDGES), agents, { reducedMotion: true });
  assert.ok(animated.edges.some(edge => edge.particle));
  assert.ok(calm.edges.every(edge => !edge.particle));
});

test("starfield is deterministic and stays inside the stage", () => {
  const a = starField();
  const b = starField();
  assert.equal(a.length, 130);
  assert.deepEqual(a, b);
  for (const star of a) {
    assert.ok(star.x >= 0 && star.x <= COSMOS_WIDTH);
    assert.ok(star.y >= 0 && star.y <= COSMOS_HEIGHT);
  }
});

test("curvePath bends perpendicular and caps the bend", () => {
  assert.equal(curvePath(0, 0, 100, 0), "M 0.0 0.0 Q 50.0 13.0 100.0 0.0");
  // long edge: bend capped at 42
  assert.equal(curvePath(0, 0, 900, 0), "M 0.0 0.0 Q 450.0 42.0 900.0 0.0");
});

test("measured signals come from runtime records, never invented", () => {
  const agents = [agent("codex", { uptime: { pct: 87.6 }, lane: "Codex", lastSeen: "2026-07-16" }), agent("pi")];
  const cosmos = buildCosmosMap(topologyOf(agents), agents);
  const codex = cosmos.nodes.find(node => node.id === "codex");
  const pi = cosmos.nodes.find(node => node.id === "pi");
  assert.equal(codex.signals.uptimePct, 88);
  assert.equal(pi.signals.uptimePct, null);
  assert.equal(pi.signals.recencyDays, null);
  assert.equal(pi.signals.recencyPct, null);
});
