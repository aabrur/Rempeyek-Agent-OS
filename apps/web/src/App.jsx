import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TokenLogin } from "./components/TokenLogin";
import { ConfigBanner } from "./components/Panels";
import { CommandCenter } from "./views/CommandCenter";
import { AgentsView } from "./views/AgentsView";
import { NeuralVaultView, ReportsView } from "./views/SimpleViews";
import { WorkspaceView } from "./views/Workspace";
import { useDashboard, useOps } from "./hooks/useDashboard";
import { useTheme } from "./hooks/useTheme";
import { useGateway } from "./hooks/useGateway";
import { setUnauthorizedHandler } from "./api";

export default function App() {
  const [view, setView] = useState("workspace");   // front door: projects, not plumbing
  const [openAgent, setOpenAgent] = useState(null);
  const [locked, setLocked] = useState(false);

  const { state, error, refresh, load } = useDashboard();
  const ops = useOps(view === "command");
  const { theme, accent, setTheme } = useTheme();

  useEffect(() => { setUnauthorizedHandler(() => setLocked(true)); }, []);

  const agentsById = useMemo(() => {
    const m = {};
    state?.agents?.forEach(a => { m[a.id] = a; });
    return m;
  }, [state]);

  const gw = useGateway(agentsById, refresh);

  useEffect(() => {
    if (state?.agency) document.title = `${state.agency} — Neural Command Deck`;
  }, [state?.agency]);

  /** Clicking an agent anywhere jumps to its detail panel. */
  const openAgentDetail = useCallback(id => {
    setOpenAgent(id);
    if (id) setView("agents");
  }, []);

  const signedIn = () => { setLocked(false); refresh(); };

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      <div className="shell">
        <Sidebar
          view={view}
          onView={setView}
          agents={state?.agents || []}
          agency={state?.agency}
          vault={state?.vault}
          theme={theme}
          onTheme={setTheme}
          onOpenAgent={openAgentDetail}
        />

        <main className="main" id="main-content" tabIndex="-1">
          <ConfigBanner configError={state?.configError} stateError={error} />

          {!state ? (
            <section className="app-state" role="status" aria-live="polite">
              <div className="skeleton-block" aria-hidden="true" />
              <h1>{error ? "Workspace unavailable" : "Opening your workspace"}</h1>
              <p>{error ? "Rempeyek could not reach the local service. Your Vault remains untouched." : "Reading projects, recent activity, and the next useful action…"}</p>
              {error && <button className="btn btn-primary" onClick={refresh}>Try again</button>}
            </section>
          ) : view === "command" ? (
            <CommandCenter
              state={state} accent={accent} load={load} agentsById={agentsById}
              gw={gw} ops={ops} openAgent={openAgent}
              onOpenAgent={openAgentDetail} refresh={refresh}
            />
          ) : view === "agents" ? (
            <AgentsView
              agents={state.agents} gw={gw} openAgent={openAgent}
              onOpenAgent={setOpenAgent} refresh={refresh}
            />
          ) : view === "graph" ? (
            <NeuralVaultView active theme={theme} />
          ) : view === "reports" ? (
            <ReportsView accent={accent} />
          ) : (
            <WorkspaceView projects={state.projects} agents={state.agents} agentsById={agentsById} refresh={refresh} />
          )}
        </main>
      </div>

      <TokenLogin open={locked} onSignedIn={signedIn} />
    </>
  );
}
