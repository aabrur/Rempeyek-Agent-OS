import { memo } from "react";
import { m } from "framer-motion";
import { CORE_ID } from "../../lib/cosmos-map.mjs";
import { agentAccent } from "../lib/agents";
import { CORE_ICON, iconFor } from "../lib/agent-icons";

const RELATION_LABEL = {
  dependency: "Dependency",
  co_assignment: "Co-assignment",
  task_assignment: "Task assignment",
  spawned_subagent: "Spawned subagent",
  communication: "Communication",
};
const TIER_OPACITY = { strong: 0.75, data: 0.55, weak: 0.22 };

const CosmosEdge = memo(function CosmosEdge({ edge, row, index, selectionId, activeAgentId, effectsOn, reducedMotion, onSelect, onKeyDown, setFocusRef }) {
  const id = `edge:${edge.id}`;
  const related = !selectionId || selectionId === id || (activeAgentId && (edge.source === activeAgentId || edge.target === activeAgentId));
  const lift = selectionId && related ? 1.8 : 1;
  const baseOpacity = TIER_OPACITY[edge.tier] ?? 0.4;
  const opacity = selectionId && !related ? 0.08 : Math.min(1, baseOpacity * lift);
  const CoreIdle = !effectsOn;
  return <g className={`cosmos-edge-group${selectionId === id ? " is-selected" : ""}`}>
    <m.path
      className={`cosmos-edge tier-${edge.tier}`}
      d={edge.path}
      strokeWidth={lift > 1 ? 2.5 : 1.2}
      filter={CoreIdle ? undefined : "url(#cx-glow-xs)"}
      initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity }}
      transition={{ pathLength: { duration: 0.48, delay: Math.min(index * 0.035, 0.24), ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.2 } }}
    />
    <path className={`cosmos-edge tier-${edge.tier}`} d={edge.path} strokeWidth="0.6" opacity={opacity * 0.7} />
    {edge.tier !== "weak" && effectsOn && !reducedMotion && (
      <path
        className={`cosmos-edge cosmos-dash tier-${edge.tier}`}
        d={edge.path}
        strokeWidth="1.4"
        strokeDasharray="9 22"
        opacity={0.55 * lift}
        style={{ animation: `cosmos-dash-flow ${2.8 + index * 0.55}s linear infinite` }}
      />
    )}
    {edge.particle && effectsOn && (
      <circle className={`cosmos-particle tier-${edge.tier}`} r={edge.tier === "strong" ? 2.8 : 2} opacity={edge.tier === "strong" ? 0.92 : 0.78} filter="url(#cx-glow-xs)" aria-hidden="true">
        <animateMotion dur={`${(edge.tier === "strong" ? 2.2 : 3.4) + index * 0.35}s`} repeatCount="indefinite"><mpath href={`#cx-path-${index}`} /></animateMotion>
      </circle>
    )}
    <path
      ref={element => setFocusRef(id, element)}
      className="cosmos-edge-hit"
      d={edge.path}
      tabIndex="0"
      role="button"
      aria-label={`${RELATION_LABEL[edge.type] || edge.type} from ${row?.sourceLabel} to ${row?.targetLabel}; status ${row?.status}; provenance ${row?.provenanceSource} ${row?.provenanceId}`}
      onFocus={() => onSelect(id)}
      onClick={() => onSelect(id)}
      onKeyDown={event => onKeyDown(event, id)}
    />
  </g>;
});

const CosmosNode = memo(function CosmosNode({ node, index, selectionId, highlightedNodeIds, effectsOn, reducedMotion, onSelect, onKeyDown, setFocusRef }) {
  const id = `node:${node.id}`;
  const selected = selectionId === id;
  const muted = Boolean(selectionId) && !highlightedNodeIds.has(node.id);
  const color = agentAccent(node);
  const Icon = iconFor(node.id);
  const nr = 22;
  const animated = effectsOn && !reducedMotion;
  return <g
    ref={element => setFocusRef(id, element)}
    className={`cosmos-node status-${node.status}${selected ? " is-selected" : ""}`}
    transform={`translate(${node.x},${node.y})`}
    role="button"
    tabIndex="0"
    aria-label={`${node.name || node.id}, status ${node.status}${node.mode ? `, ${node.mode} mode` : ""}, ${node.degree} verified relationships`}
    onFocus={() => onSelect(id)}
    onClick={() => onSelect(id)}
    onKeyDown={event => onKeyDown(event, id)}
  >
    <m.g
      initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: muted ? 0.3 : node.status === "disabled" ? 0.5 : 1, scale: selected ? 1.04 : 1 }}
      transition={{ type: "spring", stiffness: 250, damping: 24, delay: reducedMotion ? 0 : Math.min(index * 0.03, 0.24) }}
    >
      {selected && animated && (
        <circle className="cosmos-pulse cosmos-spin" r={40} style={{ stroke: color }} filter="url(#cx-glow-sm)" />
      )}
      <circle
        className="cosmos-halo cosmos-spin"
        r={34}
        style={{ fill: color, opacity: selected ? 0.13 : 0.05, animation: animated ? "cosmos-breathe 3.2s ease-in-out infinite" : "none" }}
      />
      <circle className="cosmos-node-outer" r={nr + 8} style={{ stroke: color }} opacity={selected ? 0.5 : 0.22} />
      <circle
        className="cosmos-node-body"
        r={nr}
        style={{ stroke: color }}
        strokeWidth={selected ? 2 : 1.4}
        filter={!effectsOn ? undefined : selected ? "url(#cx-glow-md)" : "url(#cx-glow-sm)"}
      />
      <Icon size={15} x={-7.5} y={-7.5} color={color} strokeWidth={1.5} aria-hidden="true" focusable="false" />
      <text className="cosmos-node-name" y={nr + 14} textAnchor="middle">{node.name || node.id}</text>
      <text className={`cosmos-node-state status-${node.status}`} y={nr + 25} textAnchor="middle">● {String(node.status).toUpperCase()}</text>
    </m.g>
  </g>;
});

const CosmosCore = memo(function CosmosCore({ core, selectionId, effectsOn, reducedMotion, onSelect, onKeyDown, setFocusRef }) {
  const selected = selectionId === CORE_ID;
  const animated = effectsOn && !reducedMotion;
  const nr = 30;
  return <g
    ref={element => setFocusRef(CORE_ID, element)}
    className={`cosmos-node cosmos-core${selected ? " is-selected" : ""}`}
    transform={`translate(${core.x},${core.y})`}
    role="button"
    tabIndex="0"
    aria-label={`${core.name}, the shared vault core, ${core.laneCount} agent lanes`}
    onFocus={() => onSelect(CORE_ID)}
    onClick={() => onSelect(CORE_ID)}
    onKeyDown={event => onKeyDown(event, CORE_ID)}
  >
    {animated && <>
      <circle className="cosmos-ring cosmos-spin" r={82} strokeDasharray="5 10" opacity="0.18" style={{ stroke: "var(--cosmos-core)", animation: "cosmos-spin-cw 32s linear infinite" }} />
      <circle className="cosmos-ring cosmos-spin" r={68} strokeWidth="0.7" strokeDasharray="7 5" opacity="0.25" style={{ stroke: "var(--cosmos-core-ring2)", animation: "cosmos-spin-ccw 22s linear infinite" }} />
      <circle className="cosmos-ring cosmos-spin" r={55} opacity="0.2" style={{ stroke: "var(--cosmos-core)", animation: "cosmos-breathe 4s ease-in-out infinite" }} />
    </>}
    {!animated && <circle className="cosmos-ring" r={55} opacity="0.25" style={{ stroke: "var(--cosmos-core)" }} />}
    {selected && animated && <circle className="cosmos-pulse cosmos-spin" r={52} style={{ stroke: "var(--cosmos-core)" }} filter="url(#cx-glow-sm)" />}
    <circle className="cosmos-halo cosmos-spin" r={46} style={{ fill: "var(--cosmos-core)", opacity: selected ? 0.13 : 0.06, animation: animated ? "cosmos-breathe 3.2s ease-in-out infinite" : "none" }} />
    <circle className="cosmos-node-outer" r={nr + 8} style={{ stroke: "var(--cosmos-core)" }} opacity={selected ? 0.5 : 0.25} />
    <circle className="cosmos-node-body" r={nr} style={{ stroke: "var(--cosmos-core)" }} strokeWidth="2" filter={effectsOn ? "url(#cx-glow-lg)" : undefined} />
    <CORE_ICON size={19} x={-9.5} y={-9.5} color="var(--cosmos-core)" strokeWidth={1.5} aria-hidden="true" focusable="false" />
    <circle className={`cosmos-core-dot ${core.laneCount ? "is-live" : ""}`} cx={nr - 1} cy={-nr + 2} r={5}
      style={animated && core.laneCount ? { animation: "cosmos-blink 2.2s ease-in-out infinite" } : undefined} />
    <text className="cosmos-core-name" y={52} textAnchor="middle">{core.name}</text>
    <text className="cosmos-core-sub" y={66} textAnchor="middle">{core.subtitle}</text>
  </g>;
});

/** The Neural Cosmos SVG stage: nebula → stars → edges → vault lanes → agents → core. */
export function CosmosMap({ map, viewBox, selectionId, activeAgentId, highlightedNodeIds, effectsOn, reducedMotion, rowById, onSelect, onKeyDown, setFocusRef }) {
  return (
    <m.svg
      className="cosmos-svg"
      viewBox={viewBox}
      role="group"
      aria-label={`Agent Map with ${map.metadata.nodeCount} agents and ${map.metadata.edgeCount} verified relationships around the Neural Vault core`}
      animate={{ viewBox }}
      transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 190, damping: 27 }}
    >
      <defs>
        <filter id="cx-glow-xs" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="cx-glow-sm" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="cx-glow-md" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="cx-glow-lg" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="16" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="cx-nebula-c" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "var(--cosmos-nebula-c)" }} stopOpacity="0.09" />
          <stop offset="100%" style={{ stopColor: "var(--cosmos-canvas)" }} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cx-nebula-v" cx="28%" cy="28%" r="55%">
          <stop offset="0%" style={{ stopColor: "var(--cosmos-nebula-v)" }} stopOpacity="0.1" />
          <stop offset="100%" style={{ stopColor: "var(--cosmos-canvas)" }} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cx-nebula-p" cx="75%" cy="72%" r="48%">
          <stop offset="0%" style={{ stopColor: "var(--cosmos-nebula-p)" }} stopOpacity="0.07" />
          <stop offset="100%" style={{ stopColor: "var(--cosmos-canvas)" }} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cx-core-orb" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: "var(--cosmos-core)" }} stopOpacity="0.28" />
          <stop offset="55%" style={{ stopColor: "var(--cosmos-core)" }} stopOpacity="0.07" />
          <stop offset="100%" style={{ stopColor: "var(--cosmos-core)" }} stopOpacity="0" />
        </radialGradient>
        {map.edges.map((edge, index) => <path key={edge.id} id={`cx-path-${index}`} d={edge.path} />)}
      </defs>

      {effectsOn && <g aria-hidden="true">
        <ellipse cx="450" cy="308" rx="390" ry="290" fill="url(#cx-nebula-c)" />
        <ellipse cx="200" cy="160" rx="330" ry="250" fill="url(#cx-nebula-v)" />
        <ellipse cx="700" cy="500" rx="290" ry="220" fill="url(#cx-nebula-p)" />
        {map.stars.map(star => (
          <circle
            key={star.id}
            className="cosmos-star"
            cx={star.x} cy={star.y} r={star.r}
            opacity={star.opacity}
            style={reducedMotion ? undefined : { animation: `cosmos-twinkle ${2.5 + star.delay}s ease-in-out infinite ${star.delay}s` }}
          />
        ))}
        <ellipse cx="450" cy="308" rx="170" ry="140" fill="url(#cx-core-orb)" />
      </g>}

      <g className="cosmos-lanes" role="img" aria-label={`${map.laneLinks.length} evidenced vault lanes between agents and the Neural Vault`}>
        {map.laneLinks.map(link => (
          <path key={link.id} className="cosmos-lane" d={link.path} filter={effectsOn ? "url(#cx-glow-xs)" : undefined} />
        ))}
      </g>

      {map.edges.map((edge, index) => (
        <CosmosEdge
          key={edge.id} edge={edge} row={rowById.get(`edge:${edge.id}`)} index={index}
          selectionId={selectionId} activeAgentId={activeAgentId}
          effectsOn={effectsOn} reducedMotion={reducedMotion}
          onSelect={onSelect} onKeyDown={onKeyDown} setFocusRef={setFocusRef}
        />
      ))}

      {map.nodes.map((node, index) => (
        <CosmosNode
          key={node.id} node={node} index={index}
          selectionId={selectionId} highlightedNodeIds={highlightedNodeIds}
          effectsOn={effectsOn} reducedMotion={reducedMotion}
          onSelect={onSelect} onKeyDown={onKeyDown} setFocusRef={setFocusRef}
        />
      ))}

      <CosmosCore
        core={map.core} selectionId={selectionId}
        effectsOn={effectsOn} reducedMotion={reducedMotion}
        onSelect={onSelect} onKeyDown={onKeyDown} setFocusRef={setFocusRef}
      />
    </m.svg>
  );
}
