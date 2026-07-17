import { useEffect, useRef, useState } from "react";
import { Btn } from "@rempeyek/ui";
import { api } from "../api";
import { approveAction } from "../hooks/useGateway";

/** Curated agent catalog: known agents install with one approved click — the command is
    vetted server-side, never typed in the UI. Shared by the Marketplace view and the
    ＋ Add Agent modal. */
export function CatalogGrid({ onAdded }) {
  const [entries, setEntries] = useState(null);   // catalog + installed/registered flags
  const [installing, setInstalling] = useState(null);
  const [tail, setTail] = useState([]);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(false);

  const refreshCatalog = () => api("/api/catalog").then(r => { if (alive.current && r.entries) setEntries(r.entries); });
  useEffect(() => {
    alive.current = true;
    refreshCatalog();
    return () => { alive.current = false; };
  }, []);

  /* Catalog: run the vetted installer with a live tail, then refresh the roster. */
  const install = async entry => {
    setHint("");
    const approvalId = await approveAction("agent.install", entry.id,
      `Run the vetted installer for ${entry.name}:\n  ${entry.install.cmd}`);
    if (!approvalId) return;
    setInstalling(entry.id); setTail([]);
    const r = await api("/api/agents/install", {
      method: "POST", headers: { "x-approval-id": approvalId },
      body: JSON.stringify({ id: entry.id }),
    });
    if (r.error) { setHint(r.error); setInstalling(null); return; }
    let since = 0;
    for (let i = 0; i < 300 && alive.current; i++) {          // ≤ 6 min of tailing
      await new Promise(t => setTimeout(t, 1200));
      const l = await api(`/api/proc/${entry.id}/log?since=${since}`, { timeoutMs: 5000 });
      if (l.lines?.length) { setTail(t => [...t, ...l.lines].slice(-12)); since = l.next; }
      if (l.status && l.status !== "running") break;
    }
    setInstalling(null);
    refreshCatalog();
    onAdded();
  };

  /* Catalog: native/link-only agents — register, then open their install page. */
  const registerOnly = async entry => {
    setHint(""); setBusy(true);
    const r = await api("/api/agents/add", { method: "POST", body: JSON.stringify({ catalogId: entry.id }) });
    setBusy(false);
    if (r.error) { setHint(r.error); return; }
    refreshCatalog(); onAdded();
    if (!entry.installed && entry.install.url) window.open(entry.install.url, "_blank", "noopener");
  };

  const catalogAction = entry => {
    if (installing) return <span className="aa-cat-state">{installing === entry.id ? "installing…" : "—"}</span>;
    if (entry.registered && entry.installed) return <span className="aa-cat-state ok">✓ ready</span>;
    if (entry.install.cmd && entry.installed === false)
      return <Btn variant="primary" onClick={() => install(entry)}>{entry.registered ? "Install" : "Install + register"}</Btn>;
    if (!entry.registered)
      return <Btn onClick={() => registerOnly(entry)} disabled={busy}>{entry.installed ? "Register" : "Register + install page ↗"}</Btn>;
    return <span className="aa-cat-state">{entry.install.url ? <a href={entry.install.url} target="_blank" rel="noopener noreferrer">install page ↗</a> : "registered"}</span>;
  };

  return (
    <>
      <div className="aa-catalog" role="list" aria-label="Agent catalog">
        {!entries ? <span className="aa-cat-state">loading catalog…</span> : entries.map(entry => (
          <div className="aa-cat-card" role="listitem" key={entry.id}>
            <span className="aa-cat-icon" aria-hidden="true">{entry.icon}</span>
            <div className="aa-cat-body">
              <b>{entry.name}</b>
              <small>{entry.role}</small>
            </div>
            {catalogAction(entry)}
          </div>
        ))}
      </div>
      {installing && (
        <pre className="aa-cat-log" aria-live="polite">
          {tail.length ? tail.map(l => `[${l.t}] ${l.s === "err" ? "⚠ " : ""}${l.line}`).join("\n") : "starting installer…"}
        </pre>
      )}
      {hint && <span className="aa-hint err" role="alert">{hint}</span>}
    </>
  );
}
