import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVaultGraph } from '../lib/vault-graph.mjs';

test('preserves notes, resolved links, ghosts, tags, folders, and orphans in one parity dataset', () => {
  const graph = buildVaultGraph({ files: [
    { rel: 'Projects/A.md', mtime: 3, text: '# A\n[[B]] [[Missing]] #project\n```\n[[Ignored]]\n```' },
    { rel: 'Projects/B.md', mtime: 2, text: '# B\n[A](A.md)' },
    { rel: 'Loose.md', mtime: 1, text: '# Loose' },
  ], generatedAt: '2026-07-12T00:00:00.000Z' });

  assert.equal(graph.nodes.filter((node) => node.type === 'note').length, 3);
  assert.deepEqual(graph.stats, { notes: 3, links: 1, ghosts: 1, tagEdges: 1, folderEdges: 2, orphans: 1 });
  assert.equal(graph.nodes.some((node) => node.id === 'ghost:Missing'), true);
  assert.equal(graph.nodes.some((node) => node.id === 'ghost:Ignored'), false);
  assert.deepEqual(graph.metadata, {
    totalNodes: 6, totalEdges: 5, unresolvedLinks: 1, orphanNotes: 1,
    effectTier: 'full', aggregation: 'none', generatedAt: '2026-07-12T00:00:00.000Z',
  });
  assert.deepEqual(graph.adjacency['Projects/A.md'].sort(), ['Projects/B.md', 'folder:Projects', 'ghost:Missing', 'tag:project'].sort());
});

test('resolves duplicate basenames path-first and emits every undirected edge once', () => {
  const graph = buildVaultGraph({ files: [
    { rel: 'One/Index.md', mtime: 1, text: '[[Note]] [[Note]]' },
    { rel: 'One/Note.md', mtime: 1, text: '' },
    { rel: 'Two/Note.md', mtime: 1, text: '' },
    { rel: 'Root.md', mtime: 1, text: '[[Two/Note]]' },
  ] });
  const links = graph.edges.filter((edge) => edge.type === 'link');
  assert.deepEqual(links.map(({ source, target }) => [source, target]), [
    ['One/Index.md', 'One/Note.md'], ['Root.md', 'Two/Note.md'],
  ]);
});

test('marks large datasets for reduced effects without removing graph truth', () => {
  const files = Array.from({ length: 1001 }, (_, index) => ({ rel: `N${index}.md`, mtime: index, text: '' }));
  const graph = buildVaultGraph({ files });
  assert.equal(graph.nodes.length, 1001);
  assert.equal(graph.metadata.effectTier, 'aggregate-ready');
  assert.equal(graph.metadata.aggregation, 'none');
});
