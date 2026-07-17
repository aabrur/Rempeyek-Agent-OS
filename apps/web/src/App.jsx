import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { VortexBackdrop } from "./components/VortexBackdrop";
import { TokenLogin } from "./components/TokenLogin";
import { ConfigBanner } from "./components/Panels";
import { UpdateBanner } from "./components/UpdateBanner";
import { AgentsView } from "./views/AgentsView";
import { NeuralVaultView } from "./views/SimpleViews";
import { WorkspaceView } from "./views/Workspace";
import { ProtocolsView } from "./views/ProtocolsView";
import { MarketplaceView } from "./views/MarketplaceView";
import { ObservatoryView } from "./views/ObservatoryView";
import { SettingsView } from "./views/SettingsView";
import { useDashboard, useOps } from "./hooks/useDashboard";
import { useTheme } from "./hooks/useTheme";
import { useGateway } from "./hooks/useGateway";
import { setUnauthorizedHandler } from "./api";

const AgentMapView = lazy(() => import("./views/AgentMapView").then(module => ({ default: module.AgentMapView })));

export default function App() {
  const [view, setView] = useState("map");   // front door: the Agent Map cosmos
  const [openAgent, setOpenAgent] = useState(null);
  const [locked, setLocked] = useState(false);

  const { state, error, refresh, load } = useDashboard();
  const ops = useOps(view === "protocols" || view === "observatory");
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
      <VortexBackdrop />
      <div className="shell">
        <Sidebar
          view={view}
          onView={setView}
          agents={state?.agents || []}
          agency={state?.agency}
          vault={state?.vault}
        />

        <main className={`main${view === "map" && state ? " main-flush" : ""}`} id="main-content" tabIndex="-1">
          <ConfigBanner configError={state?.configError} stateError={error} />
          <UpdateBanner />

          {!state ? (
            <section className="app-state" role="status" aria-live="polite">
              <div className="skeleton-block" aria-hidden="true" />
              <h1>{error ? "Workspace unavailable" : "Opening your workspace"}</h1>
              <p>{error ? "Rempeyek could not reach the local service. Your Vault remains untouched." : "Reading projects, recent activity, and the next useful action…"}</p>
              {error && <button className="btn btn-primary" onClick={refresh}>Try again</button>}
            </section>
          ) : view === "map" ? (
            <Suspense fallback={<div className="cosmos-view" role="status"><div className="skeleton-block" style={{ margin: 24, flex: 1 }} /><span className="sr-only">Loading Agent Map…</span></div>}>
              <AgentMapView state={state} load={load} onOpenAgent={openAgentDetail} onView={setView} />
            </Suspense>
          ) : view === "agents" ? (
            <AgentsView
              agents={state.agents} gw={gw} openAgent={openAgent}
              onOpenAgent={setOpenAgent} refresh={refresh}
            />
          ) : view === "teams" ? (
            <WorkspaceView projects={state.projects} agents={state.agents} agentsById={agentsById} refresh={refresh} />
          ) : view === "memory" ? (
            <NeuralVaultView active theme={theme} />
          ) : view === "protocols" ? (
            <ProtocolsView state={state} ops={ops} refresh={refresh} />
          ) : view === "marketplace" ? (
            <MarketplaceView refresh={refresh} />
          ) : view === "observatory" ? (
            <ObservatoryView state={state} accent={accent} ops={ops} />
          ) : view === "settings" ? (
            <SettingsView theme={theme} onTheme={setTheme} state={state} />
          ) : (
            <WorkspaceView projects={state.projects} agents={state.agents} agentsById={agentsById} refresh={refresh} />
          )}
        </main>
      </div>

      <TokenLogin open={locked} onSignedIn={signedIn} />
    </>
  );
}
