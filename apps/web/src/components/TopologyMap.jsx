import { useEffect, useMemo, useRef, useState } from "react";
import { Btn } from "@rempeyek/ui";
import { agentTopologyRevision, beginTopologyRefresh, buildAgentMap } from "../../lib/agent-map.mjs";
import { api } from "../api";
import { agentAccent } from "../lib/agents";
import { TopoLoad } from "./TopoLoad";

const WIDTH = 760;
const HEIGHT = 480;
const RELATION_LABEL = {
  dependency: "Dependency",
  co_assignment: "Co-assignment",
  task_assignment: "Task assignment",
  spawned_subagent: "Spawned subagent",
  communication: "Communication",
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/* Whether the active theme wants luminous effects. Reads the SAME token the flat themes zero out
   (--graph-effect-glow: 0 in minimalist/brutalist), so glow + shockwave stay off there with no
   per-theme branching. Re-reads on the theme toggle (data-theme attribute). */
function useEffectsEnabled() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const read = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--graph-effect-glow").trim();
      setOn(v !== "0");
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return on;
}

function StatusMark({ status }) {
  return <span className={`topo-status-mark status-${status}`} aria-hidden="true" />;
}

function Inspector({ selected, onOpenAgent, onClear }) {
  if (!selected) return <div className="topo-box topo-inspector"><div className="topo-h">CONTEXT INSPECTOR</div><p>Select an agent or verified relationship to inspect the exact runtime record.</p></div>;
  if (selected.kind === "agent") return <div className="topo-box topo-inspector" aria-live="polite">
    <div className="topo-inspector-head"><div className="topo-h">AGENT RECORD</div><button type="button" className="topo-clear" onClick={onClear}>Clear</button></div>
    <h3>{selected.label}</h3>
    <dl><div><dt>Status</dt><dd><StatusMark status={selected.status} />{selected.status}</dd></div><div><dt>Process mode</dt><dd>{selected.mode || "not reported"}</dd></div><div><dt>Agent ID</dt><dd><code>{selected.agentId}</code></dd></div></dl>
    <Btn onClick={() => onOpenAgent(selected.agentId)}>Open agent detail</Btn>
  </div>;
  return <div className="topo-box topo-inspector" aria-live="polite">
    <div className="topo-inspector-head"><div className="topo-h">RELATIONSHIP EVIDENCE</div><button type="button" className="topo-clear" onClick={onClear}>Clear</button></div>
    <h3>{RELATION_LABEL[selected.type] || selected.type}</h3>
    <p className="topo-route"><strong>{selected.sourceLabel}</strong><span aria-hidden="true">→</span><strong>{selected.targetLabel}</strong></p>
    <dl><div><dt>Status</dt><dd>{selected.status}</dd></div><div><dt>Provenance source</dt><dd><code>{selected.provenanceSource}</code></dd></div><div><dt>Provenance ID</dt><dd><code>{selected.provenanceId}</code></dd></div></dl>
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

export function TopologyMap({ state, accent, load, onOpen }) {
  const agents = state.agents || [];
  const reducedMotion = useReducedMotion();
  const effectsOn = useEffectsEnabled();
  const [topology, setTopology] = useState(() => beginTopologyRefresh(null, agents));
  const [topologyReady, setTopologyReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectionId, setSelectionId] = useState("");
  const [shockNonce, setShockNonce] = useState(0);   // bump per selection → SMIL shockwave re-fires
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
  const counts = Object.fromEntries(map.legend.statuses.map(item => [item.status, map.nodes.filter(node => node.status === item.status).length]));
  const upList = agents.map(agent => agent.uptime?.pct).filter(value => typeof value === "number");
  const upAvg = upList.length ? Math.round(upList.reduce((sum, value) => sum + value, 0) / upList.length) : null;
  const locked = state.auth === "token-locked";

  const select = id => { setSelectionId(id); setShockNonce(n => n + 1); };
  // Shockwave fires only on an explicit node selection — never automatically (the Canvas engine's
  // contract). Suppressed by flat themes (effectsOn) and reduced-motion.
  const shockNodeId = selectionId.startsWith("node:") ? selectionId.slice(5) : null;
  const shockNode = (effectsOn && !reducedMotion && shockNodeId) ? map.nodes.find(n => n.id === shockNodeId && n.status !== "disabled") : null;
  const moveSelection = (currentId, key) => {
    const ids = map.rows.map(row => row.id);
    if (!ids.length) return;
    if (key === "Escape") { setSelectionId(""); return; }
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(key)) return;
    const current = Math.max(0, ids.indexOf(currentId));
    const next = key === "Home" ? 0 : key === "End" ? ids.length - 1 : (current + (["ArrowRight", "ArrowDown"].includes(key) ? 1 : -1) + ids.length) % ids.length;
    setSelectionId(ids[next]);
    requestAnimationFrame(() => focusRefs.current.get(ids[next])?.focus());
  };
  const keyHandler = id => event => {
    if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(id); return; }
    if (["Escape", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); moveSelection(id, event.key); }
  };

  return <section className="topology-panel" aria-labelledby="agent-map-title">
    <div className="topo-map-head"><div><div className="topo-h">PROVENANCE-FIRST RUNTIME VIEW</div><h2 id="agent-map-title">Agent Map</h2><p>{map.metadata.nodeCount} agents · {map.metadata.edgeCount} verified relationships</p></div>{selectionId && <Btn onClick={() => setSelectionId("")}>Clear selection</Btn>}</div>
    {loadError && <div className="topo-api-error" role="alert">Relationship evidence could not be refreshed: {loadError}. Showing the current agent records without inferred edges.</div>}

    <div className="topo-grid">
      <aside className="topo-side" aria-label="Agent Map overview">
        <div className="topo-box"><div className="topo-h">RUNTIME OVERVIEW</div><div className="topo-stat"><span>TOTAL AGENTS</span><b>{map.metadata.nodeCount}</b></div>{map.legend.statuses.map(item => <div className="topo-stat" key={item.status}><span><StatusMark status={item.status} />{item.label}</span><b>{counts[item.status]}</b></div>)}</div>
        <div className="topo-box"><div className="topo-h">NETWORK LOAD</div><TopoLoad load={load} accent={accent} /></div>
        <div className="topo-box"><div className="topo-h">RUNTIME CONTEXT</div><div className="topo-stat"><span>ACCESS</span><b>{locked ? "TOKEN" : "LOCAL"}</b></div><div className="topo-stat"><span>MEAN UPTIME 24H</span><b>{upAvg == null ? "—" : `${upAvg}%`}</b></div></div>
      </aside>

      <div className="topo-map">
        {!topologyReady ? <div className="topo-empty" role="status"><strong>Checking relationship evidence…</strong><span>Agent records remain visible while provenance is loaded.</span></div> : !map.metadata.hasRelationships && <div className="topo-empty" role="status"><strong>{map.emptyState.title}</strong><span>{map.emptyState.detail}</span>{map.metadata.droppedRelations > 0 && <small>{map.metadata.droppedRelations} incomplete record(s) were excluded.</small>}</div>}
        <svg className="topology" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label={`Agent Map with ${map.metadata.nodeCount} agents and ${map.metadata.edgeCount} verified relationships`}>
          <defs>
            <filter id="topoGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            {/* Neural halo: a soft, wide bloom used behind hubs. Bigger blur than topoGlow. */}
            <filter id="topoHalo" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="7" /></filter>
            {map.legend.relations.map(item => <marker key={item.type} id={`arrow-${item.type}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className={`top-arrow rel-${item.type}`} /></marker>)}
          </defs>

          {/* Breathing plasma halos under the hubs — radius + intensity scale with real degree, the
              same law the Canvas engine uses. Gated by --graph-effect-halo (0 in flat themes) and
              reduced-motion (CSS). Rendered under the edges so nodes and lines sit on top. */}
          <g className="top-halo-layer" filter="url(#topoHalo)" aria-hidden="true">
            {map.nodes.map(node => (
              <circle key={node.id} className="top-node-halo"
                cx={node.x.toFixed(1)} cy={node.y.toFixed(1)} r={(22 + (node.degree || 0) * 3.2).toFixed(1)}
                style={{ "--agent-color": agentAccent(node), animationDelay: `${(-((node.degree || 0) * 0.37)).toFixed(2)}s` }} />
            ))}
          </g>

          {map.edges.map((edge, index) => {
            const id = `edge:${edge.id}`;
            const row = rowById.get(id);
            return <g key={edge.id} className={selectionId === id ? "is-selected" : ""}>
              <path className={`top-edge rel-${edge.type}${edge.animated ? " is-flowing top-glow" : ""}`} d={edge.path} markerEnd={edge.directional === false ? undefined : `url(#arrow-${edge.type})`} />
              <path ref={node => { if (node) focusRefs.current.set(id, node); }} className="top-edge-hit" d={edge.path} tabIndex="0" role="button" aria-label={`${RELATION_LABEL[edge.type]} from ${row.sourceLabel} to ${row.targetLabel}; status ${row.status}; provenance ${row.provenanceSource} ${row.provenanceId}`} onFocus={() => select(id)} onClick={() => select(id)} onKeyDown={keyHandler(id)} />
              {edge.animated && <circle className={`top-particle rel-${edge.type} top-glow`} r="3"><animateMotion dur={`${2.4 + index * 0.16}s`} repeatCount="indefinite" path={edge.path} /></circle>}
            </g>;
          })}

          {map.nodes.map(node => {
            const id = `node:${node.id}`;
            const selectedNode = selectionId === id;
            const color = agentAccent(node);
            return <g key={node.id} ref={element => { if (element) focusRefs.current.set(id, element); }} className={`top-node status-${node.status}${selectedNode ? " is-selected" : ""}`} transform={`translate(${node.x.toFixed(1)},${node.y.toFixed(1)})`} role="button" tabIndex="0" aria-label={`${node.name}, status ${node.status}${node.mode ? `, ${node.mode} mode` : ""}${node.isolated ? ", no verified relationships" : ""}`} onFocus={() => select(id)} onClick={() => select(id)} onKeyDown={keyHandler(id)}>
              {node.status === "running" && <circle className="top-status-pulse" r="31" />}
              <circle className="top-node-select" r="32" />
              <circle className="top-node-ring" r="25" style={{ "--agent-color": color }} />
              <circle className="top-node-core" r="20" />
              <text className="top-node-icon" y="6" textAnchor="middle">{node.icon || "◆"}</text>
              {node.status === "error" && <path className="top-node-symbol" d="M-7,-7 L7,7 M7,-7 L-7,7" />}
              {node.status === "disabled" && <path className="top-node-symbol" d="M-10,10 L10,-10" />}
              <text className="top-node-name" y="45" textAnchor="middle">{node.name || node.id}</text>
              <text className="top-node-state" y="59" textAnchor="middle">{node.status}{node.mode ? ` · ${node.mode}` : ""}</text>
            </g>;
          })}

          {/* Selection shockwave — expanding double-ring, radius scaled by degree. Keyed by the
              selection nonce so re-selecting the same node re-fires the SMIL animation. */}
          {shockNode && (() => {
            const max = 34 + (shockNode.degree || 0) * 6;
            return <g key={shockNonce} className="top-shock" transform={`translate(${shockNode.x.toFixed(1)},${shockNode.y.toFixed(1)})`} style={{ "--agent-color": agentAccent(shockNode) }} aria-hidden="true">
              <circle className="shock-ring" r="20" fill="none">
                <animate attributeName="r" from="20" to={max} dur="0.85s" begin="0s" fill="freeze" calcMode="spline" keySplines="0.16 1 0.3 1" keyTimes="0;1" />
                <animate attributeName="opacity" from="0.75" to="0" dur="0.85s" begin="0s" fill="freeze" />
              </circle>
              <circle className="shock-ring shock-ring2" r="14" fill="none">
                <animate attributeName="r" from="14" to={(max * 0.82).toFixed(0)} dur="0.85s" begin="0.09s" fill="freeze" calcMode="spline" keySplines="0.16 1 0.3 1" keyTimes="0;1" />
                <animate attributeName="opacity" from="0.55" to="0" dur="0.85s" begin="0.09s" fill="freeze" />
              </circle>
            </g>;
          })()}
        </svg>
        <p className="topo-key-help">Keyboard: Tab enters the map; Arrow keys move through every agent and relationship; Enter inspects; Escape clears.</p>
      </div>

      <aside className="topo-side" aria-label="Agent Map inspector">
        <Inspector selected={selected} onOpenAgent={onOpen} onClear={() => setSelectionId("")} />
        <div className="topo-box topo-evidence-policy"><div className="topo-h">EVIDENCE POLICY</div><p>Only configuration, task, subagent, and communication records with known endpoints and provenance can create a line.</p><div className="topo-stat"><span>EXCLUDED RECORDS</span><b>{map.metadata.droppedRelations || 0}</b></div></div>
      </aside>
    </div>

    <div className="topo-legends">
      <div className="topo-legend" aria-label="Relationship legend"><span className="topo-h">RELATIONSHIPS</span>{map.legend.relations.map(item => <span className="tl" key={item.type}><i className={`relation-line rel-${item.type}`} />{item.label}<em>{item.description}</em></span>)}</div>
      <div className="topo-legend" aria-label="Status legend"><span className="topo-h">STATUS</span>{map.legend.statuses.map(item => <span className="tl" key={item.status}><StatusMark status={item.status} />{item.label}</span>)}</div>
    </div>
    <EvidenceTable map={map} onSelect={id => { select(id); requestAnimationFrame(() => focusRefs.current.get(id)?.focus()); }} />
    <div className="topo-foot">{map.metadata.hasRelationships ? "ARROWS SHOW VERIFIED DIRECTION · MOTION SHOWS QUEUED OR RUNNING FLOW" : "NO HUB · NO IMPLIED CONNECTIONS · WAITING FOR PROVENANCE-COMPLETE EVIDENCE"}</div>
  </section>;
}
