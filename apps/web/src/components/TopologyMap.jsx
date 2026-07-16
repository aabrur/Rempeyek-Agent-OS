import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import { Btn } from "@rempeyek/ui";
import { agentTopologyRevision, beginTopologyRefresh, buildAgentMap } from "../../lib/agent-map.mjs";
import { api } from "../api";
import { agentAccent } from "../lib/agents";
import { TopoLoad } from "./TopoLoad";

const WIDTH = 840;
const HEIGHT = 520;
const ZOOM_MIN = 0.85;
const ZOOM_MAX = 1.25;
const RELATION_LABEL = {
  dependency: "Dependency",
  co_assignment: "Co-assignment",
  task_assignment: "Task assignment",
  spawned_subagent: "Spawned subagent",
  communication: "Communication",
};

/* Whether the active theme wants luminous effects. Reads the SAME token the flat themes zero out
   (--graph-effect-glow: 0 in minimalist/brutalist), so glow + shockwave stay off there with no
   per-theme branching. Re-reads on the theme toggle (data-theme attribute). */
function useEffectsEnabled() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const read = () => {
      const value = getComputedStyle(document.documentElement).getPropertyValue("--graph-effect-glow").trim();
      setOn(value !== "0");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return on;
}

function initialsFor(label = "") {
  const words = String(label).trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map(word => word[0]).join("") : words[0]?.slice(0, 2) || "AI").slice(0, 2).toUpperCase();
}

function avatarClipId(id) {
  return `topo-avatar-${String(id).replace(/[^a-z0-9_-]/gi, "-")}`;
}

function StatusMark({ status }) {
  return <span className={`topo-status-mark status-${status}`} aria-hidden="true" />;
}

function Inspector({ selected, map, onOpenAgent, onClear, onSelect }) {
  const incidents = useMemo(() => selected?.kind === "agent"
    ? map.rows.filter(row => row.kind === "relationship" && (row.source === selected.agentId || row.target === selected.agentId))
    : [], [map.rows, selected]);

  return <div className="topo-box topo-inspector" aria-live="polite">
    <div className="topo-inspector-head">
      <div className="topo-h">{selected?.kind === "relationship" ? "RELATIONSHIP EVIDENCE" : "SELECTED AGENT"}</div>
      {selected && <button type="button" className="topo-clear" onClick={onClear}>Clear</button>}
    </div>
    <AnimatePresence mode="wait" initial={false}>
      {!selected ? <m.div key="empty" className="topo-inspector-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <strong>Inspect the live constellation</strong>
        <p>Select an agent or verified relationship to open its exact runtime record and provenance.</p>
      </m.div> : selected.kind === "agent" ? <m.div key={selected.id} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
        <div className="topo-inspector-agent">
          <div className="topo-inspector-avatar" style={{ "--agent-color": agentAccent(selected.agentId) }}>
            <span>{initialsFor(selected.label)}</span>
            {selected.avatar && <img src={selected.avatar} alt="" />}
          </div>
          <div><h3>{selected.label}</h3><span className="topo-agent-state"><StatusMark status={selected.status} />{selected.status}{selected.mode ? ` · ${selected.mode}` : ""}</span></div>
        </div>
        <dl className="topo-agent-facts">
          <div><dt>Verified links</dt><dd>{selected.degree}</dd></div>
          <div><dt>Graph role</dt><dd>{selected.isAnchor ? "Constellation anchor" : selected.isolated ? "Isolated record" : "Connected agent"}</dd></div>
          <div><dt>Agent ID</dt><dd><code>{selected.agentId}</code></dd></div>
        </dl>
        <div className="topo-related-head"><span>Relationships</span><b>{incidents.length}</b></div>
        <div className="topo-related-list">
          {incidents.length ? incidents.map(row => {
            const peer = row.source === selected.agentId ? row.targetLabel : row.sourceLabel;
            return <button type="button" className="topo-related-row" key={row.id} onClick={() => onSelect(row.id)}>
              <span><i className={`relation-line rel-${row.type}`} />{peer}</span>
              <small>{RELATION_LABEL[row.type] || row.type} · {row.provenanceSource}</small>
            </button>;
          }) : <p className="topo-no-relations">No verified relationship records for this agent.</p>}
        </div>
        <Btn onClick={() => onOpenAgent(selected.agentId)}>Open agent detail</Btn>
      </m.div> : <m.div key={selected.id} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
        <h3>{RELATION_LABEL[selected.type] || selected.type}</h3>
        <p className="topo-route"><strong>{selected.sourceLabel}</strong><span aria-hidden="true">→</span><strong>{selected.targetLabel}</strong></p>
        <dl><div><dt>Status</dt><dd>{selected.status}</dd></div><div><dt>Provenance source</dt><dd><code>{selected.provenanceSource}</code></dd></div><div><dt>Provenance ID</dt><dd><code>{selected.provenanceId}</code></dd></div></dl>
      </m.div>}
    </AnimatePresence>
  </div>;
}

function EvidenceTable({ map, onSelect }) {
  const agents = map.rows.filter(row => row.kind === "agent");
  const relationships = map.rows.filter(row => row.kind === "relationship");
  return <details className="topo-fallback">
    <summary>Accessible agent and relationship table</summary>
    <div className="topo-table-scroll">
      <table><caption>Same data shown in the Agent Map</caption><thead><tr><th>Kind</th><th>Name / route</th><th>Status</th><th>Mode / type</th><th>Provenance</th><th>Inspect</th></tr></thead>
        <tbody>
          {agents.map(row => <tr key={row.id}><td>Agent</td><td>{row.label}</td><td><StatusMark status={row.status} />{row.status}</td><td>{row.mode || "—"}</td><td>Runtime agent record</td><td><button type="button" onClick={() => onSelect(row.id)}>Inspect {row.label}</button></td></tr>)}
          {relationships.map(row => <tr key={row.id}><td>Relationship</td><td>{row.sourceLabel} → {row.targetLabel}</td><td>{row.status}</td><td>{RELATION_LABEL[row.type] || row.type}</td><td>{row.provenanceSource}: {row.provenanceId}</td><td><button type="button" onClick={() => onSelect(row.id)}>Inspect relationship</button></td></tr>)}
        </tbody>
      </table>
    </div>
  </details>;
}

const ConstellationEdge = memo(function ConstellationEdge({ edge, row, index, selectionId, activeAgentId, reducedMotion, onSelect, onKeyDown, setFocusRef }) {
  const id = `edge:${edge.id}`;
  const related = !selectionId || selectionId === id || (activeAgentId && (edge.source === activeAgentId || edge.target === activeAgentId));
  const opacity = selectionId ? (related ? 0.98 : 0.13) : edge.animated ? 0.95 : 0.7;
  return <g className={`${selectionId === id ? "is-selected" : ""}${!related ? " is-dimmed" : ""}`}>
    <m.path className={`top-edge rel-${edge.type}${edge.animated ? " is-flowing top-glow" : ""}`} d={edge.path} markerEnd={edge.directional === false ? undefined : `url(#arrow-${edge.type})`} initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity }} transition={{ pathLength: { duration: 0.48, delay: Math.min(index * 0.035, 0.24), ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.2 } }} />
    <path ref={element => setFocusRef(id, element)} className="top-edge-hit" d={edge.path} tabIndex="0" role="button" aria-label={`${RELATION_LABEL[edge.type]} from ${row.sourceLabel} to ${row.targetLabel}; status ${row.status}; provenance ${row.provenanceSource} ${row.provenanceId}`} onFocus={() => onSelect(id)} onClick={() => onSelect(id)} onKeyDown={event => onKeyDown(event, id)} />
    {edge.animated && !reducedMotion && <circle className={`top-particle rel-${edge.type} top-glow`} r="3"><animateMotion dur={`${2.4 + index * 0.16}s`} repeatCount="indefinite" path={edge.path} /></circle>}
  </g>;
});

const ConstellationNode = memo(function ConstellationNode({ node, index, selectionId, highlightedNodeIds, reducedMotion, onSelect, onKeyDown, setFocusRef }) {
  const id = `node:${node.id}`;
  const selected = selectionId === id;
  const muted = Boolean(selectionId) && !highlightedNodeIds.has(node.id);
  const color = agentAccent(node);
  const width = node.width;
  const height = node.height;
  const avatarSize = height - 12;
  const avatarX = -width / 2 + 6;
  const avatarY = -avatarSize / 2;
  const copyX = avatarX + avatarSize + 9;
  const clipId = avatarClipId(node.id);
  return <g ref={element => setFocusRef(id, element)} className={`top-node status-${node.status}${selected ? " is-selected" : ""}${node.isAnchor ? " is-anchor" : ""}${node.isolated ? " is-isolated" : ""}`} transform={`translate(${node.x.toFixed(1)},${node.y.toFixed(1)})`} role="button" tabIndex="0" aria-label={`${node.name}, status ${node.status}${node.mode ? `, ${node.mode} mode` : ""}, ${node.degree} verified relationships${node.isAnchor ? ", constellation anchor" : ""}${node.isolated ? ", no verified relationships" : ""}`} onFocus={() => onSelect(id)} onClick={() => onSelect(id)} onKeyDown={event => onKeyDown(event, id)}>
    <defs><clipPath id={clipId}><circle cx={avatarX + avatarSize / 2} cy="0" r={avatarSize / 2 - 2} /></clipPath></defs>
    <m.g initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: muted ? 0.32 : 1, scale: selected ? 1.035 : 1 }} transition={{ type: "spring", stiffness: 260, damping: 24, delay: reducedMotion ? 0 : Math.min(index * 0.025, 0.18) }}>
      {node.status === "running" && <rect className="top-status-pulse" x={-width / 2 - 3} y={-height / 2 - 3} width={width + 6} height={height + 6} rx={(height + 6) / 2} />}
      <rect className="top-node-select" x={-width / 2 - 5} y={-height / 2 - 5} width={width + 10} height={height + 10} rx={(height + 10) / 2} />
      <rect className="top-node-shell" x={-width / 2} y={-height / 2} width={width} height={height} rx={height / 2} style={{ "--agent-color": color }} />
      <rect className="top-node-card" x={-width / 2 + 3} y={-height / 2 + 3} width={width - 6} height={height - 6} rx={(height - 6) / 2} />
      <circle className="top-node-avatar-well" cx={avatarX + avatarSize / 2} cy="0" r={avatarSize / 2} style={{ "--agent-color": color }} />
      <text className="top-node-glyph" x={avatarX + avatarSize / 2} y="5" textAnchor="middle">{initialsFor(node.name || node.id)}</text>
      {node.avatar && <image className="top-node-avatar-image" href={node.avatar} x={avatarX} y={avatarY} width={avatarSize} height={avatarSize} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />}
      <circle className={`top-node-status-dot status-${node.status}`} cx={avatarX + avatarSize - 4} cy={avatarSize / 2 - 5} r="4" />
      <text className="top-node-name" x={copyX} y="-4">{node.name || node.id}</text>
      <text className="top-node-state" x={copyX} y="12">{node.status}{node.mode ? ` · ${node.mode}` : ""}</text>
      <text className="top-node-links" x={width / 2 - 13} y="4" textAnchor="end">{node.degree}</text>
      {node.status === "error" && <path className="top-node-symbol" d={`M${width / 2 - 18},-7 L${width / 2 - 8},7 M${width / 2 - 8},-7 L${width / 2 - 18},7`} />}
    </m.g>
  </g>;
});

export function TopologyMap({ state, accent, load, onOpen }) {
  const agents = state.agents || [];
  const reducedMotion = Boolean(useReducedMotion());
  const effectsOn = useEffectsEnabled();
  const [topology, setTopology] = useState(() => beginTopologyRefresh(null, agents));
  const [topologyReady, setTopologyReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectionId, setSelectionId] = useState("");
  const [shockNonce, setShockNonce] = useState(0);
  const [zoom, setZoom] = useState(1);
  const focusRefs = useRef(new Map());
  const agentKey = agentTopologyRevision(agents);

  useEffect(() => {
    let alive = true;
    setTopologyReady(false);
    setTopology(current => beginTopologyRefresh(current, agents));
    api("/api/agent-topology").then(data => {
      if (!alive) return;
      if (data?.error || !Array.isArray(data?.nodes) || !Array.isArray(data?.edges)) {
        setLoadError(data?.error || "Topology response was incomplete.");
        setTopology(current => beginTopologyRefresh(current, agents));
        setTopologyReady(true);
        return;
      }
      setLoadError("");
      setTopology(data);
      setTopologyReady(true);
    });
    return () => { alive = false; };
  }, [agentKey]);

  const map = useMemo(() => buildAgentMap(topology, { width: WIDTH, height: HEIGHT, reducedMotion }), [topology, reducedMotion]);
  const rowById = useMemo(() => new Map(map.rows.map(row => [row.id, row])), [map.rows]);
  const selected = rowById.get(selectionId) || null;
  const activeAgentId = selected?.kind === "agent" ? selected.agentId : null;
  const highlightedNodeIds = useMemo(() => {
    if (!selectionId) return new Set(map.nodes.map(node => node.id));
    if (selected?.kind === "relationship") return new Set([selected.source, selected.target]);
    if (!activeAgentId) return new Set();
    const ids = new Set([activeAgentId]);
    map.edges.forEach(edge => {
      if (edge.source === activeAgentId) ids.add(edge.target);
      if (edge.target === activeAgentId) ids.add(edge.source);
    });
    return ids;
  }, [activeAgentId, map.edges, map.nodes, selected, selectionId]);
  const counts = Object.fromEntries(map.legend.statuses.map(item => [item.status, map.nodes.filter(node => node.status === item.status).length]));
  const upList = agents.map(agent => agent.uptime?.pct).filter(value => typeof value === "number");
  const upAvg = upList.length ? Math.round(upList.reduce((sum, value) => sum + value, 0) / upList.length) : null;
  const locked = state.auth === "token-locked";
  const viewWidth = WIDTH / zoom;
  const viewHeight = HEIGHT / zoom;
  const viewBox = `${((WIDTH - viewWidth) / 2).toFixed(2)} ${((HEIGHT - viewHeight) / 2).toFixed(2)} ${viewWidth.toFixed(2)} ${viewHeight.toFixed(2)}`;

  const setFocusRef = useCallback((id, element) => {
    if (element) focusRefs.current.set(id, element);
    else focusRefs.current.delete(id);
  }, []);
  const select = useCallback(id => {
    setSelectionId(id);
    if (id.startsWith("node:")) setShockNonce(value => value + 1);
  }, []);
  const moveSelection = useCallback((currentId, key) => {
    const ids = map.rows.map(row => row.id);
    if (!ids.length) return;
    if (key === "Escape") { setSelectionId(""); return; }
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(key)) return;
    const current = Math.max(0, ids.indexOf(currentId));
    const next = key === "Home" ? 0 : key === "End" ? ids.length - 1 : (current + (["ArrowRight", "ArrowDown"].includes(key) ? 1 : -1) + ids.length) % ids.length;
    setSelectionId(ids[next]);
    requestAnimationFrame(() => focusRefs.current.get(ids[next])?.focus());
  }, [map.rows]);
  const handleKeyDown = useCallback((event, id) => {
    if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(id); return; }
    if (["Escape", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); moveSelection(id, event.key); }
  }, [moveSelection, select]);
  const focusSelected = useCallback(id => {
    select(id);
    requestAnimationFrame(() => focusRefs.current.get(id)?.focus());
  }, [select]);
  const changeZoom = useCallback(delta => setZoom(value => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number((value + delta).toFixed(2))))), []);

  const shockNodeId = selectionId.startsWith("node:") ? selectionId.slice(5) : null;
  const shockNode = effectsOn && !reducedMotion && shockNodeId ? map.nodes.find(node => node.id === shockNodeId && node.status !== "disabled") : null;

  return <LazyMotion features={domAnimation}><section className="topology-panel" aria-labelledby="agent-map-title">
    <div className="topo-map-head"><div><div className="topo-h">LIVE EVIDENCE CONSTELLATION</div><h2 id="agent-map-title">Agent Map</h2><p>{map.metadata.nodeCount} agents · {map.metadata.edgeCount} verified relationships</p></div>{selectionId && <Btn onClick={() => setSelectionId("")}>Clear selection</Btn>}</div>
    {loadError && <div className="topo-api-error" role="alert">Relationship evidence could not be refreshed: {loadError}. Showing the current agent records without inferred edges.</div>}

    <div className="topo-grid">
      <aside className="topo-side" aria-label="Agent Map overview">
        <div className="topo-box topo-runtime-box"><div className="topo-h">RUNTIME OVERVIEW</div><div className="topo-stat topo-stat-primary"><span>TOTAL AGENTS</span><b>{map.metadata.nodeCount}</b></div>{map.legend.statuses.map(item => <div className="topo-stat" key={item.status}><span><StatusMark status={item.status} />{item.label}</span><b>{counts[item.status]}</b></div>)}</div>
        <div className="topo-box"><div className="topo-h">NETWORK LOAD</div><TopoLoad load={load} accent={accent} /></div>
        <div className="topo-box"><div className="topo-h">RUNTIME CONTEXT</div><div className="topo-stat"><span>ACCESS</span><b>{locked ? "TOKEN" : "LOCAL"}</b></div><div className="topo-stat"><span>MEAN UPTIME 24H</span><b>{upAvg == null ? "—" : `${upAvg}%`}</b></div></div>
      </aside>

      <div className="topo-map">
        {!topologyReady ? <div className="topo-empty" role="status"><strong>Checking relationship evidence…</strong><span>Agent records remain visible while provenance is loaded.</span></div> : !map.metadata.hasRelationships && <div className="topo-empty" role="status"><strong>{map.emptyState.title}</strong><span>{map.emptyState.detail}</span>{map.metadata.droppedRelations > 0 && <small>{map.metadata.droppedRelations} incomplete record(s) were excluded.</small>}</div>}
        <m.svg className="topology" viewBox={viewBox} role="group" aria-label={`Agent Map with ${map.metadata.nodeCount} agents and ${map.metadata.edgeCount} verified relationships`} animate={{ viewBox }} transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 190, damping: 27 }}>
          <defs>
            <filter id="topoGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <filter id="topoHalo" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="9" /></filter>
            {map.legend.relations.map(item => <marker key={item.type} id={`arrow-${item.type}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className={`top-arrow rel-${item.type}`} /></marker>)}
          </defs>

          <g className="top-orbit-guides" aria-hidden="true">
            <ellipse cx={WIDTH / 2} cy={HEIGHT / 2} rx="252" ry="170" />
            <ellipse cx={WIDTH / 2} cy={HEIGHT / 2} rx="184" ry="116" />
            <circle cx={WIDTH / 2} cy={HEIGHT / 2} r="76" />
          </g>
          <g className="top-halo-layer" filter="url(#topoHalo)" aria-hidden="true">
            {map.nodes.map(node => <ellipse key={node.id} className="top-node-halo" cx={node.x.toFixed(1)} cy={node.y.toFixed(1)} rx={(node.width * (node.isAnchor ? 0.72 : 0.58)).toFixed(1)} ry={(node.height * 0.82).toFixed(1)} style={{ "--agent-color": agentAccent(node), animationDelay: `${(-((node.degree || 0) * 0.37)).toFixed(2)}s` }} />)}
          </g>

          {map.edges.map((edge, index) => <ConstellationEdge key={edge.id} edge={edge} row={rowById.get(`edge:${edge.id}`)} index={index} selectionId={selectionId} activeAgentId={activeAgentId} reducedMotion={reducedMotion} onSelect={select} onKeyDown={handleKeyDown} setFocusRef={setFocusRef} />)}
          {map.nodes.map((node, index) => <ConstellationNode key={node.id} node={node} index={index} selectionId={selectionId} highlightedNodeIds={highlightedNodeIds} reducedMotion={reducedMotion} onSelect={select} onKeyDown={handleKeyDown} setFocusRef={setFocusRef} />)}

          {shockNode && (() => {
            const max = 40 + (shockNode.degree || 0) * 7;
            return <g key={shockNonce} className="top-shock" transform={`translate(${shockNode.x.toFixed(1)},${shockNode.y.toFixed(1)})`} style={{ "--agent-color": agentAccent(shockNode) }} aria-hidden="true">
              <circle className="shock-ring" r="24" fill="none"><animate attributeName="r" from="24" to={max} dur="0.85s" begin="0s" fill="freeze" calcMode="spline" keySplines="0.16 1 0.3 1" keyTimes="0;1" /><animate attributeName="opacity" from="0.75" to="0" dur="0.85s" begin="0s" fill="freeze" /></circle>
              <circle className="shock-ring shock-ring2" r="17" fill="none"><animate attributeName="r" from="17" to={(max * 0.82).toFixed(0)} dur="0.85s" begin="0.09s" fill="freeze" calcMode="spline" keySplines="0.16 1 0.3 1" keyTimes="0;1" /><animate attributeName="opacity" from="0.55" to="0" dur="0.85s" begin="0.09s" fill="freeze" /></circle>
            </g>;
          })()}
        </m.svg>
        <div className="topo-map-controls" aria-label="Agent Map zoom controls">
          <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => changeZoom(-0.1)}>−</button>
          <button type="button" aria-label="Fit graph" title="Fit graph" className="topo-fit" onClick={() => setZoom(1)}>FIT</button>
          <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => changeZoom(0.1)}>+</button>
        </div>
        <span className="sr-only" aria-live="polite">Map zoom {Math.round(zoom * 100)} percent</span>
        <p className="topo-key-help">Tab enters the map · Arrow keys move · Enter inspects · Escape clears</p>
      </div>

      <aside className="topo-side" aria-label="Agent Map inspector">
        <Inspector selected={selected} map={map} onOpenAgent={onOpen} onClear={() => setSelectionId("")} onSelect={focusSelected} />
        <div className="topo-box topo-evidence-policy"><div className="topo-h">EVIDENCE POLICY</div><p>Only configuration, task, subagent, co-assignment, and communication records with known endpoints and provenance can create a line.</p><div className="topo-stat"><span>EXCLUDED RECORDS</span><b>{map.metadata.droppedRelations || 0}</b></div></div>
      </aside>
    </div>

    <div className="topo-legends">
      <div className="topo-legend" aria-label="Relationship legend"><span className="topo-h">RELATIONSHIPS</span>{map.legend.relations.map(item => <span className="tl" key={item.type}><i className={`relation-line rel-${item.type}`} />{item.label}<em>{item.description}</em></span>)}</div>
      <div className="topo-legend" aria-label="Status legend"><span className="topo-h">STATUS</span>{map.legend.statuses.map(item => <span className="tl" key={item.status}><StatusMark status={item.status} />{item.label}</span>)}</div>
    </div>
    <EvidenceTable map={map} onSelect={focusSelected} />
    <div className="topo-foot">{map.metadata.hasRelationships ? "ARROWS SHOW VERIFIED DIRECTION · MOTION SHOWS QUEUED OR RUNNING FLOW" : "NO SYNTHETIC HUB · NO IMPLIED CONNECTIONS · WAITING FOR PROVENANCE-COMPLETE EVIDENCE"}</div>
  </section></LazyMotion>;
}
