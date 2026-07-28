import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Overlay, Pill } from "@rempeyek/ui";
import { api } from "../api";
import { approveAction } from "../hooks/useGateway";
import { marketplaceAction } from "../lib/marketplace-view.mjs";

const slug = value => String(value)
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 32);
const validSlug = value => /^[a-z0-9][a-z0-9-]{1,31}$/.test(value);

const BLANK = {
  name: "",
  id: "",
  icon: "",
  role: "",
  accent: "#8C5BFF",
  trigger: "",
  home: "",
};

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export function AddAgentModal({
  open,
  onClose,
  onAdded,
  initialSelection = "",
  title = "＋ ADD AGENT",
}) {
  const [choice, setChoice] = useState(initialSelection);
  const [entries, setEntries] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [idTouched, setIdTouched] = useState(false);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState("idle");
  const [validationAttempted, setValidationAttempted] = useState(false);
  const alive = useRef(false);
  const operationGeneration = useRef(0);

  const refreshCatalog = async (generation = operationGeneration.current) => {
    setCatalogStatus("loading");
    const response = await api("/api/marketplace");
    if (!alive.current || generation !== operationGeneration.current) return false;
    if (Array.isArray(response.entries)) {
      setEntries(response.entries.filter(entry => entry.kind === "agent"));
      setCatalogStatus("ready");
      return true;
    }
    setCatalogStatus("error");
    setHint(response.error || "Marketplace catalog is unavailable. You can retry or add a custom agent.");
    return false;
  };

  useEffect(() => {
    alive.current = open;
    if (open) {
      const generation = ++operationGeneration.current;
      setChoice(initialSelection);
      setHint("");
      setBusy(false);
      setValidationAttempted(false);
      refreshCatalog(generation);
    }
    return () => {
      alive.current = false;
      operationGeneration.current += 1;
    };
  }, [open, initialSelection]);

  const selected = useMemo(
    () => entries?.find(entry => entry.id === choice) || null,
    [choice, entries],
  );
  const selectedAction = selected ? marketplaceAction(selected) : null;
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));

  const close = () => {
    operationGeneration.current += 1;
    setChoice(initialSelection);
    setEntries(null);
    setForm(BLANK);
    setIdTouched(false);
    setHint("");
    setBusy(false);
    setCatalogStatus("idle");
    setValidationAttempted(false);
    onClose();
  };

  const finishKnown = async generation => {
    if (generation !== operationGeneration.current) return;
    await refreshCatalog(generation);
    if (generation !== operationGeneration.current) return;
    await onAdded?.();
  };

  const registerKnown = async entry => {
    const generation = ++operationGeneration.current;
    const approvalId = await approveAction(
      "agents.add",
      "registry",
      `Register ${entry.name} to Rempeyek Agent OS.`,
    );
    if (!approvalId || generation !== operationGeneration.current) return;
    setBusy(true);
    const response = await api("/api/agents/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
      body: JSON.stringify({ catalogId: entry.id }),
    });
    if (generation !== operationGeneration.current) return;
    setBusy(false);
    if (response.error) {
      setHint(response.error);
      return;
    }
    await finishKnown(generation);
  };

  const installKnown = async (entry, adapterId) => {
    const generation = ++operationGeneration.current;
    const approvalId = await approveAction(
      "agent.install",
      entry.id,
      `Install the reviewed ${adapterId} adapter for ${entry.name}.`,
    );
    if (!approvalId || generation !== operationGeneration.current) return;
    setBusy(true);
    setHint("Installer is running in a visible terminal.");
    const response = await api(`/api/marketplace/${entry.id}/install`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
      body: JSON.stringify({
        adapterId,
        operationId: crypto.randomUUID(),
        register: !entry.registered,
      }),
    });
    if (generation !== operationGeneration.current) return;
    if (response.error) {
      setBusy(false);
      setHint(response.error);
      return;
    }
    if (response.event?.type === "agent.manual_install_required") {
      setBusy(false);
      setHint(response.event.note || "Finish setup from the official install guide.");
      if (response.event.url) {
        window.open(response.event.url, "_blank", "noopener,noreferrer");
      }
      return;
    }
    if (response.event?.type?.endsWith("_started")) {
      for (
        let attempt = 0;
        attempt < 300
          && alive.current
          && generation === operationGeneration.current;
        attempt += 1
      ) {
        await wait(1200);
        const lifecycle = await api("/api/agents/lifecycle", { timeoutMs: 5000 });
        if (lifecycle.error || lifecycle.busy === false) break;
      }
    }
    if (generation !== operationGeneration.current) return;
    setBusy(false);
    setHint("");
    await finishKnown(generation);
  };

  const runKnownAction = async () => {
    if (!selected || !selectedAction) return;
    if (selectedAction.kind === "register") {
      await registerKnown(selected);
    } else if (selectedAction.kind === "install") {
      await installKnown(selected, selectedAction.adapterId);
    } else if (selectedAction.kind === "manual") {
      if (selectedAction.url) {
        window.open(selectedAction.url, "_blank", "noopener,noreferrer");
      } else {
        setHint("No reviewed installer is available for this platform.");
      }
    }
  };

  const submitCustom = async event => {
    event.preventDefault();
    const id = slug(idTouched ? form.id : form.name);
    setValidationAttempted(true);
    if (!validSlug(id) || !form.name.trim()) {
      setHint("Name and ID are required.");
      return;
    }
    const approvalId = await approveAction(
      "agents.add",
      "registry",
      `Register custom agent ${form.name.trim()} to Rempeyek Agent OS.`,
    );
    if (!approvalId) return;
    setBusy(true);
    const response = await api("/api/agents/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
      body: JSON.stringify({ ...form, id, name: form.name.trim() }),
    });
    setBusy(false);
    if (response.error) {
      setHint(response.error);
      return;
    }
    close();
    await onAdded?.();
  };

  if (!open) return null;

  return (
    <Overlay
      open={open}
      onClose={close}
      boxClass="aa-box"
      labelledBy="addAgentTitle"
    >
      <div className="token-title" id="addAgentTitle">{title}</div>
      <div className="token-sub">
        Choose one known agent or register a manual custom profile. Nothing is added until you confirm its action.
      </div>

      <div className="aa-field wide">
        <label htmlFor="aaAgentChoice">Agent</label>
        <select
          id="aaAgentChoice"
          value={choice}
          disabled={busy}
          onChange={event => {
            setChoice(event.target.value);
            setHint("");
          }}
        >
          <option value="">Choose an agent…</option>
          <optgroup label="Known agents">
            {(entries || []).map(entry => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </optgroup>
          <optgroup label="Manual">
            <option value="custom">Custom agent…</option>
          </optgroup>
        </select>
        {catalogStatus === "loading" && (
          <small className="aa-field-hint" role="status">Loading Marketplace agents…</small>
        )}
        {catalogStatus === "error" && (
          <Btn
            type="button"
            variant="dim"
            disabled={busy}
            onClick={() => refreshCatalog(operationGeneration.current)}
          >
            Retry Marketplace
          </Btn>
        )}
      </div>

      {choice && choice !== "custom" && selected && (
        <div className="aa-cat-card" aria-busy={busy}>
          <span className="aa-cat-icon" aria-hidden="true">
            {selected.icon || selected.name?.slice(0, 1) || "A"}
          </span>
          <div className="aa-cat-body">
            <b>{selected.name}</b>
            <small>{selected.role || selected.summary}</small>
            <span>
              <Pill status={selected.installed ? "running" : "idle"} label={selected.installed ? "installed" : "not installed"} />
              <Pill status={selected.registered ? "running" : "idle"} label={selected.registered ? "registered" : "not registered"} />
            </span>
          </div>
          {selectedAction?.kind === "state" ? (
            <span className="aa-cat-state ok">{selectedAction.label}</span>
          ) : (
            <Btn
              variant="primary"
              disabled={busy}
              onClick={runKnownAction}
            >
              {busy ? "Working…" : selectedAction?.label}
            </Btn>
          )}
        </div>
      )}

      {choice === "custom" && (
        <form className="aa-grid" onSubmit={submitCustom}>
          <div className="aa-field">
            <label htmlFor="aaName">Name *</label>
            <input id="aaName" maxLength={40} placeholder="Nova" required
              aria-invalid={validationAttempted && !form.name.trim()}
              aria-describedby={validationAttempted && !form.name.trim() ? "aaRequiredError" : undefined}
              value={form.name} onChange={event => set("name", event.target.value)} />
          </div>
          <div className="aa-field">
            <label htmlFor="aaId">ID (slug) *</label>
            <input id="aaId" maxLength={32} placeholder="nova" required
              aria-invalid={validationAttempted && !validSlug(slug(idTouched ? form.id : form.name))}
              aria-describedby={validationAttempted && !validSlug(slug(idTouched ? form.id : form.name)) ? "aaRequiredError" : undefined}
              value={idTouched ? form.id : slug(form.name)}
              onChange={event => {
                setIdTouched(true);
                set("id", event.target.value);
              }} />
          </div>
          {validationAttempted && (!form.name.trim() || !validSlug(slug(idTouched ? form.id : form.name))) && (
            <small id="aaRequiredError" className="aa-field-hint aa-hint err" role="alert">
              Enter a name and a valid 2–32 character slug.
            </small>
          )}
          <div className="aa-field">
            <label htmlFor="aaIcon">Icon (emoji)</label>
            <input id="aaIcon" maxLength={4} placeholder="🤖"
              value={form.icon} onChange={event => set("icon", event.target.value)} />
          </div>
          <div className="aa-field">
            <label htmlFor="aaAccent">Accent</label>
            <input id="aaAccent" type="color"
              value={form.accent} onChange={event => set("accent", event.target.value)} />
          </div>
          <div className="aa-field wide">
            <label htmlFor="aaRole">Role</label>
            <input id="aaRole" maxLength={80} placeholder="Research & analysis specialist"
              value={form.role} onChange={event => set("role", event.target.value)} />
          </div>
          <div className="aa-field">
            <label htmlFor="aaTrigger">Trigger CLI (optional)</label>
            <input id="aaTrigger" maxLength={200} placeholder="nova"
              value={form.trigger} onChange={event => set("trigger", event.target.value)} />
          </div>
          <div className="aa-field">
            <label htmlFor="aaHome">Home dir (optional)</label>
            <input id="aaHome" maxLength={200} aria-describedby="aaHomeHelp"
              placeholder="C:\Users\you\Agent Workspace"
              value={form.home} onChange={event => set("home", event.target.value)} />
            <small id="aaHomeHelp" className="aa-field-hint">
              Default launch folder: Rempeyek Agent OS state folder.
            </small>
          </div>
          <div className="aa-field wide aa-actions">
            <Btn type="button" variant="dim" onClick={close}>Cancel</Btn>
            <Btn type="submit" variant="primary" disabled={busy}>
              {busy ? "Working…" : "Register custom agent"}
            </Btn>
          </div>
        </form>
      )}

      {hint && (
        <div className="aa-hint err aa-feedback" role="alert">{hint}</div>
      )}
    </Overlay>
  );
}
