import { useEffect, useRef, useState } from "react";
import { Btn, Overlay } from "@rempeyek/ui";
import { api } from "../api";
import { approveAction } from "../hooks/useGateway";

const slug = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

const BLANK = { name: "", id: "", icon: "", role: "", accent: "#8C5BFF", trigger: "", home: "" };

/** ＋ Add Agent — two paths:
    1. CATALOG (primary): pick a known agent → if its CLI is missing, one approved click runs the
       VETTED installer (command resolved server-side from the catalog, never from this form) with a
       live log tail; success auto-registers it, summonable immediately.
    2. CUSTOM: register any agent; trigger + home persist as a real gateway (observe-only actions). */
export function AddAgentModal({ open, onClose, onAdded }) {
  const [f, setF] = useState(BLANK);
  const [idTouched, setIdTouched] = useState(false);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState(null);   // catalog + installed/registered flags
  const [installing, setInstalling] = useState(null);
  const [tail, setTail] = useState([]);
  const alive = useRef(false);

  const refreshCatalog = () => api("/api/catalog").then(r => { if (alive.current && r.entries) setEntries(r.entries); });
  useEffect(() => {
    alive.current = open;
    if (open) refreshCatalog();
    return () => { alive.current = false; };
  }, [open]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const close = () => { setF(BLANK); setIdTouched(false); setHint(""); setInstalling(null); setTail([]); onClose(); };

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

  const submit = async e => {
    e.preventDefault();
    const id = slug(idTouched ? f.id : f.name);
    if (!id || !f.name.trim()) { setHint("name (and id) required"); return; }
    setBusy(true);
    const r = await api("/api/agents/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, id, name: f.name.trim() }),
    });
    setBusy(false);
    if (r.error) { setHint(r.error); return; }
    close();
    onAdded();
  };

  return (
    <Overlay open={open} onClose={close} boxClass="aa-box">
      <div className="token-title">＋ ADD AGENT</div>
      <div className="token-sub">
        Known agents install with one approved click — the command is vetted server-side, never typed here.
      </div>

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

      <div className="token-sub aa-custom-head">Custom agent</div>
      <form className="aa-grid" onSubmit={submit}>
        <div className="aa-field">
          <label htmlFor="aaName">Name *</label>
          <input id="aaName" maxLength={40} placeholder="Nova"
            value={f.name} onChange={e => set("name", e.target.value)} />
        </div>
        <div className="aa-field">
          <label htmlFor="aaId">ID (slug)</label>
          <input id="aaId" maxLength={32} placeholder="nova"
            value={idTouched ? f.id : slug(f.name)}
            onChange={e => { setIdTouched(true); set("id", e.target.value); }} />
        </div>
        <div className="aa-field">
          <label htmlFor="aaIcon">Icon (emoji)</label>
          <input id="aaIcon" maxLength={4} placeholder="🤖"
            value={f.icon} onChange={e => set("icon", e.target.value)} />
        </div>
        <div className="aa-field">
          <label htmlFor="aaAccent">Accent</label>
          <input id="aaAccent" type="color"
            value={f.accent} onChange={e => set("accent", e.target.value)} />
        </div>
        <div className="aa-field wide">
          <label htmlFor="aaRole">Role</label>
          <input id="aaRole" maxLength={80} placeholder="Research & analysis specialist"
            value={f.role} onChange={e => set("role", e.target.value)} />
        </div>
        <div className="aa-field">
          <label htmlFor="aaTrigger">Trigger CLI (optional)</label>
          <input id="aaTrigger" maxLength={200} placeholder="nova"
            value={f.trigger} onChange={e => set("trigger", e.target.value)} />
        </div>
        <div className="aa-field">
          <label htmlFor="aaHome">Home dir (optional)</label>
          <input id="aaHome" maxLength={200} placeholder="C:\Users\you\.nova"
            value={f.home} onChange={e => set("home", e.target.value)} />
        </div>
        <div className="aa-field wide aa-actions">
          <span className={`aa-hint ${hint ? "err" : ""}`.trim()} style={{ marginRight: "auto" }}>{hint}</span>
          <Btn type="button" variant="dim" onClick={close}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy}>{busy ? "…" : "＋ Register"}</Btn>
        </div>
      </form>
    </Overlay>
  );
}
