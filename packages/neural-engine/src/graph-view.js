export function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const RENDER_PROFILES = Object.freeze({
  full: Object.freeze({
    tier: "full", layoutIterations: 42, maxHalos: 96, starAreaPerPoint: 6500,
    labelMinDegree: 3, labelZoom: 1.6, folderLabelZoom: .55, maxLabels: 48,
    drawNodeCores: true, shadowMode: "all",
  }),
  reduced: Object.freeze({
    tier: "reduced", layoutIterations: 28, maxHalos: 32, starAreaPerPoint: 11000,
    labelMinDegree: 5, labelZoom: 2, folderLabelZoom: .8, maxLabels: 28,
    drawNodeCores: true, shadowMode: "active",
  }),
  "aggregate-ready": Object.freeze({
    tier: "aggregate-ready", layoutIterations: 18, maxHalos: 12, starAreaPerPoint: 18000,
    labelMinDegree: 8, labelZoom: 2.4, folderLabelZoom: 1, maxLabels: 16,
    drawNodeCores: false, shadowMode: "active",
  }),
});

export function graphRenderProfile(effectTier, nodeCount = 0) {
  const inferred = nodeCount > 1000 ? "aggregate-ready" : nodeCount > 250 ? "reduced" : "full";
  return RENDER_PROFILES[effectTier] || RENDER_PROFILES[inferred];
}

export function selectLabelNodeIds(nodes = [], profile = RENDER_PROFILES.full) {
  const maxLabels = Math.max(0, Number(profile.maxLabels) || 0);
  const structural = nodes
    .filter(node => node.type === "folder")
    .sort((a, b) => (b.degree || 0) - (a.degree || 0) || a.id.localeCompare(b.id));
  const hubs = nodes
    .filter(node => node.type !== "ghost" && node.type !== "folder" && (node.degree || 0) >= profile.labelMinDegree)
    .sort((a, b) => (b.degree || 0) - (a.degree || 0) || Number(b.recent) - Number(a.recent) || a.id.localeCompare(b.id));
  const structuralBudget = Math.min(structural.length, Math.max(1, Math.floor(maxLabels * .4)));
  const selected = [...structural.slice(0, structuralBudget), ...hubs.slice(0, maxLabels - structuralBudget)];
  const selectedIds = new Set(selected.map(node => node.id));
  for (const node of [...structural, ...hubs]) {
    if (selectedIds.size >= maxLabels) break;
    selectedIds.add(node.id);
  }
  return selectedIds;
}

export function labelBudgetForWidth(profile, width) {
  const configured = Math.max(0, Number(profile?.maxLabels) || 0);
  if (!configured) return 0;
  return Math.min(configured, Math.max(8, Math.floor(Math.max(0, Number(width) || 0) / 42)));
}

export function resolveMotionState(requested, systemReduced) {
  if (systemReduced) return { enabled: false, disabled: true, label: "SYSTEM MOTION OFF" };
  return requested
    ? { enabled: true, disabled: false, label: "PAUSE" }
    : { enabled: false, disabled: false, label: "RESUME" };
}

export function labelForNodeId(nodes = [], id) {
  if (!id) return "";
  return nodes.find(node => node.id === id)?.label || id;
}

function edgeKey(edge) {
  const source = edge.source ?? edge.s, target = edge.target ?? edge.t;
  return `${source < target ? `${source}|${target}` : `${target}|${source}`}|${edge.type || "link"}`;
}

export function datasetIdentity(data = {}) {
  const nodes = (data.nodes || []).map(node => node.id).sort().join("\n");
  const edges = (data.edges || []).map(edgeKey).sort().join("\n");
  return hashString(`${nodes}\n--\n${edges}`).toString(16).padStart(8, "0");
}

function clusterName(node) {
  if (node.type === "ghost") return "(unresolved)";
  if (node.type === "tag") return "(tags)";
  if (node.type === "folder") return node.id.replace(/^folder:/, "").split("/")[0] || "(root)";
  return (node.folder || "(root)").split("/")[0];
}

function clusterCenters(names, width, height, identity) {
  const ordered = [...new Set(names)].sort();
  const rotation = seededRandom(hashString(`${identity}|cluster-ring`))() * Math.PI * 2;
  const radiusX = width * .34, radiusY = height * .32;
  return new Map(ordered.map((name, index) => {
    if (name === "(root)") return [name, { x: 0, y: 0 }];
    const ringIndex = ordered.filter(value => value !== "(root)").indexOf(name);
    const ringCount = ordered.length - Number(ordered.includes("(root)"));
    const angle = rotation + (ringIndex / Math.max(1, ringCount)) * Math.PI * 2;
    const stagger = ringIndex % 2 ? .82 : 1;
    return [name, { x: Math.cos(angle) * radiusX * stagger, y: Math.sin(angle) * radiusY * stagger }];
  }));
}

export function layoutGraph(data = {}, { width = 800, height = 600, iterations = 48 } = {}) {
  const identity = data.metadata?.datasetIdentity || datasetIdentity(data);
  const clusterMap = clusterCenters((data.nodes || []).map(clusterName), width, height, identity);
  const nodes = (data.nodes || []).map(node => {
    const random = seededRandom(hashString(`${identity}|node|${node.id}`));
    const center = clusterMap.get(clusterName(node)) || { x: 0, y: 0 };
    const spread = Math.min(width, height) * 0.16;
    return {
      ...node,
      x: center.x + (random() - 0.5) * spread,
      y: center.y + (random() - 0.5) * spread,
      vx: 0, vy: 0,
      mass: 1 + Math.log2((node.degree || 0) + 1),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = (data.edges || []).map(edge => ({ a: byId.get(edge.source ?? edge.s), b: byId.get(edge.target ?? edge.t), type: edge.type || "link" })).filter(edge => edge.a && edge.b);
  const centers = clusterMap;
  const steps = Math.max(0, Math.min(120, Number(iterations) || 0));

  for (let step = 0; step < steps; step += 1) {
    for (let index = 0; index < nodes.length; index += 1) {
      const a = nodes[index];
      for (let other = index + 1; other < Math.min(nodes.length, index + 25); other += 1) {
        const b = nodes[other];
        let dx = a.x - b.x, dy = a.y - b.y, distanceSq = dx * dx + dy * dy;
        if (distanceSq < 1) { dx = .5; dy = -.5; distanceSq = .5; }
        if (distanceSq > 180000) continue;
        const distance = Math.sqrt(distanceSq), force = 1050 / distanceSq;
        dx = dx / distance * force; dy = dy / distance * force;
        a.vx += dx / a.mass; a.vy += dy / a.mass;
        b.vx -= dx / b.mass; b.vy -= dy / b.mass;
      }
    }
    for (const edge of edges) {
      const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y, distance = Math.hypot(dx, dy) || 1;
      const target = edge.type === "folder" ? 58 : edge.type === "link" ? 88 : 112;
      const force = (distance - target) * .0035;
      edge.a.vx += dx / distance * force / edge.a.mass; edge.a.vy += dy / distance * force / edge.a.mass;
      edge.b.vx -= dx / distance * force / edge.b.mass; edge.b.vy -= dy / distance * force / edge.b.mass;
    }
    for (const node of nodes) {
      const center = centers.get(clusterName(node));
      node.vx += (center.x - node.x) * .0018 / node.mass;
      node.vy += (center.y - node.y) * .0018 / node.mass;
      node.x += node.vx; node.y += node.vy;
      node.vx *= .82; node.vy *= .82;
    }
  }

  return nodes.map(({ vx: _vx, vy: _vy, ...node }) => ({ ...node, x: +node.x.toFixed(4), y: +node.y.toFixed(4) }));
}

export function layersForMode(mode) {
  return mode === "parity"
    ? { link: true, ghost: true, tag: false, folder: false }
    : { link: true, ghost: true, tag: true, folder: true };
}

export function nodeSemantics(node, { generatedAt, changedNodeIds: changed = [], recentDays = 7 } = {}) {
  const degree = Number(node.degree ?? node.deg ?? 0);
  const snapshotTime = Date.parse(generatedAt || "");
  const modifiedTime = Number(node.mtime) || 0;
  return {
    mass: 1 + Math.log2(degree + 1),
    halo: degree >= 8,
    recent: node.type === "note" && Number.isFinite(snapshotTime) && modifiedTime > 0
      && snapshotTime >= modifiedTime && snapshotTime - modifiedTime <= recentDays * 86400000,
    unresolved: node.type === "ghost",
    changed: (changed instanceof Set ? changed : new Set(changed)).has(node.id),
  };
}

export function projectGraph(data = {}, { mode = "cosmos", layers = layersForMode(mode), focusId = null } = {}) {
  const nodeAllowed = node => node.type === "note" || (node.type === "ghost" && layers.ghost) || (node.type === "tag" && layers.tag) || (node.type === "folder" && layers.folder);
  const allowed = new Set((data.nodes || []).filter(nodeAllowed).map(node => node.id));
  let edges = (data.edges || []).filter(edge => layers[edge.type || "link"] && allowed.has(edge.source ?? edge.s) && allowed.has(edge.target ?? edge.t));
  let visible = allowed;
  const appliedFocusId = focusId && allowed.has(focusId) ? focusId : null;
  if (appliedFocusId) {
    visible = new Set([appliedFocusId]);
    for (const edge of edges) {
      const source = edge.source ?? edge.s, target = edge.target ?? edge.t;
      if (source === appliedFocusId) visible.add(target);
      if (target === appliedFocusId) visible.add(source);
    }
    edges = edges.filter(edge => visible.has(edge.source ?? edge.s) && visible.has(edge.target ?? edge.t));
  }
  const nodes = (data.nodes || []).filter(node => visible.has(node.id));
  const adjacency = Object.fromEntries(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    const source = edge.source ?? edge.s, target = edge.target ?? edge.t;
    adjacency[source]?.push(target); adjacency[target]?.push(source);
  }
  const count = type => nodes.filter(node => node.type === type).length;
  return {
    nodes, edges, adjacency,
    counts: { nodes: nodes.length, edges: edges.length, notes: count("note"), ghosts: count("ghost"), tags: count("tag"), folders: count("folder") },
    metadata: {
      ...(data.metadata || {}), mode, focusId: appliedFocusId,
      datasetIdentity: data.metadata?.datasetIdentity || datasetIdentity(data),
      totalNodes: nodes.length, totalEdges: edges.length,
    },
  };
}

export function nextNodeId(nodes = [], currentId, delta = 1) {
  const ordered = [...nodes].sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)) || a.id.localeCompare(b.id));
  if (!ordered.length) return null;
  const current = ordered.findIndex(node => node.id === currentId);
  const index = current < 0 ? (delta < 0 ? ordered.length - 1 : 0) : (current + Math.sign(delta || 1) + ordered.length) % ordered.length;
  return ordered[index].id;
}

export function breadcrumbFor(node) {
  if (!node) return [];
  if (node.type === "note") return node.id.replace(/\.md$/i, "").split("/");
  if (node.type === "folder") return node.id.replace(/^folder:/, "").split("/");
  return [node.folder, node.label].filter(Boolean);
}

function signature(node) { return `${node.type}|${node.folder}|${node.degree || 0}|${node.mtime || 0}`; }
export function changedNodeIds(previous = {}, next = {}) {
  const before = new Map((previous.nodes || []).map(node => [node.id, signature(node)]));
  return new Set((next.nodes || []).filter(node => !before.has(node.id) || before.get(node.id) !== signature(node)).map(node => node.id));
}
