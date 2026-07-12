import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgentTopology } from '../lib/agent-topology.mjs';

const agents = [
  { id: 'codex', name: 'Codex', status: 'online' },
  { id: 'hermes', name: 'Hermes', status: 'idle', dependencies: ['codex'] },
  { id: 'pi', name: 'Pi', status: 'offline' },
];

test('renders an honest unconnected fleet when no relationship evidence exists', () => {
  const topology = buildAgentTopology({ agents: agents.map(({ dependencies, ...agent }) => agent) });
  assert.equal(topology.nodes.length, 3);
  assert.deepEqual(topology.edges, []);
  assert.deepEqual(topology.metadata, { nodeCount: 3, edgeCount: 0, droppedRelations: 0, hasRelationships: false });
});

test('includes only provenance-backed edges between configured agents', () => {
  const topology = buildAgentTopology({
    agents,
    subagents: [{ id: 'spawn-1', parentAgentId: 'codex', agentId: 'pi' }],
    communications: [
      { id: 'msg-1', fromAgentId: 'pi', toAgentId: 'hermes', status: 'running' },
      { fromAgentId: 'codex', toAgentId: 'hermes' },
      { id: 'msg-missing', fromAgentId: 'codex', toAgentId: 'unknown' },
    ],
  });

  assert.deepEqual(topology.edges.map((edge) => ({ source: edge.source, target: edge.target, type: edge.type, provenance: edge.provenance })), [
    { source: 'codex', target: 'hermes', type: 'dependency', provenance: { source: 'configuration', id: 'hermes:codex' } },
    { source: 'codex', target: 'pi', type: 'spawned_subagent', provenance: { source: 'subagent', id: 'spawn-1' } },
    { source: 'pi', target: 'hermes', type: 'communication', provenance: { source: 'communication', id: 'msg-1' } },
  ]);
  assert.equal(topology.edges[2].flowing, true);
  assert.equal(topology.metadata.droppedRelations, 2);
});

test('task edges require explicit source and assignee rather than a fabricated core', () => {
  const topology = buildAgentTopology({ agents, tasks: [
    { id: 'task-1', sourceAgentId: 'hermes', agentId: 'codex', status: 'queued' },
    { id: 'task-2', agentId: 'pi', status: 'running' },
  ] });
  assert.deepEqual(topology.edges.filter((edge) => edge.type === 'task_assignment').map((edge) => [edge.source, edge.target, edge.flowing]), [
    ['hermes', 'codex', true],
  ]);
  assert.equal(topology.metadata.droppedRelations, 1);
});
