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
  assert.deepEqual(graph.stats, { notes: 3, assets: 0, codeFiles: 0, links: 1, ghosts: 1, tagEdges: 1, folderEdges: 2, orphans: 1 });
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

test('non-markdown vault files become asset nodes — embeds resolve to them instead of ghosts', () => {
  const graph = buildVaultGraph({ files: [
    { rel: 'Assets/Images/cosmos-brain.png', mtime: 5 },
    { rel: '[SYSTEM OVERRIDE & SYNCHRONIZATION.txt', mtime: 4 },
    { rel: 'Welcome.md', mtime: 3, text: '![[cosmos-brain.png]]' },
  ] });
  const asset = graph.nodes.find((node) => node.id === 'Assets/Images/cosmos-brain.png');
  assert.equal(asset?.type, 'asset');
  assert.equal(graph.nodes.find((node) => node.id === '[SYSTEM OVERRIDE & SYNCHRONIZATION.txt')?.type, 'asset',
    'the Boss decree .txt is finally visible to the graph');
  assert.equal(graph.edges.some((edge) => edge.type === 'link' && edge.target === 'Assets/Images/cosmos-brain.png'), true,
    'the embed resolves to the real asset, not a ghost');
  assert.equal(graph.nodes.some((node) => node.id === 'ghost:cosmos-brain.png'), false);
  assert.equal(graph.stats.notes, 1, 'assets never inflate the note count');
  assert.equal(graph.stats.assets, 2);
});

test('repo source files become a code layer under the virtual Repo/ folder', () => {
  const graph = buildVaultGraph({ files: [
    { rel: 'Repo/apps/web/server.js', mtime: 2, kind: 'repo' },
    { rel: 'Repo/package.json', mtime: 1, kind: 'repo' },
    { rel: 'INDEX.md', mtime: 3, text: '# index' },
  ] });
  const code = graph.nodes.filter((node) => node.type === 'code');
  assert.deepEqual(code.map((node) => node.id).sort(), ['Repo/apps/web/server.js', 'Repo/package.json']);
  assert.equal(graph.edges.some((edge) => edge.type === 'folder' && edge.source === 'Repo/apps/web/server.js' && edge.target === 'folder:Repo/apps/web'), true);
  assert.equal(graph.stats.codeFiles, 2);
  assert.equal(graph.stats.notes, 1);
  assert.equal(graph.stats.assets, 0, 'repo files are code, never vault assets');
});
