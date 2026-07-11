import { useState } from "react";
import { Btn, Overlay } from "@rempeyek/ui";
import { api } from "../api";

const slug = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

const BLANK = { name: "", id: "", icon: "", role: "", accent: "#8C5BFF", trigger: "", home: "" };

/** Registers a new agent into agents.config.json (POST /api/agents/add).
    Optional trigger + home make it summonable right away. */
export function AddAgentModal({ open, onClose, onAdded }) {
  const [f, setF] = useState(BLANK);
  const [idTouched, setIdTouched] = useState(false);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const close = () => { setF(BLANK); setIdTouched(false); setHint(""); onClose(); };

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
      <div className="token-title">＋ REGISTER NEW AGENT</div>
      <div className="token-sub">
        Add a node to the mesh. It appears in the topology, cards, and sidebar immediately;
        give it a trigger CLI to make it summonable.
      </div>
      <form className="aa-grid" onSubmit={submit}>
        <div className="aa-field">
          <label htmlFor="aaName">Name *</label>
          <input id="aaName" required maxLength={40} placeholder="Nova" autoFocus
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
