const validId = (value) => typeof value === 'string' && value.length > 0;

export function buildAgentTopology({ agents = [], tasks = [], subagents = [], communications = [] } = {}) {
  const nodes = agents.filter((agent) => validId(agent?.id)).map((agent) => ({ ...agent }));
  const known = new Set(nodes.map((node) => node.id));
  const edges = [];
  const seen = new Set();
  let droppedRelations = 0;
  const add = ({ source, target, type, provenance, flowing = false }) => {
    if (!known.has(source) || !known.has(target) || source === target || !validId(provenance?.id)) {
      droppedRelations += 1; return;
    }
    const key = `${source}\0${target}\0${type}\0${provenance.source}\0${provenance.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, type, provenance, flowing });
  };

  for (const agent of nodes) for (const dependency of agent.dependencies ?? []) add({
    source: dependency, target: agent.id, type: 'dependency',
    provenance: { source: 'configuration', id: `${agent.id}:${dependency}` },
  });
  for (const relation of subagents) add({
    source: relation.parentAgentId, target: relation.agentId, type: 'spawned_subagent',
    provenance: { source: 'subagent', id: relation.id },
  });
  for (const relation of communications) add({
    source: relation.fromAgentId, target: relation.toAgentId, type: 'communication',
    provenance: { source: 'communication', id: relation.id },
    flowing: relation.status === 'queued' || relation.status === 'running',
  });
  for (const task of tasks) add({
    source: task.sourceAgentId, target: task.agentId, type: 'task_assignment',
    provenance: { source: 'task', id: task.id },
    flowing: task.status === 'queued' || task.status === 'running',
  });

  return {
    nodes, edges,
    metadata: { nodeCount: nodes.length, edgeCount: edges.length, droppedRelations, hasRelationships: edges.length > 0 },
  };
}
