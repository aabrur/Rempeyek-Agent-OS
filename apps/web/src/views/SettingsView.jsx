import { useEffect, useState } from "react";
import { PageHead, Panel } from "@rempeyek/ui";
import { THEMES } from "@rempeyek/theme-engine";
import { api } from "../api";
import { ThemePicker } from "../components/ThemePicker";

/** Settings — appearance (the four structural themes), software version, workspace facts. */
export function SettingsView({ theme, onTheme, state }) {
  const [version, setVersion] = useState(null);
  useEffect(() => {
    let alive = true;
    api("/api/version").then(v => { if (alive && v && !v.error) setVersion(v); });
    return () => { alive = false; };
  }, []);

  const active = THEMES.find(t => t.id === theme);

  return (
    <section className="view active">
      <PageHead title="SETTINGS">
        Appearance, software version, and workspace facts. Everything else lives in <code>agents.config.json</code>.
      </PageHead>

      <div className="view-stack">
        <Panel title="APPEARANCE" chip="4 structural themes">
          <div className="settings-themes">
            <ThemePicker theme={theme} onPick={onTheme} />
          </div>
          <p className="settings-note">
            {active ? `${active.name} — ${active.description}.` : ""} Minimalist and Brutalist switch off glow,
            stars, and particles by design; the system “reduce motion” preference is always respected.
          </p>
        </Panel>

        <Panel title="SOFTWARE" chip="auto-update">
          <div className="settings-facts">
            <div><span>VERSION</span><b>{version?.version ? `v${version.version}` : "—"}</b></div>
            <div><span>REVISION</span><b>{version?.rev || "—"}</b></div>
            <div><span>REPOSITORY</span><b>{version?.repo
              ? <a href={`https://github.com/${version.repo}/releases`} target="_blank" rel="noopener noreferrer">{version.repo}</a>
              : "no remote configured"}</b></div>
          </div>
          <p className="settings-note">
            When GitHub publishes a newer release, an update banner appears at the top of the app —
            updating runs <code>git pull --ff-only && npm install && npm run build</code> behind an approval.
          </p>
        </Panel>

        <Panel title="WORKSPACE" chip="read-only">
          <div className="settings-facts">
            <div><span>AGENCY</span><b>{state.agency || "REMPEYEK AGENT OS"}</b></div>
            <div><span>NEURAL VAULT</span><b title={state.vault || ""}>{state.vault || "set VAULT_PATH"}</b></div>
            <div><span>AGENTS</span><b>{state.agents?.length ?? 0} registered</b></div>
            <div><span>ACCESS</span><b>{state.auth === "token-locked" ? "TOKEN" : "LOCAL"}</b></div>
          </div>
        </Panel>
      </div>
    </section>
  );
}
