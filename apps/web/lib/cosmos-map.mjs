/* Cosmos agent map view-model — projects the verified agent topology onto the
   Neural Cosmos stage (900×620): a Neural Vault core orb at the center, agents on
   an elliptical orbit, curved glowing edges, deterministic stars.

   Evidence policy is inherited wholesale from buildAgentMap(): every drawn
   agent↔agent edge is a provenance-complete record, never decoration. The only
   additions here are (a) geometry, (b) a visual tier per relationship type, and
   (c) core→agent "vault lane" links that exist only when the runtime shows the
   agent actually has a vault lane or has written to it. */
import { buildAgentMap } from "./agent-map.mjs";

export const COSMOS_WIDTH = 900;
export const COSMOS_HEIGHT = 620;
export const CORE_ID = "core:neural-vault";
const CORE_X = 450;
const CORE_Y = 308;

/* Relationship type → visual weight. Strong = structural bonds, data = live
   traffic, weak = soft association. Purely presentational; the type itself
   stays on the edge for the inspector and evidence table. */
export const TIER_BY_TYPE = {
  dependency: "strong",
  spawned_subagent: "strong",
  task_assignment: "data",
  communication: "data",
  co_assignment: "weak",
};

export const TIER_LEGEND = [
  { tier: "strong", label: "STRONG", description: "dependency · subagent" },
  { tier: "data", label: "DATA", description: "task · communication" },
  { tier: "weak", label: "WEAK", description: "co-assignment" },
  { tier: "lane", label: "VAULT LANE", description: "observed vault activity" },
];

/** Quadratic bezier with a perpendicular bend, capped so long edges stay calm. */
export function curvePath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const bend = Math.min(len * 0.13, 42);
  const nx = (-dy / len) * bend;
  const ny = (dx / len) * bend;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${(mx + nx).toFixed(1)} ${(my + ny).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Deterministic LCG starfield — same seed math every render, no Math.random. */
export function starField(width = COSMOS_WIDTH, height = COSMOS_HEIGHT, count = 130) {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 9301 + 49297) % 233280;
    return {
      id: i,
      x: Number(((seed * 0.00429) % width).toFixed(1)),
      y: Number(((((seed * 7) % 233280) * 0.00266) % height).toFixed(1)),
      r: Number(((seed % 12) * 0.1 + 0.2).toFixed(2)),
      opacity: Number(((seed % 60) * 0.008 + 0.08).toFixed(3)),
      delay: Number(((seed % 50) * 0.1).toFixed(1)),
    };
  });
}

function hashId(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Agents on elliptical orbit rings around the core. Deterministic: sorted ids,
    per-id jitter from a string hash (so the layout looks hand-placed, not clocklike),
    ring 2 opens inside once the outer ring holds 10. Always inside the padding. */
export function cosmosPositions(ids, {
  cx = CORE_X, cy = CORE_Y, rx = 352, ry = 224,
  width = COSMOS_WIDTH, height = COSMOS_HEIGHT, padding = 64,
} = {}) {
  const sorted = [...ids].map(String).sort((a, b) => a.localeCompare(b));
  const positions = new Map();
  const ringCapacity = 10;
  const rings = [1, 0.58, 0.33];
  for (let index = 0; index < sorted.length; index++) {
    const id = sorted[index];
    const ring = Math.min(Math.floor(index / ringCapacity), rings.length - 1);
    const ringStart = ring * ringCapacity;
    const count = Math.min(ringCapacity, sorted.length - ringStart);
    const inRing = index - ringStart;
    const h = hashId(id);
    const angleJitter = ((h % 100) / 100 - 0.5) * 0.14;             // ±0.07 rad
    const radiusJitter = 1 + (((h >> 7) % 100) / 100 - 0.5) * 0.16; // ±8%
    const angle = -Math.PI / 2 + (inRing * Math.PI * 2) / count + (ring % 2 ? Math.PI / count : 0) + angleJitter;
    const x = cx + Math.cos(angle) * rx * rings[ring] * radiusJitter;
    const y = cy + Math.sin(angle) * ry * rings[ring] * radiusJitter;
    positions.set(id, {
      x: Number(Math.min(width - padding, Math.max(padding, x)).toFixed(1)),
      y: Number(Math.min(height - padding, Math.max(padding, y)).toFixed(1)),
    });
  }
  return positions;
}

function recencyDays(lastSeen) {
  if (!lastSeen) return null;
  const then = Date.parse(lastSeen);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

/** The full cosmos projection. `topology` is the /api/agent-topology payload
    (or the beginTopologyRefresh fallback); `agents` is the /api/state roster,
    used only for the evidenced vault-lane links. */
export function buildCosmosMap(topology = {}, agents = [], { reducedMotion = false } = {}) {
  const base = buildAgentMap(topology, { width: COSMOS_WIDTH, height: COSMOS_HEIGHT, reducedMotion });
  const positions = cosmosPositions(base.nodes.map(node => node.id));
  const maxDegree = Math.max(1, ...base.nodes.map(node => node.degree || 0));

  const nodes = base.nodes.map(node => {
    const days = recencyDays(node.lastSeen);
    return {
      ...node,
      ...positions.get(node.id),
      uptimePct: typeof node.uptime?.pct === "number" ? Math.round(node.uptime.pct) : null,
      lane: node.lane || null,
      lastSeen: node.lastSeen || null,
      lastFile: node.lastFile || null,
      signals: {
        uptimePct: typeof node.uptime?.pct === "number" ? Math.round(node.uptime.pct) : null,
        links: node.degree || 0,
        linksPct: Math.round(((node.degree || 0) / maxDegree) * 100),
        recencyDays: days,
        recencyPct: days === null ? null : Math.max(0, 100 - days * 14),
      },
    };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));

  const edges = base.edges.map(edge => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    const tier = TIER_BY_TYPE[edge.type] || "weak";
    return {
      ...edge,
      tier,
      path: curvePath(source.x, source.y, target.x, target.y),
      particle: tier !== "weak" && !reducedMotion,
    };
  });

  /* Vault lanes: drawn only for agents whose runtime record shows a configured
     Brains/ lane or an observed vault write. Roster entries that are not in the
     topology (mid-refresh) are skipped rather than invented. */
  const laneLinks = [...agents]
    .filter(agent => agent?.id && byId.has(agent.id) && (agent.lane || agent.lastSeen))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(agent => {
      const node = byId.get(agent.id);
      return {
        id: `lane:${agent.id}`,
        agentId: agent.id,
        path: curvePath(CORE_X, CORE_Y, node.x, node.y),
        lane: agent.lane || null,
        lastSeen: agent.lastSeen || null,
        lastFile: agent.lastFile || null,
      };
    });

  return {
    core: {
      id: CORE_ID,
      name: "Neural Vault",
      subtitle: "CORE INTELLIGENCE",
      x: CORE_X,
      y: CORE_Y,
      laneCount: laneLinks.length,
    },
    nodes,
    edges,
    laneLinks,
    stars: starField(),
    legend: { statuses: base.legend.statuses, relations: base.legend.relations, tiers: TIER_LEGEND },
    rows: base.rows,
    metadata: base.metadata,
    emptyState: base.emptyState,
  };
}
