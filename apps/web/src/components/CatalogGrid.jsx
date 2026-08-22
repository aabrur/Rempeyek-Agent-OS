import { useEffect, useRef, useState } from "react";
import { Btn, Pill } from "@rempeyek/ui";
import { api } from "../api";
import { approveAction } from "../hooks/useGateway";
import {
  filterMarketplace,
  marketplaceAction,
} from "../lib/marketplace-view.mjs";

export function CatalogGrid({ onAdded, kind = "all" }) {
  const [entries, setEntries] = useState(null);
  const [installing, setInstalling] = useState(null);
  const [tail, setTail] = useState([]);
  const [hint, setHint] = useState("");
  const [pluginModal, setPluginModal] = useState(null);
  const [userAgents, setUserAgents] = useState([]);
  const [targetAgent, setTargetAgent] = useState("");
  const [installMode, setInstallMode] = useState("direct");
  const alive = useRef(false);

  const refreshCatalog = () => {
    api("/api/marketplace").then(response => {
      if (alive.current && response.entries) setEntries(response.entries);
    });
    api("/api/state").then(state => {
      if (alive.current && state?.agents) {
        setUserAgents(state.agents);
        if (state.agents.length && !targetAgent) setTargetAgent(state.agents[0].id);
      }
    });
  };

  useEffect(() => {
    alive.current = true;
    refreshCatalog();
    return () => { alive.current = false; };
  }, []);

  const install = async (entry, adapterId) => {
    if (entry.kind === "plugin" || entry.id.includes("hypertaks")) {
      setPluginModal(entry);
      return;
    }

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
      setHint(`Install ${entry.name} failed: ${response.error}`);
      setInstalling(null);
      return;
    }

    if (response.event?.type === "agent.manual_install_required") {
      setHint(response.event.note || "Finish setup from the official install guide.");
      if (response.event.url) window.open(response.event.url, "_blank", "noopener,noreferrer");
      setInstalling(null);
      return;
    }
    setTail([
      response.event?.type || "Marketplace operation accepted",
      "Installer is running in a visible terminal. Registration waits for exit code 0.",
    ]);
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

  const handlePluginInstallSubmit = async () => {
    if (!pluginModal) return;
    const entry = pluginModal;
    setHint("");

    if (installMode === "repo") {
      const url = entry.officialUrl || entry.sourceUrl || "https://github.com/aabrur/hypertaks-agent";
      window.open(url, "_blank", "noopener,noreferrer");
      setHint("Opening official repository / package page.");
      setPluginModal(null);
      return;
    }

    if (installMode === "copy") {
      const snippet = JSON.stringify({
        plugin: entry.id,
        name: entry.name,
        targetAgent: targetAgent || "all",
        skills: ["hypertaks"],
        install: {
          marketplace: `/api/marketplace/${entry.id}/install`,
          skillsSync: "/api/skills/sync",
        },
        config: { enabled: true, autoSync: true },
      }, null, 2);
      try {
        await navigator.clipboard.writeText(snippet);
        setHint("Configuration snippet copied to clipboard.");
      } catch (_) {
        setHint("Clipboard blocked - copy the snippet from the modal.");
      }
      return;
    }

    // Direct install: managed marketplace copy + optional per-agent skill sync
    if (!targetAgent && userAgents.length) {
      setHint("Select a target agent first, or register an agent from the Agents tab.");
      return;
    }
    const approvalId = await approveAction(
      "plugin.install",
      entry.id,
      `Install ${entry.name} plugin${targetAgent ? ` and sync skills to ${targetAgent}` : ""}.`,
    );
    if (!approvalId) return;

    setInstalling(entry.id);
    setTail(["Installing managed plugin bundle…"]);
    const market = await api(`/api/marketplace/${entry.id}/install`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
      body: JSON.stringify({
        adapterId: entry.adapterIds?.[0] || "agents-standard",
        operationId: crypto.randomUUID(),
      }),
    });

    let sync = null;
    if (targetAgent) {
      sync = await api("/api/skills/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-approval-id": approvalId,
        },
        body: JSON.stringify({ pluginId: entry.id, agentId: targetAgent }),
      });
    }

    if (market.error && sync?.error) {
      setHint(`Plugin installation failed: ${market.error || sync.error}`);
    } else if (market.error && !sync) {
      setHint(`Plugin installation failed: ${market.error}`);
    } else {
      const synced = Array.isArray(sync?.synced) ? sync.synced.length : 0;
      setHint(
        market.error
          ? `Global install noted collisions/already present; synced ${synced} skill path(s) to ${targetAgent}.`
          : `Installed ${entry.name}${targetAgent ? ` and synced skills to ${targetAgent} (${synced} path(s))` : ""}.`,
      );
    }
    setInstalling(null);
    setPluginModal(null);
    await refreshCatalog();
    onAdded?.();
  };

  const openGuide = entry => {
    const action = marketplaceAction(entry);
    setHint(action.url
      ? `${entry.name} requires manual setup. The official guide is opening.`
      : "No reviewed installer is available for this platform.");
    if (action.url) window.open(action.url, "_blank", "noopener,noreferrer");
  };

  const registerOnly = async entry => {
    setHint("");
    const approvalId = await approveAction(
      "agents.add",
      "registry",
      `Register ${entry.name} to Rempeyek Agent OS.`,
    );
    if (!approvalId) return;
    const response = await api("/api/agents/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-approval-id": approvalId,
      },
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
    if (action.kind === "install" || entry.kind === "plugin" || entry.id.includes("hypertaks")) {
      return (
        <Btn variant="primary" onClick={() => install(entry, action.adapterId || "plugin-adapter")}>
          {entry.kind === "plugin" ? "⚡ Install Plugin" : action.label}
        </Btn>
      );
    }
    if (action.kind === "register") {
      return <Btn onClick={() => registerOnly(entry)}>{action.label}</Btn>;
    }
    if (action.kind === "manual") {
      return <Btn onClick={() => openGuide(entry)}>{action.label}</Btn>;
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

      {pluginModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "var(--bg-panel, #121212)", border: "1px solid var(--border, #333)", borderRadius: "12px", padding: "24px", maxWidth: "500px", width: "90%", color: "inherit" }}>
            <h3 style={{ marginTop: 0 }}>Pemasangan Plugin: {pluginModal.name}</h3>
            <p style={{ opacity: 0.8, fontSize: "0.9rem" }}>
              Pilih metode pemasangan plugin Hypertaks / Skill ke AI Agent pengguna:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "16px 0" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="installMode"
                  value="direct"
                  checked={installMode === "direct"}
                  onChange={() => setInstallMode("direct")}
                />
                <strong>1. Direct Install ke Target Agent</strong>
              </label>
              {installMode === "direct" && (
                <div style={{ paddingLeft: "24px" }}>
                  <small style={{ display: "block", marginBottom: "4px" }}>Pilih Agent Target:</small>
                  <select
                    value={targetAgent}
                    onChange={(e) => setTargetAgent(e.target.value)}
                    style={{ width: "100%", padding: "8px", background: "var(--bg-card, #1a1a1a)", border: "1px solid var(--border, #333)", color: "inherit", borderRadius: "6px" }}
                  >
                    {userAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.icon || "🤖"} {a.name} ({a.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="installMode"
                  value="repo"
                  checked={installMode === "repo"}
                  onChange={() => setInstallMode("repo")}
                />
                <strong>2. Repository Download Link / Package</strong>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="installMode"
                  value="copy"
                  checked={installMode === "copy"}
                  onChange={() => setInstallMode("copy")}
                />
                <strong>3. Copy Text Snippet Konfigurasi</strong>
              </label>

              {installMode === "copy" && (
                <div style={{ paddingLeft: "24px" }}>
                  <textarea
                    readOnly
                    rows={8}
                    value={JSON.stringify({
                      plugin: pluginModal.id,
                      name: pluginModal.name,
                      targetAgent: targetAgent || "all",
                      skills: ["hypertaks"],
                      install: {
                        marketplace: `/api/marketplace/${pluginModal.id}/install`,
                        skillsSync: "/api/skills/sync",
                      },
                      config: { enabled: true, autoSync: true },
                    }, null, 2)}
                    style={{ width: "100%", fontFamily: "monospace", fontSize: "0.8rem", background: "#000", color: "#0f0", border: "1px solid #333", borderRadius: "6px", padding: "8px" }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Btn variant="dim" onClick={() => setPluginModal(null)}>Batal</Btn>
              <Btn variant="primary" onClick={handlePluginInstallSubmit}>
                {installMode === "repo" ? "Buka Link Repo" : installMode === "copy" ? "Copy Text Snippet" : "Pasang Plugin"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {installing && (
        <pre className="aa-cat-log" aria-live="polite">
          {tail.length ? tail.join("\n") : "starting installer…"}
        </pre>
      )}
      {hint && <div className="aa-hint err aa-feedback" role="alert">{hint}</div>}
    </>
  );
}