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
      const data = await api("/api/graph", { timeoutMs: 20000 });
      if (!alive || data.error || !Array.isArray(data.nodes)) return;
      graphRef.current?.setData(data);
      setStats(data.stats || {});
    };
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 90000);
    return () => { alive = false; clearInterval(id); };
  }, [active]);

  useEffect(() => { graphRef.current?.setQuery(query); }, [query]);
  useEffect(() => { graphRef.current?.setLayers(layers); }, [layers]);
  useEffect(() => { if (active) graphRef.current?.reheat(); }, [active, theme]);

  const s = stats || {};
  return (
    <>
      <div className="graph-bar">
        <span className="graph-title">NEURAL VAULT</span>
        <input
          className="graph-search" type="search" placeholder="Search nodes…" autoComplete="off"
          value={query} onChange={e => setQuery(e.target.value)}
        />
        <span className="graph-layers">
          {LAYERS.map(l => (
            <button
              key={l.id}
              className={`lyr ${layers[l.id] ? "on" : ""}`.trim()}
              title={l.title}
              onClick={() => setLayers(p => ({ ...p, [l.id]: !p[l.id] }))}
            >
              {l.label}
            </button>
          ))}
        </span>
        <span className="graph-stats">
          {stats ? `${s.notes ?? 0} notes · ${s.links ?? 0} links · ${s.tagEdges ?? 0} tag · ${s.orphans ?? 0} orphans` : "loading…"}
        </span>
        <a className="graph-open" href={obsUri("INDEX.md")} title="Open the vault in Obsidian">⧉ OPEN VAULT</a>
      </div>
      <div className="graph-wrap">
        <canvas ref={canvasRef} id="graphCanvas" />
        <div className="graph-hint">drag to pan · scroll to zoom · click a node to open it in Obsidian</div>
      </div>
    </>
  );
}
