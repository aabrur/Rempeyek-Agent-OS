import { useEffect, useMemo, useRef, useState } from "react";
import { breadcrumbFor, changedNodeIds, layersForMode, NeuralGraph, projectGraph } from "@rempeyek/neural-engine";
import { api } from "../api";
import { obsUri } from "../lib/obsidian";

const LAYERS = [
  { id: "link", label: "LINKS", title: "Resolved [[wikilinks]] between notes" },
  { id: "ghost", label: "GHOSTS", title: "Unresolved wikilinks shown as faded, dashed relationships" },
  { id: "tag", label: "TAGS", title: "Optional tag overlay; not part of Obsidian parity defaults" },
  { id: "folder", label: "FOLDERS", title: "Optional folder structure overlay; not part of Obsidian parity defaults" },
];

export function NeuralGraphCanvas({ active, theme }) {
  const canvasRef = useRef(null);
  const graphRef = useRef(null);
  const previousSnapshotRef = useRef(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("cosmos");
  const [layers, setLayers] = useState(() => layersForMode("cosmos"));
  const [motion, setMotion] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [error, setError] = useState("");

  const projection = useMemo(() => projectGraph(data || {}, { mode, layers, focusId }), [data, mode, layers, focusId]);
  const selected = useMemo(() => (data?.nodes || []).find(node => node.id === selectedId) || null, [data, selectedId]);
  const breadcrumbs = breadcrumbFor(selected);

  useEffect(() => {
    graphRef.current = NeuralGraph(canvasRef.current, {
      onOpen: node => { location.href = obsUri(node.id); },
      onSelect: node => setSelectedId(node?.id || null),
      onFocus: node => setFocusId(node.id),
      onEscape: () => setFocusId(null),
    });
    return () => { graphRef.current?.destroy(); graphRef.current = null; };
  }, []);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = async () => {
      const next = await api("/api/vault/graph", { timeoutMs: 20000 });
      if (!alive) return;
      if (next.error || !Array.isArray(next.nodes)) { setError(next.error || "Invalid Vault graph response"); return; }
      const changed = previousSnapshotRef.current ? [...changedNodeIds(previousSnapshotRef.current, next)] : [];
      previousSnapshotRef.current = next;
      setError(""); setData({ ...next, metadata: { ...next.metadata, changedNodeIds: changed } });
    };
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 90000);
    return () => { alive = false; clearInterval(id); };
  }, [active]);

  useEffect(() => { if (data) graphRef.current?.setData(projection); }, [data, projection]);
  useEffect(() => {
    if (selectedId && !projection.nodes.some(node => node.id === selectedId)) setSelectedId(null);
    if (focusId && !projection.metadata.focusId) setFocusId(null);
  }, [focusId, projection, selectedId]);
  useEffect(() => { graphRef.current?.setQuery(query); }, [query]);
  useEffect(() => { graphRef.current?.setMode(mode); }, [mode]);
  useEffect(() => { graphRef.current?.setMotion(motion); }, [motion]);
  useEffect(() => { if (active) graphRef.current?.reheat(); }, [active, theme]);

  const chooseMode = next => { setMode(next); setLayers(layersForMode(next)); setFocusId(null); };
  const toggleLayer = id => setLayers(previous => ({ ...previous, [id]: !previous[id] }));
  const selectFirstMatch = () => {
    const term = query.trim().toLowerCase();
    if (!term) return;
    const match = projection.nodes.find(node => node.label?.toLowerCase().includes(term) || node.id.toLowerCase().includes(term));
    if (match) { setSelectedId(match.id); graphRef.current?.select(match.id); }
  };
  const openSelected = () => { if (selected?.type === "note") location.href = obsUri(selected.id); };

  return (
    <div className="neural-vault-v2">
      <header className="graph-bar">
        <div className="graph-heading">
          <span className="graph-title">NEURAL VAULT</span>
          <span className="graph-counts" aria-live="polite">{projection.counts.nodes} nodes · {projection.counts.edges} edges</span>
        </div>
        <input aria-label="Search Vault graph nodes" className="graph-search" type="search" placeholder="Search notes or paths…"
          value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") selectFirstMatch(); }} />
        <div className="graph-layers" aria-label="Graph relationship layers">
          {LAYERS.map(layer => <button key={layer.id} className={`lyr ${layers[layer.id] ? "on" : ""}`.trim()} title={layer.title}
            aria-pressed={layers[layer.id]} onClick={() => toggleLayer(layer.id)}>{layer.label}</button>)}
        </div>
        <div className="graph-modes" aria-label="Graph appearance">
          <button className={`lyr ${mode === "parity" ? "on" : ""}`} aria-pressed={mode === "parity"} onClick={() => chooseMode("parity")}>OBSIDIAN PARITY</button>
          <button className={`lyr ${mode === "cosmos" ? "on" : ""}`} aria-pressed={mode === "cosmos"} onClick={() => chooseMode("cosmos")}>COSMOS</button>
          <button className={`lyr ${motion ? "on" : ""}`} aria-pressed={motion} onClick={() => setMotion(value => !value)}>{motion ? "PAUSE" : "RESUME"}</button>
          <button className={`lyr ${tableOpen ? "on" : ""}`} aria-expanded={tableOpen} onClick={() => setTableOpen(value => !value)}>TABLE</button>
        </div>
        <a className="graph-open" href={obsUri("INDEX.md")}>OPEN VAULT</a>
      </header>

      {error && <div className="graph-error" role="alert">Vault graph unavailable: {error}</div>}
      {focusId && <div className="graph-focus-bar" role="status">Neighborhood focus: {selected?.label || focusId} · {projection.counts.nodes} nodes <button onClick={() => setFocusId(null)}>Clear focus</button></div>}

      <div className="graph-workspace">
        <section className="graph-stage" aria-label="Interactive Vault graph">
          <div className="graph-wrap">
            <canvas ref={canvasRef} id="graphCanvas" tabIndex="0"
              aria-label={`Vault knowledge graph in ${mode} mode. Arrow keys select nodes, Enter opens a note, F focuses neighbors, Escape clears focus.`} />
            <div className="graph-hint">drag to pan · wheel to zoom · click to inspect · double-click to open</div>
          </div>
          <GraphLegend mode={mode} layers={layers} />
        </section>
        <GraphInspector node={selected} breadcrumbs={breadcrumbs} focused={focusId === selected?.id}
          onOpen={openSelected} onFocus={() => selected && setFocusId(selected.id)} onClear={() => setFocusId(null)} />
      </div>

      {tableOpen && <GraphTable data={projection} selectedId={selectedId} onSelect={id => { setSelectedId(id); graphRef.current?.select(id); }} />}
    </div>
  );
}

function GraphLegend({ mode, layers }) {
  return <div className="graph-semantic-legend" aria-label="Graph visual legend">
    <span><i className="legend-node" />Size = connection degree</span>
    <span><i className="legend-recent" />Bloom = modified in 7 days</span>
    <span><i className="legend-ghost" />Faded/dashed = unresolved link</span>
    <span><i className="legend-change" />Dashed ring = changed snapshot</span>
    <span>{mode === "parity" && !layers.tag && !layers.folder ? "Parity: notes + wikilinks" : "Overlays are explicit"}</span>
  </div>;
}

function GraphInspector({ node, breadcrumbs, focused, onOpen, onFocus, onClear }) {
  return <aside className="graph-inspector" aria-label="Selected graph node" aria-live="polite">
    <div className="graph-inspector-label">INSPECTOR</div>
    {!node ? <p>Select a node with pointer or arrow keys.</p> : <>
      <nav className="graph-breadcrumbs" aria-label="Selected node path">{breadcrumbs.map((part, index) => <span key={`${part}-${index}`}>{part}</span>)}</nav>
      <h2>{node.label}</h2>
      <dl>
        <div><dt>Type</dt><dd>{node.type}</dd></div><div><dt>Folder</dt><dd>{node.folder || "(root)"}</dd></div>
        <div><dt>Connections</dt><dd>{node.degree || 0}</dd></div><div><dt>Modified</dt><dd>{node.mtime ? new Date(node.mtime).toLocaleString() : "Not applicable"}</dd></div>
        <div className="wide"><dt>Path</dt><dd>{node.id}</dd></div>
      </dl>
      <div className="graph-inspector-actions">
        <button className="btn btn-primary" disabled={node.type !== "note"} onClick={onOpen}>Open in Obsidian</button>
        <button className="btn btn-dim" onClick={onFocus}>Focus neighbors</button>
        {focused && <button className="btn btn-dim" onClick={onClear}>Clear focus</button>}
      </div>
    </>}
  </aside>;
}

function GraphTable({ data, selectedId, onSelect }) {
  const degree = new Map(data.nodes.map(node => [node.id, data.adjacency[node.id]?.length || 0]));
  return <div className="graph-table-wrap" tabIndex="0" aria-label={`${data.counts.nodes} Vault graph nodes and ${data.counts.edges} edges`}>
    <table className="graph-table">
      <caption>Same filtered dataset as the Canvas: {data.counts.nodes} nodes and {data.counts.edges} edges.</caption>
      <thead><tr><th scope="col">Node</th><th scope="col">Type</th><th scope="col">Folder</th><th scope="col">Connections</th><th scope="col">Action</th></tr></thead>
      <tbody>{data.nodes.map(node => <tr key={node.id} className={node.id === selectedId ? "selected" : ""}>
        <th scope="row"><button className="graph-table-node" onClick={() => onSelect(node.id)}>{node.label}</button></th>
        <td>{node.type}</td><td>{node.folder}</td><td>{degree.get(node.id)}</td>
        <td>{node.type === "note" ? <a href={obsUri(node.id)}>Open in Obsidian</a> : <span>Structural node</span>}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
