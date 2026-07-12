import { useEffect, useRef, useState } from "react";
import { NeuralGraph } from "@rempeyek/neural-engine";
import { api } from "../api";
import { obsUri } from "../lib/obsidian";

const LAYERS = [
  { id: "link", label: "LINKS", title: "Real [[wikilinks]] between notes" },
  { id: "tag", label: "TAGS", title: "Notes sharing a #tag" },
  { id: "folder", label: "FOLDERS", title: "Folder structure skeleton" },
  { id: "ghost", label: "GHOSTS", title: "Links to notes that do not exist yet" },
];

/** Imperative canvas engine wrapped in a component: the engine owns the canvas and its
    own RAF loop; React only feeds it data and layer/query changes. */
export function NeuralGraphCanvas({ active, theme }) {
  const canvasRef = useRef(null);
  const graphRef = useRef(null);
  const [stats, setStats] = useState(null);
  const [query, setQuery] = useState("");
  const [layers, setLayers] = useState({ link: true, tag: true, folder: true, ghost: true });
  const [mode, setMode] = useState("cosmos");
  const [motion, setMotion] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [data, setData] = useState(null);
  const [tableOpen, setTableOpen] = useState(false);

  // create once, destroy on unmount
  useEffect(() => {
    graphRef.current = NeuralGraph(canvasRef.current, { onOpen: n => { location.href = obsUri(n.id); } });
    return () => { graphRef.current?.destroy(); graphRef.current = null; };
  }, []);

  // load data when the view opens, then refresh every 90s while it stays open
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = async () => {
      const next = await api("/api/vault/graph", { timeoutMs: 20000 });
      if (!alive || next.error || !Array.isArray(next.nodes)) return;
      graphRef.current?.setData(next);
      setData(next);
      setStats(next.stats || {});
    };
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 90000);
    return () => { alive = false; clearInterval(id); };
  }, [active]);

  useEffect(() => { graphRef.current?.setQuery(query); }, [query]);
  useEffect(() => { graphRef.current?.setLayers(layers); }, [layers]);
  useEffect(() => { graphRef.current?.setMode(mode); }, [mode]);
  useEffect(() => { graphRef.current?.setMotion(motion); }, [motion]);
  useEffect(() => { if (active) graphRef.current?.reheat(); }, [active, theme]);

  const s = stats || {};
  return (
    <>
      <div className="graph-bar">
        <span className="graph-title">NEURAL VAULT</span>
        <input
          aria-label="Search Vault graph nodes"
          className="graph-search" type="search" placeholder="Search nodes…" autoComplete="off"
          value={query} onChange={e => setQuery(e.target.value)}
        />
        <span className="graph-layers">
          {LAYERS.map(l => (
            <button
              key={l.id}
              className={`lyr ${layers[l.id] ? "on" : ""}`.trim()}
              title={l.title}
              aria-pressed={layers[l.id]}
              onClick={() => setLayers(p => ({ ...p, [l.id]: !p[l.id] }))}
            >
              {l.label}
            </button>
          ))}
        </span>
        <span className="graph-modes" aria-label="Graph appearance">
          <button className={`lyr ${mode === "parity" ? "on" : ""}`} aria-pressed={mode === "parity"} onClick={() => setMode("parity")}>OBSIDIAN PARITY</button>
          <button className={`lyr ${mode === "cosmos" ? "on" : ""}`} aria-pressed={mode === "cosmos"} onClick={() => setMode("cosmos")}>COSMOS</button>
          <button className={`lyr ${motion ? "on" : ""}`} aria-pressed={motion} onClick={() => setMotion(value => !value)}>MOTION</button>
          <button className={`lyr ${tableOpen ? "on" : ""}`} aria-expanded={tableOpen} onClick={() => setTableOpen(value => !value)}>TABLE</button>
        </span>
        <span className="graph-stats">
          {stats ? `${s.notes ?? 0} notes · ${s.links ?? 0} links · ${s.tagEdges ?? 0} tag · ${s.orphans ?? 0} orphans` : "loading…"}
        </span>
        <a className="graph-open" href={obsUri("INDEX.md")} title="Open the vault in Obsidian">⧉ OPEN VAULT</a>
      </div>
      <div className="graph-wrap">
        <canvas ref={canvasRef} id="graphCanvas" aria-label={`Vault knowledge graph in ${mode} mode`} />
        <div className="graph-hint">drag to pan · scroll to zoom · click a node to open it in Obsidian</div>
      </div>
      {tableOpen && <GraphTable data={data} query={query} />}
    </>
  );
}

function GraphTable({ data, query }) {
  const term = query.trim().toLowerCase();
  const nodes = (data?.nodes || []).filter(node => !term || node.label?.toLowerCase().includes(term) || node.id.toLowerCase().includes(term));
  const edgeCount = new Map();
  for (const edge of data?.edges || []) {
    edgeCount.set(edge.source, (edgeCount.get(edge.source) || 0) + 1);
    edgeCount.set(edge.target, (edgeCount.get(edge.target) || 0) + 1);
  }
  return (
    <div className="graph-table-wrap" tabIndex="0" aria-label={`${nodes.length} Vault graph nodes`}>
      <table className="graph-table">
        <caption>Vault notes and structural nodes. This table uses the same dataset as both visual modes.</caption>
        <thead><tr><th scope="col">Node</th><th scope="col">Type</th><th scope="col">Folder</th><th scope="col">Connections</th></tr></thead>
        <tbody>{nodes.map(node => <tr key={node.id}><th scope="row">{node.label}</th><td>{node.type}</td><td>{node.folder}</td><td>{edgeCount.get(node.id) || 0}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
