import { useEffect, useRef, useState } from "react";
import { Btn, Pill } from "@rempeyek/ui";
import { api } from "../api";
import { approveAction } from "../hooks/useGateway";
import {
  filterMarketplace,
  marketplaceAction,
} from "../lib/marketplace-view.mjs";

/** Marketplace cards shared by the Marketplace view and the Add Agent modal.
    Installer selection stays server-reviewed; the browser sends only entity and adapter IDs. */
export function CatalogGrid({ onAdded, kind = "all" }) {
  const [entries, setEntries] = useState(null);
  const [installing, setInstalling] = useState(null);
  const [tail, setTail] = useState([]);
  const [hint, setHint] = useState("");
  const alive = useRef(false);

  const refreshCatalog = () => api("/api/marketplace").then(response => {
    if (alive.current && response.entries) setEntries(response.entries);
  });

  useEffect(() => {
    alive.current = true;
    refreshCatalog();
    return () => { alive.current = false; };
  }, []);

  const install = async (entry, adapterId) => {
    setHint("");
    const approvalId = await approveAction(
      "agent.install",
      entry.id,
      `Install the reviewed ${adapterId} adapter for ${entry.name}.`,
    );
    if (!approvalId) return;

    setInstalling(entry.id);
    setTail(["Starting reviewed Marketplace operation…"]);
    const response = await api(`/api/marketplace/${entry.id}/install`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
      body: JSON.stringify({
        adapterId,
        operationId: crypto.randomUUID(),
        register: entry.kind === "agent" && !entry.registered,
      }),
    });
    if (response.error) {
      setHint(response.error);
      setInstalling(null);
      return;
    }

    setTail([response.event?.type || "Marketplace operation accepted"]);
    if (response.event?.type?.endsWith("_started")) {
      for (let attempt = 0; attempt < 300 && alive.current; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        const lifecycle = await api("/api/agents/lifecycle", { timeoutMs: 5000 });
        if (lifecycle.error || lifecycle.busy === false) break;
      }
    }
    setInstalling(null);
    await refreshCatalog();
    onAdded?.();
  };

  const registerOnly = async entry => {
    setHint("");
    const response = await api("/api/agents/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogId: entry.id }),
    });
    if (response.error) {
      setHint(response.error);
      return;
    }
    await refreshCatalog();
    onAdded?.();
  };

  const renderAction = entry => {
    const action = marketplaceAction(entry, { runningId: installing });
    if (action.kind === "install") {
      return (
        <Btn variant="primary" onClick={() => install(entry, action.adapterId)}>
          {action.label}
        </Btn>
      );
    }
    if (action.kind === "register") {
      return <Btn onClick={() => registerOnly(entry)}>{action.label}</Btn>;
    }
    if (action.kind === "official-link") {
      return (
        <span className="aa-cat-state">
          <a href={entry.officialUrl} target="_blank" rel="noopener noreferrer">
            {action.label}
          </a>
        </span>
      );
    }
    return (
      <span className={`aa-cat-state ${action.label.includes("ready") ? "ok" : ""}`.trim()}>
        {action.label}
      </span>
    );
  };

  const visibleEntries = entries ? filterMarketplace(entries, kind) : null;

  return (
    <>
      <div className="aa-catalog" role="list" aria-label="Agent catalog">
        {!visibleEntries
          ? <span className="aa-cat-state">loading catalog…</span>
          : visibleEntries.map(entry => (
            <div className="aa-cat-card" role="listitem" key={entry.id}>
              <span className="aa-cat-icon" aria-hidden="true">
                {entry.icon || entry.name?.slice(0, 1) || "A"}
              </span>
              <div className="aa-cat-body">
                <b>{entry.name}</b>
                <small title={entry.summary}>{entry.role || entry.summary}</small>
                {entry.featured ? <Pill status="running" label="featured" /> : null}
              </div>
              {renderAction(entry)}
            </div>
          ))}
      </div>
      {installing && (
        <pre className="aa-cat-log" aria-live="polite">
          {tail.length ? tail.join("\n") : "starting installer…"}
        </pre>
      )}
      {hint && <span className="aa-hint err" role="alert">{hint}</span>}
    </>
  );
}
