import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LazyMotion, domAnimation, useReducedMotion } from "framer-motion";
import { ChevronRight, Maximize2, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { Btn } from "@rempeyek/ui";
import { agentTopologyRevision, beginTopologyRefresh } from "../../lib/agent-map.mjs";
import { COSMOS_HEIGHT, COSMOS_WIDTH, buildCosmosMap } from "../../lib/cosmos-map.mjs";
import { api } from "../api";
import { useEffectsEnabled } from "../hooks/useEffectsEnabled";
import { CosmosMap } from "../components/CosmosMap";
import { CosmosDetail } from "../components/CosmosDetail";

const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.6;
const RELATION_LABEL = {
  dependency: "Dependency",
  co_assignment: "Co-assignment",
  task_assignment: "Task assignment",
  spawned_subagent: "Spawned subagent",
  communication: "Communication",
};

function useTime() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;
}

function TopBar({ map, agents, load }) {
  const clock = useTime();
  const errors = agents.filter(a => a.proc?.status === "error" || a.proc?.status === "exited").length;
  const status = errors ? "DEGRADED" : "OPTIMAL";
  const buf = load?.current || [];
  const loadPct = buf.length ? Math.round(buf[buf.length - 1] * 100) : 0;
  return (
    <div className="cosmos-topbar">
      <div className="cosmos-topbar-left">
        <span className="cosmos-chip">ALL AGENTS · {map.metadata.nodeCount} <ChevronRight size={9} aria-hidden="true" /></span>
      </div>
      <div className="cosmos-title-wrap" aria-hidden="true">
        <div className="cosmos-title"><span className="cx-plus">+</span> AGENT MAP <span className="cx-plus">+</span></div>
        <div className="cosmos-subtitle">Navigate the intelligence // Orchestrate the future</div>
      </div>
      <div className="cosmos-topbar-right">
        <div className="cosmos-stat">
          <span className={`cosmos-stat-label ${errors ? "is-warn" : "is-ok"}`}><i aria-hidden="true" /> SYSTEM STATUS</span>
          <b>{status}</b>
        </div>
        <div className="cosmos-stat">
          <span className="cosmos-stat-label">NETWORK LOAD</span>
          <b className="is-amber">{loadPct}%</b>
        </div>
        <div className="cosmos-clock" aria-label={`Local time ${clock}`}>{clock}</div>
      </div>
    </div>
  );
}

function Legend({ legend }) {
  return (
    <div className="cosmos-legend" aria-label="Map legend">
      <span className="lg-title">LEGEND</span>
      {legend.statuses.map(item => (
        <span key={item.status} className={`lg lg-status status-${item.status}`}>● {item.label.toUpperCase()}</span>
      ))}
      {legend.tiers.map(item => (
        <span key={item.tier} className={`lg lg-tier tier-${item.tier}`} title={item.description}>
          {item.tier === "data" ? "--" : item.tier === "lane" ? "··" : "—"} {item.label}
        </span>
      ))}
    </div>
  );
}

function EvidenceTable({ map, onSelect }) {
  const agents = map.rows.filter(row => row.kind === "agent");
  const relationships = map.rows.filter(row => row.kind === "relationship");
  return <details className="topo-fallback cosmos-evidence">
    <summary>Accessible agent and relationship table</summary>
    <div className="topo-table-scroll">
      <table><caption>Same data shown in the Agent Map</caption><thead><tr><th>Kind</th><th>Name / route</th><th>Status</th><th>Mode / type</th><th>Provenance</th><th>Inspect</th></tr></thead>
        <tbody>
          {agents.map(row => <tr key={row.id}><td>Agent</td><td>{row.label}</td><td>{row.status}</td><td>{row.mode || "—"}</td><td>Runtime agent record</td><td><button type="button" onClick={() => onSelect(row.id)}>Inspect {row.label}</button></td></tr>)}
          {relationships.map(row => <tr key={row.id}><td>Relationship</td><td>{row.sourceLabel} → {row.targetLabel}</td><td>{row.status}</td><td>{RELATION_LABEL[row.type] || row.type}</td><td>{row.provenanceSource}: {row.provenanceId}</td><td><button type="button" onClick={() => onSelect(row.id)}>Inspect relationship</button></td></tr>)}
        </tbody>
      </table>
    </div>
  </details>;
}

/** The Agent Map — the cosmos constellation view. Default landing view. */
export function AgentMapView({ state, load, onOpenAgent, onView }) {
  const agents = state.agents || [];
  const reducedMotion = Boolean(useReducedMotion());
  const effectsOn = useEffectsEnabled();
  const [topology, setTopology] = useState(() => beginTopologyRefresh(null, agents));
  const [topologyReady, setTopologyReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectionId, setSelectionId] = useState("");
  const [zoom, setZoom] = useState(1);
  const [refreshNonce, setRefreshNonce] = useState(0);
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
  }, [agentKey, refreshNonce]);

  const map = useMemo(() => buildCosmosMap(topology, agents, { reducedMotion }), [topology, agents, reducedMotion]);
  const rowById = useMemo(() => new Map(map.rows.map(row => [row.id, row])), [map.rows]);
  const navOrder = useMemo(() => [map.core.id, ...map.rows.map(row => row.id)], [map.core.id, map.rows]);
  const selected = rowById.get(selectionId) || null;
  const activeAgentId = selected?.kind === "agent" ? selected.agentId : null;
  const highlightedNodeIds = useMemo(() => {
    if (!selectionId) return new Set(map.nodes.map(node => node.id));
    if (selected?.kind === "relationship") return new Set([selected.source, selected.target]);
    if (selectionId === map.core.id) return new Set(map.laneLinks.map(link => link.agentId));
    if (!activeAgentId) return new Set();
    const ids = new Set([activeAgentId]);
    map.edges.forEach(edge => {
      if (edge.source === activeAgentId) ids.add(edge.target);
      if (edge.target === activeAgentId) ids.add(edge.source);
    });
    return ids;
  }, [activeAgentId, map, selected, selectionId]);

  const setFocusRef = useCallback((id, element) => {
    if (element) focusRefs.current.set(id, element);
    else focusRefs.current.delete(id);
  }, []);
  const select = useCallback(id => setSelectionId(id), []);
  const moveSelection = useCallback((currentId, key) => {
    if (!navOrder.length) return;
    if (key === "Escape") { setSelectionId(""); return; }
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(key)) return;
    const current = Math.max(0, navOrder.indexOf(currentId));
    const next = key === "Home" ? 0 : key === "End" ? navOrder.length - 1 : (current + (["ArrowRight", "ArrowDown"].includes(key) ? 1 : -1) + navOrder.length) % navOrder.length;
    setSelectionId(navOrder[next]);
    requestAnimationFrame(() => focusRefs.current.get(navOrder[next])?.focus());
  }, [navOrder]);
  const handleKeyDown = useCallback((event, id) => {
    if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(id); return; }
    if (["Escape", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); moveSelection(id, event.key); }
  }, [moveSelection, select]);
  const focusSelected = useCallback(id => {
    select(id);
    requestAnimationFrame(() => focusRefs.current.get(id)?.focus());
  }, [select]);
  const changeZoom = useCallback(delta => setZoom(value => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number((value + delta).toFixed(2))))), []);

  const viewWidth = COSMOS_WIDTH / zoom;
  const viewHeight = COSMOS_HEIGHT / zoom;
  const viewBox = `${((COSMOS_WIDTH - viewWidth) / 2).toFixed(2)} ${((COSMOS_HEIGHT - viewHeight) / 2).toFixed(2)} ${viewWidth.toFixed(2)} ${viewHeight.toFixed(2)}`;

  return <LazyMotion features={domAnimation}>
    <section className="view active cosmos-view" aria-label="Agent Map">
      <TopBar map={map} agents={agents} load={load} />
      {loadError && <div className="cosmos-alert" role="alert">Relationship evidence could not be refreshed: {loadError}. Showing the current agent records without inferred edges.</div>}

      <div className="cosmos-stage-row">
        <div className="cosmos-stage">
          {!topologyReady && <div className="cosmos-note" role="status">Checking relationship evidence… agent records stay visible while provenance loads.</div>}
          {topologyReady && !agents.length && (
            <div className="cosmos-note" role="status">
              <strong>The cosmos is empty.</strong> Register your first agent to see it orbit the Neural Vault.
              <Btn variant="primary" onClick={() => onView("marketplace")}>Open Marketplace</Btn>
            </div>
          )}
          {topologyReady && agents.length > 0 && !map.metadata.hasRelationships && (
            <div className="cosmos-note" role="status">
              <strong>{map.emptyState?.title}</strong> {map.emptyState?.detail}
              {map.metadata.droppedRelations > 0 && <small> {map.metadata.droppedRelations} incomplete record(s) excluded.</small>}
            </div>
          )}

          <CosmosMap
            map={map} viewBox={viewBox}
            selectionId={selectionId} activeAgentId={activeAgentId} highlightedNodeIds={highlightedNodeIds}
            effectsOn={effectsOn} reducedMotion={reducedMotion} rowById={rowById}
            onSelect={select} onKeyDown={handleKeyDown} setFocusRef={setFocusRef}
          />

          <div className="cosmos-zoom" aria-label="Agent Map controls">
            <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => changeZoom(0.1)}><ZoomIn size={13} aria-hidden="true" /></button>
            <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => changeZoom(-0.1)}><ZoomOut size={13} aria-hidden="true" /></button>
            <button type="button" aria-label="Fit map" title="Fit map" onClick={() => setZoom(1)}><Maximize2 size={13} aria-hidden="true" /></button>
            <button type="button" aria-label="Refresh evidence" title="Refresh evidence" onClick={() => setRefreshNonce(n => n + 1)}><RefreshCw size={13} aria-hidden="true" /></button>
          </div>
          <Legend legend={map.legend} />
          <span className="sr-only" aria-live="polite">Map zoom {Math.round(zoom * 100)} percent</span>
        </div>

        <CosmosDetail
          selectionId={selectionId} map={map} vault={state.vault}
          onOpenAgent={onOpenAgent} onSelect={focusSelected} onClear={() => setSelectionId("")}
        />
      </div>

      <div className="cosmos-foot">
        <span className="cosmos-key-help">Tab enters the map · Arrows move · Enter inspects · Escape clears</span>
        <EvidenceTable map={map} onSelect={focusSelected} />
        <span className="cosmos-policy">{map.metadata.hasRelationships ? "EVERY LINE IS A VERIFIED RECORD" : "NO SYNTHETIC HUB · NO IMPLIED CONNECTIONS"}</span>
      </div>
    </section>
  </LazyMotion>;
}
