const CODE_FENCE = /(^|\n)\s*(```|~~~)[\s\S]*?(\n\s*\2|$)/g;
const INLINE_CODE = /`[^`\n]*`/g;

function resolveLink(raw, fromRel, byPath, byBase) {
  const clean = raw.trim().replace(/\\/g, '/').replace(/\.md$/i, '').replace(/^\.\//, '');
  if (!clean) return null;
  const key = clean.toLowerCase();
  if (byPath.has(key)) return byPath.get(key);
  const candidates = byBase.get(key.split('/').pop());
  if (!candidates?.length) return null;
  if (candidates.length === 1) return candidates[0];
  const suffix = candidates.find((candidate) => candidate.toLowerCase().replace(/\.md$/, '').endsWith(`/${key}`));
  if (suffix) return suffix;
  const directory = fromRel.slice(0, fromRel.lastIndexOf('/') + 1);
  const sibling = candidates.find((candidate) => candidate.startsWith(directory) && !candidate.slice(directory.length).includes('/'));
  return sibling ?? [...candidates].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
}

function effectTier(count) {
  if (count > 1000) return 'aggregate-ready';
  if (count > 250) return 'reduced';
  return 'full';
}

export function buildVaultGraph({ files = [], generatedAt = new Date().toISOString() } = {}) {
  const nodes = new Map();
  const byPath = new Map();
  const byBase = new Map();
  const edges = [];
  const seen = new Set();
  const adjacencySets = new Map();
  const addNode = (id, node) => {
    if (!nodes.has(id)) nodes.set(id, { id, degree: 0, ...node });
    return nodes.get(id);
  };
  const addEdge = (source, target, type) => {
    if (source === target || !nodes.has(source) || !nodes.has(target)) return;
    const key = `${source < target ? `${source}\0${target}` : `${target}\0${source}`}\0${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, type });
    nodes.get(source).degree += 1;
    nodes.get(target).degree += 1;
    if (!adjacencySets.has(source)) adjacencySets.set(source, new Set());
    if (!adjacencySets.has(target)) adjacencySets.set(target, new Set());
    adjacencySets.get(source).add(target);
    adjacencySets.get(target).add(source);
  };

  const readableFiles = files.filter((file) => typeof file?.rel === 'string' && file.rel.toLowerCase().endsWith('.md'));
  for (const file of readableFiles) {
    const label = file.rel.split('/').pop().replace(/\.md$/i, '');
    const directory = file.rel.includes('/') ? file.rel.slice(0, file.rel.lastIndexOf('/')) : '';
    addNode(file.rel, { label, folder: directory || '(root)', type: 'note', mtime: file.mtime ?? 0 });
    byPath.set(file.rel.toLowerCase().replace(/\.md$/, ''), file.rel);
    const base = label.toLowerCase();
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(file.rel);
  }

  for (const file of readableFiles) {
    const body = String(file.text ?? '').replace(CODE_FENCE, '\n').replace(INLINE_CODE, ' ');
    for (const match of body.matchAll(/!?\[\[([^\]\n]+?)\]\]/g)) {
      const raw = match[1].split('|')[0].split('#')[0];
      const target = resolveLink(raw, file.rel, byPath, byBase);
      if (target) { addEdge(file.rel, target, 'link'); continue; }
      const name = raw.trim().replace(/\.md$/i, '').split('/').pop();
      if (!/^[\w][\w .'&()+-]{1,60}$/.test(name)) continue;
      const id = `ghost:${name}`;
      addNode(id, { label: name, folder: '(unresolved)', type: 'ghost', mtime: 0 });
      addEdge(file.rel, id, 'ghost');
    }
    for (const match of body.matchAll(/\]\(([^)\s]+\.md)\)/g)) {
      let raw;
      try { raw = decodeURIComponent(match[1]); } catch { raw = match[1]; }
      const target = resolveLink(raw, file.rel, byPath, byBase);
      if (target) addEdge(file.rel, target, 'link');
    }
    for (const match of body.matchAll(/(?:^|[\s(])#([A-Za-z][\w-]*(?:\/[\w-]+)*)/gm)) {
      const id = `tag:${match[1].toLowerCase()}`;
      addNode(id, { label: `#${match[1]}`, folder: '(tags)', type: 'tag', mtime: 0 });
      addEdge(file.rel, id, 'tag');
    }
  }

  for (const file of readableFiles) {
    const parts = file.rel.split('/').slice(0, -1);
    let previous = null;
    for (let index = 0; index < parts.length; index += 1) {
      const id = `folder:${parts.slice(0, index + 1).join('/')}`;
      addNode(id, { label: parts[index], folder: parts[0], type: 'folder', mtime: 0 });
      if (previous) addEdge(previous, id, 'folder');
      previous = id;
    }
    if (previous) addEdge(file.rel, previous, 'folder');
  }

  const linkedNotes = new Set();
  for (const edge of edges) if (edge.type === 'link' || edge.type === 'ghost') {
    if (nodes.get(edge.source)?.type === 'note') linkedNotes.add(edge.source);
    if (nodes.get(edge.target)?.type === 'note') linkedNotes.add(edge.target);
  }
  const stats = {
    notes: readableFiles.length,
    links: edges.filter((edge) => edge.type === 'link').length,
    ghosts: edges.filter((edge) => edge.type === 'ghost').length,
    tagEdges: edges.filter((edge) => edge.type === 'tag').length,
    folderEdges: edges.filter((edge) => edge.type === 'folder').length,
    orphans: [...nodes.values()].filter((node) => node.type === 'note' && !linkedNotes.has(node.id)).length,
  };
  return {
    nodes: [...nodes.values()], edges, stats,
    metadata: {
      totalNodes: nodes.size, totalEdges: edges.length, unresolvedLinks: stats.ghosts,
      orphanNotes: stats.orphans, effectTier: effectTier(nodes.size), aggregation: 'none', generatedAt,
    },
    adjacency: Object.fromEntries([...nodes.keys()].map((id) => [id, [...(adjacencySets.get(id) ?? [])]])),
  };
}
