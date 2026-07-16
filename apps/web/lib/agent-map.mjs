const byId = (a, b) => String(a.id).localeCompare(String(b.id));
const RELATIONS = [
  { type: "dependency", label: "Dependency", description: "Configured prerequisite" },
  { type: "co_assignment", label: "Co-assignment", description: "Shared project, from vault tasks" },
  { type: "task_assignment", label: "Task assignment", description: "Verified task routing" },
  { type: "spawned_subagent", label: "Spawned subagent", description: "Verified parent and child agents" },
  { type: "communication", label: "Communication", description: "Verified agent-to-agent message" },
];
// Symmetric relations carry no arrowhead — direction would be a lie.
const SYMMETRIC = new Set(["co_assignment"]);
const STATUSES = [
  { status: "disabled", label: "Disabled" },
  { status: "running", label: "Running" },
  { status: "error", label: "Error" },
  { status: "observe", label: "Observe" },
  { status: "idle", label: "Idle" },
];
const MODES = new Set(["owned", "terminal", "service", "cli"]);
const PROVENANCE_BY_TYPE = new Map([
  ["dependency", "configuration"],
  ["co_assignment", "co_assignment"],
  ["task_assignment", "task"],
  ["spawned_subagent", "subagent"],
  ["communication", "communication"],
]);
const FLOW_TYPES = new Set(["task_assignment", "communication"]);
const FLOW_STATUSES = new Set(["queued", "running"]);

function nodeState(node) {
  if (node.enabled === false) return "disabled";
  if (node.proc?.status === "running") return "running";
  if (node.proc?.status === "error" || node.proc?.status === "exited") return "error";
  if (!(node.actions || []).length) return "observe";
  return "idle";
}

function connectedComponents(nodes, edges) {
  const neighbors = new Map(nodes.map(node => [node.id, new Set()]));
  for (const edge of edges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }
  const visited = new Set();
  const components = [];
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const members = [];
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length) {
      const id = queue.shift();
      members.push(id);
      for (const next of [...(neighbors.get(id) || [])].sort()) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    components.push(members.sort());
  }
  return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

function anchorFor(ids, degreeOf) {
  return [...ids].sort((a, b) => (degreeOf.get(b) || 0) - (degreeOf.get(a) || 0) || String(a).localeCompare(String(b)))[0];
}

function constellationPositions(ids, degreeOf, { x, y, width, height }) {
  const positions = new Map();
  const anchor = anchorFor(ids, degreeOf);
  const cx = x + width / 2;
  const cy = y + height / 2;
  positions.set(anchor, { x: cx, y: cy });

  const orbit = ids.filter(id => id !== anchor).sort();
  const ringCapacity = 8;
  for (let index = 0; index < orbit.length; index++) {
    const ring = Math.floor(index / ringCapacity);
    const ringStart = ring * ringCapacity;
    const count = Math.min(ringCapacity, orbit.length - ringStart);
    const inRing = index - ringStart;
    const startAngle = count === 1 ? -Math.PI / 2 : count === 2 ? Math.PI : -Math.PI / 2;
    const step = count === 2 ? Math.PI : Math.PI * 2 / count;
    const rx = Math.min(width / 2 - 70, width * (0.31 + ring * 0.1));
    const ry = Math.min(height / 2 - 34, height * (0.27 + ring * 0.09));
    const angle = startAngle + inRing * step + (ring % 2 ? step / 2 : 0);
    positions.set(orbit[index], {
      x: Math.min(x + width - 63, Math.max(x + 63, cx + Math.cos(angle) * rx)),
      y: Math.min(y + height - 31, Math.max(y + 31, cy + Math.sin(angle) * ry)),
    });
  }
  return { anchor, positions };
}

function neuralFabric(positioned, focusId) {
  if (!focusId || positioned.size < 2) return [];
  const orbit = [...positioned.keys()].filter(id => id !== focusId).sort();
  const pairs = [];
  for (const id of orbit) pairs.push([focusId, id]);
  if (orbit.length > 2) orbit.forEach((id, index) => pairs.push([id, orbit[(index + 1) % orbit.length]]));
  const seen = new Set();
  return pairs.flatMap(([sourceId, targetId], index) => {
    const key = [sourceId, targetId].sort().join(":");
    if (seen.has(key)) return [];
    seen.add(key);
    const source = positioned.get(sourceId);
    const target = positioned.get(targetId);
    const mx = (source.x + target.x) / 2;
    const my = (source.y + target.y) / 2;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const bend = (index % 2 ? -1 : 1) * Math.min(24, length * 0.08);
    const cx = mx - dy / length * bend;
    const cy = my + dx / length * bend;
    return [{
      id: `fabric:${key}`,
      source: sourceId,
      target: targetId,
      path: `M${source.x.toFixed(1)},${source.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${target.x.toFixed(1)},${target.y.toFixed(1)}`,
    }];
  });
}

function edgeId(edge) {
  return `${edge.type}:${edge.source}:${edge.target}:${edge.provenance.source}:${edge.provenance.id}`;
}

export function agentTopologyRevision(agents = []) {
  return [...agents]
    .filter(agent => agent?.id)
    .sort(byId)
    .map(agent => [
      agent.id,
      agent.name || "",
      agent.enabled !== false,
      agent.accent || "",
      [...(agent.actions || [])].sort().join(","),
      agent.proc?.status || "",
      agent.proc?.mode || "",
      [...(agent.dependencies || [])].filter(id => typeof id === "string").sort().join(","),
    ].join(":"))
    .join("|");
}

export function beginTopologyRefresh(_previousTopology, agents = []) {
  return {
    nodes: agents,
    edges: [],
    metadata: { nodeCount: agents.length, edgeCount: 0, droppedRelations: 0, hasRelationships: false },
  };
}

export function buildAgentMap(topology = {}, { width = 760, height = 480, reducedMotion = false } = {}) {
  const nodes = [...(topology.nodes || [])].filter(node => node?.id).sort(byId);
  const known = new Set(nodes.map(node => node.id));
  const sourceEdges = [...(topology.edges || [])];
  const edges = sourceEdges
    .filter(edge => PROVENANCE_BY_TYPE.get(edge?.type) === edge?.provenance?.source && known.has(edge?.source) && known.has(edge?.target) && edge.source !== edge.target && edge.provenance?.id)
    .sort((a, b) => edgeId(a).localeCompare(edgeId(b)));
  const components = connectedComponents(nodes, edges);
  const isolated = components.filter(component => component.length === 1).flat();
  const padding = 58;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const degreeOf = new Map(nodes.map(node => [node.id, 0]));
  for (const edge of edges) {
    degreeOf.set(edge.source, (degreeOf.get(edge.source) || 0) + 1);
    degreeOf.set(edge.target, (degreeOf.get(edge.target) || 0) + 1);
  }

  const visual = constellationPositions(nodes.map(node => node.id), degreeOf, { x: padding, y: padding, width: usableWidth, height: usableHeight });
  const positions = visual.positions;
  const hasAcceptedEdges = edges.length > 0;
  const projectedNodes = nodes.map(node => ({
    ...node,
    ...positions.get(node.id),
    status: nodeState(node),
    mode: MODES.has(node.proc?.mode) ? node.proc.mode : null,
    componentId: components.findIndex(component => component.includes(node.id)),
    degree: degreeOf.get(node.id) || 0,   // Stage 3: neural glow intensity scales with degree
    isVisualFocus: node.id === visual.anchor,
    isAnchor: hasAcceptedEdges && node.id === visual.anchor,
    width: node.id === visual.anchor ? 154 : 126,
    height: node.id === visual.anchor ? 66 : 54,
    isolated: !(edges.some(edge => edge.source === node.id || edge.target === node.id)),
  }));
  const positioned = new Map(projectedNodes.map(node => [node.id, node]));
  const fabric = neuralFabric(positioned, visual.anchor);
  const projectedEdges = edges.map((edge, index) => {
    const source = positioned.get(edge.source);
    const target = positioned.get(edge.target);
    const bend = (index % 2 ? -1 : 1) * 18;
    const mx = (source.x + target.x) / 2;
    const my = (source.y + target.y) / 2;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const cx = mx - dy / length * bend;
    const cy = my + dx / length * bend;
    return {
      ...edge,
      id: edgeId(edge),
      path: `M${source.x.toFixed(1)},${source.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${target.x.toFixed(1)},${target.y.toFixed(1)}`,
      directional: !SYMMETRIC.has(edge.type),
      animated: edge.flowing === true && FLOW_TYPES.has(edge.type) && FLOW_STATUSES.has(edge.status) && !reducedMotion,
    };
  });
  const nodeNames = new Map(projectedNodes.map(node => [node.id, node.name || node.id]));
  const rows = [
    ...projectedNodes.map(node => ({ kind: "agent", id: `node:${node.id}`, agentId: node.id, label: node.name || node.id, status: node.status, mode: node.mode, degree: node.degree, componentId: node.componentId, isolated: node.isolated, isAnchor: node.isAnchor, isVisualFocus: node.isVisualFocus, avatar: node.avatar || "" })),
    ...projectedEdges.map(edge => ({
      kind: "relationship",
      id: `edge:${edge.id}`,
      type: edge.type,
      source: edge.source,
      sourceLabel: nodeNames.get(edge.source),
      target: edge.target,
      targetLabel: nodeNames.get(edge.target),
      status: edge.status || (edge.flowing ? "running" : "recorded"),
      provenanceId: edge.provenance.id,
      provenanceSource: edge.provenance.source,
    })),
  ];

  const hasRelationships = projectedEdges.length > 0;
  return {
    nodes: projectedNodes,
    edges: projectedEdges,
    fabric,
    components,
    legend: { relations: RELATIONS, statuses: STATUSES },
    rows,
    metadata: {
      ...(topology.metadata || {}),
      nodeCount: projectedNodes.length,
      edgeCount: projectedEdges.length,
      droppedRelations: (topology.metadata?.droppedRelations || 0) + sourceEdges.length - edges.length,
      hasRelationships,
    },
    emptyState: hasRelationships ? null : {
      title: "No verified relationships yet",
      detail: "Edges appear only when configuration, task, subagent, or communication records identify both agents and their provenance.",
    },
  };
}
