import { useState } from "react";
import { Btn, Overlay } from "@rempeyek/ui";
import { api } from "../api";

export function NewProjectModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    const result = await api("/api/project", { method: "POST", body: JSON.stringify({ name, goal }) });
    setBusy(false);
    if (result.error) return setError(result.error);
    setName("");
    setGoal("");
    onCreated(result.slug);
  };

  return <Overlay open={open} onClose={onClose} boxClass="aa-box" labelledBy="new-project-title">
    <div className="token-title" id="new-project-title">NEW PROJECT WORKSPACE</div>
    <div className="token-sub">Creates a local Markdown workspace in the Vault.</div>
    <div className="aa-field wide"><label htmlFor="new-project-name">Name</label><input id="new-project-name" value={name} onChange={event => setName(event.target.value)} placeholder="Startup A" /></div>
    <div className="aa-field wide"><label htmlFor="new-project-goal">Goal</label><input id="new-project-goal" value={goal} onChange={event => setGoal(event.target.value)} placeholder="Ship the landing page and waitlist" onKeyDown={event => event.key === "Enter" && !event.nativeEvent?.isComposing && create()} /></div>
    <div className="aa-hint err" role={error ? "alert" : undefined}>{error}</div>
    <div className="aa-actions"><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={create} disabled={!name.trim() || busy}>{busy ? "Creating…" : "Create project"}</Btn></div>
  </Overlay>;
}
