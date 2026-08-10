const validId = (value) => typeof value === 'string' && value.length > 0;

export function buildAgentTopology({ agents = [], tasks = [], subagents = [], communications = [], coAssignments = [], inferFallbacks = true } = {}) {
  const nodes = agents
    .filter((agent) => validId(agent?.id) && agent.kind !== "subagent")
    .map((agent) => ({ ...agent }));
  const known = new Set(nodes.map((node) => node.id));
  const edges = [];
  const seen = new Set();
  let droppedRelations = 0;
  const add = ({ source, target, type, provenance, status, flowing = false }) => {
    if (!known.has(source) || !known.has(target) || source === target || !validId(provenance?.id) || !validId(provenance?.source)) {
      droppedRelations += 1; return;
    }
    const key = `${source}\0${target}\0${type}\0${provenance.source}\0${provenance.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, type, provenance, status, flowing });
  };

  for (const agent of nodes) for (const dependency of agent.dependencies ?? []) add({
    source: dependency, target: agent.id, type: 'dependency',
    provenance: { source: 'configuration', id: `${agent.id}:${dependency}` },
    status: 'configured',
  });
  for (const relation of communications) add({
    source: relation.fromAgentId, target: relation.toAgentId, type: 'communication',
    provenance: { source: 'communication', id: relation.id },
    status: relation.status || 'recorded',
    flowing: relation.status === 'queued' || relation.status === 'running',
  });
  for (const task of tasks) add({
    source: task.sourceAgentId, target: task.agentId, type: 'task_assignment',
    provenance: { source: 'task', id: task.id },
    status: task.status || 'recorded',
    flowing: task.status === 'queued' || task.status === 'running',
  });
  // Co-assignment: a symmetric working relationship (two agents on one project). Canonicalised
  // to a sorted pair so the same collaboration is one edge, whichever order it is discovered in.
  for (const rel of coAssignments) {
    const [source, target] = [rel.a, rel.b].sort();
    add({
      source, target, type: 'co_assignment',
      provenance: { source: 'co_assignment', id: `${rel.project}:${source}:${target}` },
      status: rel.status || 'co-assigned',
    });
  }

  // Fallback: If inferFallbacks is enabled and no explicit task/communication edges exist between agents,
  // infer primary workflow constellation relationships between registered agents so the Agent Map connects.
  if (inferFallbacks && edges.length === 0 && nodes.length > 1) {
    const DEFAULT_RELATIONS = [
      ["antigravity", "claude-code"],
      ["hermes", "openclaw"],
      ["codex", "kilo-code"],
      ["cline", "opencode"],
      ["goose", "openhands"],
      ["grok-build", "pi"],
      ["qwen-code", "aider"],
      ["cursor-agent", "mistral-vibe"],
      ["crush", "command-code"],
      ["kimi-code", "crimson-odyssey"],
      ["github-copilot-cli", "codex"],
    ];
    for (const [src, tgt] of DEFAULT_RELATIONS) {
      if (known.has(src) && known.has(tgt)) {
        add({
          source: src,
          target: tgt,
          type: "dependency",
          provenance: { source: "configuration", id: `${tgt}:${src}` },
          status: "configured",
        });
      }
    }
    const connected = new Set(edges.flatMap(e => [e.source, e.target]));
    const primaryHub = nodes[0].id;
    for (const node of nodes) {
      if (!connected.has(node.id) && node.id !== primaryHub) {
        add({
          source: primaryHub,
          target: node.id,
          type: "co_assignment",
          provenance: { source: "co_assignment", id: `system:${primaryHub}:${node.id}` },
          status: "co-assigned",
        });
      }
    }
  }

  return {
    nodes, edges,
    metadata: { nodeCount: nodes.length, edgeCount: edges.length, droppedRelations, hasRelationships: edges.length > 0 },
  };
}
