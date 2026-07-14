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

function gridPositions(ids, { x, y, width, height }) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(ids.length * (width / Math.max(height, 1)))));
  const rows = Math.max(1, Math.ceil(ids.length / columns));
  return new Map(ids.map((id, index) => [id, {
    x: x + ((index % columns) + 0.5) * width / columns,
    y: y + (Math.floor(index / columns) + 0.5) * height / rows,
  }]));
}

function rankedPositions(ids, edges, { x, y, width, height }) {
  const member = new Set(ids);
  const outgoing = new Map(ids.map(id => [id, []]));
  const indegree = new Map(ids.map(id => [id, 0]));
  for (const edge of edges) {
    if (!member.has(edge.source) || !member.has(edge.target)) continue;
    outgoing.get(edge.source).push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  }
  for (const targets of outgoing.values()) targets.sort();
  const roots = ids.filter(id => indegree.get(id) === 0);
  const queue = (roots.length ? roots : [ids[0]]).map(id => [id, 0]);
  const rank = new Map();
  while (queue.length) {
    const [id, level] = queue.shift();
    if (rank.has(id)) continue;
    rank.set(id, level);
    for (const target of outgoing.get(id)) queue.push([target, level + 1]);
  }
  for (const id of ids) if (!rank.has(id)) rank.set(id, 0);
  const levels = new Map();
  for (const id of ids) {
    const level = rank.get(id);
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(id);
  }
  const maxRank = Math.max(...levels.keys(), 0);
  const positions = new Map();
  for (const [level, levelIds] of [...levels].sort((a, b) => a[0] - b[0])) {
    levelIds.sort();
    levelIds.forEach((id, index) => positions.set(id, {
      x: x + (maxRank ? level / maxRank : (index + 1) / (levelIds.length + 1)) * width,
      y: y + (index + 1) * height / (levelIds.length + 1),
    }));
  }
  return positions;
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
  const connected = components.filter(component => component.length > 1);
  const isolated = components.filter(component => component.length === 1).flat();
  const positions = new Map();
  const padding = 58;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  if (!connected.length) {
    for (const [id, position] of gridPositions(isolated, { x: padding, y: padding, width: usableWidth, height: usableHeight })) positions.set(id, position);
  } else {
    const isolatedHeight = isolated.length ? Math.min(140, usableHeight * 0.3) : 0;
    const connectedHeight = usableHeight - isolatedHeight;
    connected.forEach((component, index) => {
      const bandHeight = connectedHeight / connected.length;
      const band = { x: padding, y: padding + index * bandHeight, width: usableWidth, height: bandHeight };
      for (const [id, position] of rankedPositions(component, edges, band)) positions.set(id, position);
    });
    if (isolated.length) for (const [id, position] of gridPositions(isolated, { x: padding, y: padding + connectedHeight, width: usableWidth, height: isolatedHeight })) positions.set(id, position);
  }

  const degreeOf = new Map(nodes.map(node => [node.id, 0]));
  for (const edge of edges) {
    degreeOf.set(edge.source, (degreeOf.get(edge.source) || 0) + 1);
    degreeOf.set(edge.target, (degreeOf.get(edge.target) || 0) + 1);
  }
  const projectedNodes = nodes.map(node => ({
    ...node,
    ...positions.get(node.id),
    status: nodeState(node),
    mode: MODES.has(node.proc?.mode) ? node.proc.mode : null,
    componentId: components.findIndex(component => component.includes(node.id)),
    degree: degreeOf.get(node.id) || 0,   // Stage 3: neural glow intensity scales with degree
    isolated: !(edges.some(edge => edge.source === node.id || edge.target === node.id)),
  }));
  const positioned = new Map(projectedNodes.map(node => [node.id, node]));
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
    ...projectedNodes.map(node => ({ kind: "agent", id: `node:${node.id}`, agentId: node.id, label: node.name || node.id, status: node.status, mode: node.mode })),
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
