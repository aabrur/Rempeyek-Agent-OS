import { useCallback, useEffect, useRef, useState } from "react";
import { PageHead } from "@rempeyek/ui";
import { ArrowRight, ChevronDown, ChevronUp, FileText, Info, Lock, Pause, Play, Plus, RefreshCw, Square, Workflow, X } from "lucide-react";
import { api } from "../api";
import "./supervisor.css";
import { SupervisorComposer } from "../components/SupervisorComposer";
import { RichText, plainText } from "../components/SupervisorRichText";

const ROLES = ["HEAD", "BODY", "TAIL"];
const ROLE_NAMES = { HEAD: "Plan", BODY: "Implement", TAIL: "Review" };
const TERMINAL = new Set(["COMPLETED", "READY_FOR_QA", "CANCELLED", "FAILED"]);
const endpoint = id => `/api/supervisor/runs/${encodeURIComponent(id)}`;
const readable = value => typeof value === "string" ? value : value == null ? "Unknown" : JSON.stringify(value);
const date = value => value ? new Date(value).toLocaleString() : "Not recorded";
const time = value => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
// Derive a pipeline step state from the units owned by that role.
const roleState = (units, role) => {
  const states = units.filter(unit => unit.role === role).map(unit => String(unit.status || "").toUpperCase());
  if (!states.length) return "PENDING";
  if (states.some(state => state === "FAILED")) return "FAILED";
  if (states.some(state => state === "RUNNING")) return "RUNNING";
  if (states.every(state => state === "COMPLETED" || state === "PASSED")) return "COMPLETED";
  return states[0] || "PENDING";
};
const post = (path, body) => api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), timeoutMs: 120000, maxRetries: 0 });
const supportsRole = (provider, role) => Boolean(provider?.installed
  && (role === "BODY" ? provider.capabilities?.execute : provider.capabilities?.readOnly)
  && (!Array.isArray(provider.capabilities?.roles) || provider.capabilities.roles.includes(role)));
const manualAvailability = value => String(value || "AUTO").toUpperCase() === "UNAVAILABLE" ? "UNAVAILABLE" : "AUTO";

function Status({ value }) {
  const status = String(value || "UNKNOWN").toUpperCase();
  return <span className="sup-status" data-state={status}>{status.replaceAll("_", " ")}</span>;
}

export function SupervisorView() {
  const [providers, setProviders] = useState([]);
  const [config, setConfig] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selected, setSelected] = useState("");
  const [run, setRun] = useState(null);
  const [events, setEvents] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const [objective, setObjective] = useState("");
  const [projectId, setProjectId] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [branch, setBranch] = useState("");
  const [context, setContext] = useState([]);
  const [mode, setMode] = useState("AUTO");
  const [executionMode, setExecutionMode] = useState("review");
  const [maxConcurrency, setMaxConcurrency] = useState(1);
  const [assignments, setAssignments] = useState({ HEAD: "", BODY: "", TAIL: "" });
  const [locks, setLocks] = useState({ HEAD: false, BODY: false, TAIL: false });
  const [executablePaths, setExecutablePaths] = useState({});
  const [reconcile, setReconcile] = useState(false);
  const [replacement, setReplacement] = useState({ role: "BODY", providerId: "" });
  const [composing, setComposing] = useState(true);
  const [openProvider, setOpenProvider] = useState("");
  const [tab, setTab] = useState("units");
  const [openUnits, setOpenUnits] = useState(() => new Set());
  const [fullObjective, setFullObjective] = useState(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const mounted = useRef(false);
  const requestInFlight = useRef(false);

  const refresh = useCallback(async () => {
    const results = await Promise.all([
      api("/api/supervisor/providers"), api("/api/supervisor/config"), api("/api/supervisor/runs"),
    ]);
    if (!mounted.current) return;
    const failures = results.filter(result => result.error).map(result => readable(result.error));
    setError([...new Set(failures)].join("; "));
    if (!results[0].error) setProviders(results[0].providers || []);
    if (!results[1].error) setConfig(results[1]);
    if (!results[2].error) setRuns(results[2].runs || []);
    setLoading(false);
  }, []);

  const refreshDetail = useCallback(async id => {
    if (!id) return;
    const results = await Promise.all([api(endpoint(id)), api(`${endpoint(id)}/events`), api(`${endpoint(id)}/artifacts`)]);
    if (!mounted.current || selectedRef.current !== id) return;
    setDetailError([...new Set(results.filter(result => result.error).map(result => readable(result.error)))].join("; "));
    if (!results[0].error) setRun(results[0].run);
    if (!results[1].error) setEvents(results[1].events || []);
    if (!results[2].error) setArtifacts(results[2].artifacts || []);
  }, []);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let timer;
    const poll = async () => {
      await Promise.all([refresh(), refreshDetail(selectedRef.current)]);
      if (!disposed) timer = setTimeout(poll, 5000);
    };
    poll();
    return () => { disposed = true; mounted.current = false; clearTimeout(timer); };
  }, [refresh, refreshDetail]);

  useEffect(() => {
    setRun(null); setEvents([]); setArtifacts([]); setPreview(null); setReconcile(false); setDetailError("");
    setTab("units"); setOpenUnits(new Set()); setFullObjective(false);
    refreshDetail(selected);
  }, [selected, refreshDetail]);

  async function mutate(key, path, body = {}) {
    if (requestInFlight.current || error) return null;
    requestInFlight.current = true;
    setBusy(key); setActionError("");
    try {
      const result = await post(path, body);
      if (result.error) { setActionError(readable(result.error)); return null; }
      await Promise.all([refresh(), refreshDetail(selectedRef.current)]);
      return result;
    } finally { requestInFlight.current = false; setBusy(""); }
  }

  async function submit(event) {
    event.preventDefault();
    if (!canStart || requestInFlight.current) return;
    const submittedAssignments = Object.fromEntries(ROLES.map(role => {
      const provider = providers.find(item => item.id === assignments[role]);
      return [role, requiredRoles.includes(role) && supportsRole(provider, role) ? assignments[role] : ""];
    }));
    const submittedLocks = Object.fromEntries(ROLES.map(role => [role, requiredRoles.includes(role) && locks[role]]));
    const result = await mutate("create", "/api/supervisor/runs", { objective: objective.trim(), projectId: projectId || undefined,
      repositoryPath: repositoryPath.trim(), branch, context, newWorktree: true, mode, executionMode, assignments: submittedAssignments, locks: submittedLocks, maxConcurrency });
    if (result?.run?.id) { setSelected(result.run.id); setObjective(""); setContext([]); setComposing(false); }
  }

  async function openArtifact(artifact) {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    const id = selected;
    setBusy(`artifact:${artifact.id}`); setActionError("");
    try {
      const result = await api(`${endpoint(id)}/artifacts/${encodeURIComponent(artifact.id)}`);
      if (selectedRef.current === id) {
        if (result.error) setActionError(readable(result.error));
        else setPreview(result);
      }
    } finally { requestInFlight.current = false; setBusy(""); }
  }

  const requiredRoles = executionMode === "single" ? ["BODY"] : ROLES;
  const roleProviders = role => providers.filter(provider => supportsRole(provider, role));
  const providerOptions = role => roleProviders(role).map(provider => <option key={provider.id} value={provider.id}>{provider.name} · {String(provider.availability || "UNKNOWN").toUpperCase()}</option>);
  const roleCanStart = role => {
    const assigned = providers.find(provider => provider.id === assignments[role]);
    if (mode === "MANUAL" || locks[role]) return supportsRole(assigned, role);
    return supportsRole(assigned, role) || roleProviders(role).length > 0;
  };
  const canMutate = !loading && !error && !busy;
  const canStart = canMutate && Boolean(config) && requiredRoles.every(roleCanStart);
  const status = String(run?.status || "").toUpperCase();
  const active = run && !TERMINAL.has(status);
  const needsReconcile = status === "NEEDS_HUMAN";
  const approvalPending = String(run?.approval?.status || "").toUpperCase() === "PENDING";
  const runRoles = run?.executionMode === "single" ? ["BODY"] : ROLES;
  const replacementProvider = providers.find(provider => provider.id === replacement.providerId);
  const units = run?.units || [];
  const providerName = id => providers.find(provider => provider.id === id)?.name || id;
  const toggleUnit = id => setOpenUnits(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const flowLabel = { single: "Single agent", review: "Plan → Implement → Review", parallel: "Parallel units" }[executionMode];
  const shownProvider = providers.find(provider => provider.id === openProvider);
  const recovery = providers.filter(provider => provider.staleProcesses?.length > 0);
  const refreshAll = () => Promise.all([refresh(), refreshDetail(selected)]);
  const previewIsDoc = preview && (/\.(md|markdown|json)$/i.test(preview.artifact?.name || "") || /^\s*(```|[[{])/.test(readable(preview.content)));
  const tabs = [["units", "Work units", units.length], ["activity", "Activity", events.length], ["artifacts", "Artifacts", artifacts.length]];
  const providerConfig = provider => `/api/supervisor/providers/${encodeURIComponent(provider.id)}/config`;

  return <section className="view active supervisor-view">
    <PageHead title="SUPERVISOR"><span className="sup-head-meta">
      <span role="status" className="sup-live" data-state={error ? "down" : loading ? "wait" : "ok"}><i aria-hidden="true" />{error ? "Offline" : loading ? "Connecting…" : "Local · live"}</span>
      <button type="button" className="sup-icon-btn" aria-label="Refresh" title="Refresh" disabled={!!busy} onClick={refreshAll}><RefreshCw size={14} /></button>
    </span></PageHead>
    {error && <div role="alert" className="sup-notice sup-error sup-inline-notice"><span>Supervisor unavailable: {error}. Showing last known data.</span><button type="button" className="btn" disabled={!!busy} onClick={refreshAll}>Retry</button></div>}
    {actionError && <div role="alert" className="sup-notice sup-error">{actionError}</div>}

    <div className="sup-strip" aria-label="Agent providers">
      {providers.map(provider => <button type="button" key={provider.id} className="sup-chip" data-state={String(provider.availability || "UNKNOWN").toUpperCase()} aria-expanded={openProvider === provider.id} title={String(provider.availability || "UNKNOWN")} onClick={() => setOpenProvider(openProvider === provider.id ? "" : provider.id)}>
        <i aria-hidden="true" />{provider.name}<small>{provider.runningJobs ?? "?"}/{provider.concurrency ?? "?"}</small>
      </button>)}
      {config?.limitations?.length > 0 && <button type="button" className="sup-chip sup-chip-ghost" aria-expanded={openProvider === "__limits"} onClick={() => setOpenProvider(openProvider === "__limits" ? "" : "__limits")}><Info size={13} /> Limits</button>}
      {!loading && !error && providers.length === 0 && <span className="sup-muted">No providers detected. Install a supported agent to begin.</span>}
    </div>
    {openProvider === "__limits" && <div className="sup-pop-panel"><ul className="sup-list">{config.limitations.map((limit, index) => <li key={index}>{readable(limit)}</li>)}</ul></div>}
    {shownProvider && <div className="sup-pop-panel" aria-label={`${shownProvider.name} details`}>
      <div className="sup-row"><strong>{shownProvider.name}</strong><Status value={shownProvider.availability} /></div>
      <dl className="sup-facts"><div><dt>Installation</dt><dd>{shownProvider.installed ? "Detected" : "Not found"}</dd></div><div><dt>Authentication</dt><dd>{readable(shownProvider.auth)}</dd></div><div><dt>Quota</dt><dd>{readable(shownProvider.quota?.status || "UNKNOWN")}</dd></div><div><dt>Running</dt><dd>{shownProvider.runningJobs ?? "Unknown"} / {shownProvider.concurrency ?? "Unknown"}</dd></div></dl>
      {shownProvider.diagnostic && <p className="sup-muted">{readable(shownProvider.diagnostic)}</p>}
      {shownProvider.cooldownUntil && <p>Cooldown until {date(shownProvider.cooldownUntil)}</p>}
      {shownProvider.lastFailure && <p className="sup-warning">Last failure: {readable(shownProvider.lastFailure)}</p>}
      <fieldset disabled={!canMutate} className="sup-provider-settings-fieldset"><div className="sup-provider-settings">
        <label>Availability<select aria-label={`${shownProvider.name} availability`} value={manualAvailability(shownProvider.manualAvailability)} onChange={event => mutate(`provider:${shownProvider.id}`, providerConfig(shownProvider), { manualAvailability: event.target.value })}><option value="AUTO">Automatic</option><option value="UNAVAILABLE">Mark unavailable</option></select></label>
        <label>Concurrent jobs<select aria-label={`${shownProvider.name} concurrent jobs`} value={shownProvider.concurrency || 1} onChange={event => mutate(`provider:${shownProvider.id}`, providerConfig(shownProvider), { concurrency: Number(event.target.value) })}>{[1, 2, 3].map(number => <option key={number}>{number}</option>)}</select></label>
        <div className="sup-executable-setting"><label>Executable path<input aria-label={`${shownProvider.name} executable path`} value={executablePaths[shownProvider.id] ?? shownProvider.executablePath ?? ""} onChange={event => setExecutablePaths(previous => ({ ...previous, [shownProvider.id]: event.target.value }))} placeholder="Absolute path to CLI executable" autoComplete="off" spellCheck="false" /></label><button type="button" className="btn" onClick={() => mutate(`executable:${shownProvider.id}`, providerConfig(shownProvider), { executablePath: (executablePaths[shownProvider.id] ?? shownProvider.executablePath ?? "").trim() || null })}>Save path</button></div>
      </div></fieldset>
    </div>}
    {recovery.map(provider => <div role="alert" key={provider.id} className="sup-notice sup-error sup-recovery"><strong>Recovery required · {provider.name}</strong><ul className="sup-list">{provider.staleProcesses.map((process, index) => <li className="sup-recovery-process" key={`${process.pid || "unknown"}:${process.startedAt || index}`}><span>{`PID ${process.pid ?? "unknown"} · Run ${process.runId || "unknown"} · Unit ${process.unitId || "unknown"}`}</span><p>{readable(process.diagnostic || "Previous process ownership cannot be verified. No process was terminated.")}</p></li>)}</ul></div>)}

    {!composing && <button type="button" className="sup-newbar" onClick={() => setComposing(true)}><Plus size={16} /> New task{objective.trim() && <span className="sup-muted">Draft: {objective.trim().slice(0, 90)}</span>}<ChevronDown size={14} className="sup-newbar-chevron" /></button>}
    <form className="sup-card sup-composer" hidden={!composing} onSubmit={submit}><fieldset disabled={!canMutate} className="sup-composer-fields">
      <div className="sup-row"><h2><Workflow size={16} /> New task</h2>{selected && <button type="button" className="sup-icon-btn" aria-label="Collapse new task" title="Collapse" onClick={() => setComposing(false)}><ChevronUp size={16} /></button>}</div>
      <SupervisorComposer objective={objective} setObjective={setObjective} projectId={projectId} setProjectId={setProjectId}
        repositoryPath={repositoryPath} setRepositoryPath={setRepositoryPath} projects={config?.projects || []}
        branch={branch} setBranch={setBranch} context={context} setContext={setContext} canStart={canStart} busy={busy}
        assignment={mode === "AUTO" ? "Auto assignment" : "Manual assignment"} />
      <details className="sup-advanced">
        <summary><span>Advanced</span><span className="sup-muted">{mode === "AUTO" ? "Auto" : "Manual"} · {flowLabel} · {maxConcurrency} job{maxConcurrency > 1 ? "s" : ""}</span><ChevronDown size={14} className="sup-advanced-chevron" /></summary>
        <div className="sup-advanced-body">
          <div className="sup-segment" role="radiogroup" aria-label="Workflow">{[["single", "Single agent"], ["review", "With review"], ["parallel", "Parallel"]].map(([value, label]) => <label key={value} className={executionMode === value ? "is-on" : ""}><input type="radio" name="sup-workflow" value={value} checked={executionMode === value} onChange={() => setExecutionMode(value)} />{label}</label>)}</div>
          <label className="sup-inline-field">Assignment<select value={mode} onChange={event => setMode(event.target.value)}><option value="AUTO">Automatic</option><option value="MANUAL">Manual</option></select></label>
          <label className="sup-inline-field">Parallel jobs<select value={maxConcurrency} onChange={event => setMaxConcurrency(Number(event.target.value))}>{[1, 2, 3].filter(number => number <= (config?.maxConcurrency || 3)).map(number => <option key={number}>{number}</option>)}</select></label>
        </div>
        <div className="sup-role-list">{requiredRoles.map(role => <div className="sup-role" key={role}>
          <span className="sup-role-name">{role}<small>{ROLE_NAMES[role]}</small></span>
          <select aria-label={`${role} provider`} value={assignments[role]} required={mode === "MANUAL" || locks[role]} onChange={event => setAssignments(previous => ({ ...previous, [role]: event.target.value }))}><option value="">Select automatically</option>{providerOptions(role)}</select>
          <label className="sup-check"><input type="checkbox" checked={locks[role]} onChange={event => setLocks(previous => ({ ...previous, [role]: event.target.checked }))} /> Lock</label>
        </div>)}</div>
        <p className="sup-muted">Unlocked roles can switch when a provider becomes unavailable. Unknown quota is not a guarantee of capacity.</p>
      </details>
    </fieldset></form>

    <div className="sup-workspace">
      <section className="sup-card sup-runs"><h2>History <span className="sup-muted">{runs.length}</span></h2>
        {runs.length === 0 ? <p className="sup-muted">No tasks yet.</p> : <div className="sup-run-list">{runs.map(item => <button type="button" key={item.id} className={`sup-run-item ${selected === item.id ? "is-selected" : ""}`} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setComposing(false); }}>
          <span className="sup-run-top"><Status value={item.status} /><small>{date(item.updatedAt || item.createdAt)}</small></span>
          <strong>{item.objective}</strong>
          <small>{item.phase || "Waiting"}</small>
        </button>)}</div>}
      </section>
      <section className="sup-card sup-detail" aria-label="Selected task">
        {detailError && <p role="alert" className="sup-notice sup-error">{detailError}. Task controls are disabled until refreshed.</p>}
        {!selected ? <div className="sup-empty"><Workflow size={24} /><h2>Select a task</h2><p>Work units, decisions, and results appear here.</p></div> : !run ? <p role="status" className="sup-muted">Loading task…</p> : <>
          <header className="sup-detail-head">
            <div className="sup-detail-title">
              <h2 className={fullObjective ? "" : "is-clamped"}>{run.objective}</h2>
              {(run.objective || "").length > 180 && <button type="button" className="sup-link" onClick={() => setFullObjective(value => !value)}>{fullObjective ? "Show less" : "Show more"}</button>}
              <p className="sup-meta" title={`${run.repositoryPath} · ${run.sourceBranch || "HEAD"}`}>{run.phase || "Waiting"} · {date(run.updatedAt)} · <span className="sup-path">{run.repositoryPath} · {run.sourceBranch || "HEAD"}</span></p>
            </div>
            <div className="sup-detail-actions">
              <Status value={run.status} />
              {active && <fieldset disabled={!canMutate || !!detailError} className="sup-controls"><legend className="sr-only">Task controls</legend>
                {!run.paused && status !== "PAUSED" && !needsReconcile ? <button type="button" className="btn" onClick={() => mutate("pause", `${endpoint(run.id)}/pause`)}><Pause size={14} /> Pause</button> : <button type="button" className="btn" disabled={needsReconcile && !reconcile} onClick={() => mutate("resume", `${endpoint(run.id)}/resume`, { reconcile })}><Play size={14} /> Resume</button>}
                <button type="button" className="btn" onClick={() => mutate("cancel", `${endpoint(run.id)}/cancel`)}><Square size={14} /> Cancel</button>
              </fieldset>}
            </div>
          </header>
          {active && needsReconcile && <label className="sup-check sup-notice"><input type="checkbox" disabled={!canMutate || !!detailError} checked={reconcile} onChange={event => setReconcile(event.target.checked)} /> I reviewed the interrupted work and confirm it is safe to resume.</label>}
          {run.context?.length > 0 && <div className="sup-context-history" aria-label="Task references">{run.context.map((item, index) => <span key={index}><FileText size={13} /> {item.name} <small>{item.kind}{item.truncated ? " · text excerpt" : ""}</small></span>)}</div>}
          {run.error && <div className="sup-notice sup-error"><RichText value={run.error} /></div>}
          {run.nextAction && <div className="sup-notice"><strong>Next action</strong><RichText value={run.nextAction} /></div>}
          {approvalPending && active && <section className="sup-notice"><h3>Approval required</h3><RichText value={run.approval.consequence} /><fieldset disabled={!canMutate || !!detailError} className="sup-actions"><legend className="sr-only">Execution approval</legend><button type="button" className="btn btn-primary" onClick={() => mutate("approve", `${endpoint(run.id)}/approval`, { decision: "approved" })}>Approve</button><button type="button" className="btn" onClick={() => mutate("reject", `${endpoint(run.id)}/approval`, { decision: "rejected" })}>Reject</button></fieldset></section>}

          <ol className="sup-pipeline" aria-label="Pipeline">{runRoles.map(role => {
            const state = roleState(units, role);
            const assigned = run.assignments?.[role];
            return <li key={role} data-state={state} title={`${role} · ${state.replaceAll("_", " ")}`}>
              <span className="sup-step-dot" aria-hidden="true" />
              <span className="sup-step-text"><small>{ROLE_NAMES[role]}{run.locks?.[role] && <Lock size={10} aria-label="Locked" />}<span className="sr-only"> {state}</span></small><strong>{assigned ? providerName(assigned) : "Unassigned"}</strong></span>
            </li>;
          })}</ol>
          {active && <details className="sup-reassign-details"><summary>Switch a role to another provider</summary><fieldset disabled={!canMutate || !!detailError} className="sup-reassign-fieldset"><div className="sup-reassign"><label>Role<select value={replacement.role} onChange={event => setReplacement({ role: event.target.value, providerId: "" })}>{runRoles.map(role => <option key={role}>{role}</option>)}</select></label><label>Provider<select value={replacement.providerId} onChange={event => setReplacement(previous => ({ ...previous, providerId: event.target.value }))}><option value="">Choose provider</option>{providerOptions(replacement.role)}</select></label><button type="button" className="btn" disabled={!replacement.providerId || !supportsRole(replacementProvider, replacement.role)} onClick={() => mutate("reassign", `${endpoint(run.id)}/reassign`, replacement)}>Switch <ArrowRight size={14} /></button></div></fieldset>{run.locks?.[replacement.role] && <p className="sup-warning">Your manual switch changes this assignment. The role stays locked against automatic switching.</p>}</details>}

          <div className="sup-tabs" role="tablist" aria-label="Task sections">
            {tabs.map(([key, label, count]) => <button key={key} type="button" role="tab" id={`sup-tab-${key}`} aria-controls="sup-tabpanel" aria-selected={tab === key} className={tab === key ? "is-on" : ""} onClick={() => setTab(key)}>{label}<small>{count}</small></button>)}
            <span className="sup-tabs-meta">Verification <Status value={run.verification?.status || "NOT_RUN"} /></span>
          </div>
          <div role="tabpanel" id="sup-tabpanel" aria-labelledby={`sup-tab-${tab}`} className="sup-tabpanel">
            {tab === "units" && <>
              {run.conflicts?.length > 0 && <section className="sup-notice sup-warning"><h3>Integration conflicts</h3><ul className="sup-list">{run.conflicts.map((conflict, index) => <li key={index}>{readable(conflict)}</li>)}</ul></section>}
              {!units.length && <p className="sup-muted">Work units will appear when the plan is ready.</p>}
              {units.map(unit => {
                const open = openUnits.has(unit.id);
                const summaryLine = unit.result?.summary ? plainText(unit.result.summary) : "";
                return <article className="sup-unit" key={unit.id} data-open={open}>
                  <button type="button" className="sup-unit-head" aria-expanded={open} onClick={() => toggleUnit(unit.id)}>
                    <Status value={unit.status} />
                    <span className="sup-unit-title"><strong>{unit.objective || unit.id}</strong><small>{unit.role} · {unit.providerId ? providerName(unit.providerId) : "Unassigned"}{!open && summaryLine ? ` · ${summaryLine}` : ""}</small></span>
                    <ChevronDown size={14} className="sup-chevron" />
                  </button>
                  {open && <div className="sup-unit-body">
                    {(unit.dependencies?.length > 0 || unit.ownedPaths?.length > 0 || unit.worktreePath) && <dl className="sup-unit-facts">
                      {unit.dependencies?.length > 0 && <div><dt>Depends on</dt><dd>{unit.dependencies.join(", ")}</dd></div>}
                      {unit.ownedPaths?.length > 0 && <div><dt>Scope</dt><dd className="sup-path">{unit.ownedPaths.join(", ")}</dd></div>}
                      {unit.worktreePath && <div><dt>Worktree</dt><dd className="sup-path">{unit.worktreePath}</dd></div>}
                    </dl>}
                    {unit.result && <>
                      <RichText value={unit.result.summary} />
                      <p className="sup-meta">Verification <Status value={unit.result.verification?.status || "NOT_RUN"} /></p>
                      {unit.result.filesChanged?.length > 0 && <details><summary>Changed files ({unit.result.filesChanged.length})</summary><ul className="sup-list">{unit.result.filesChanged.map((file, index) => <li key={index} className="sup-path">{readable(file)}</li>)}</ul></details>}
                      {unit.result.reviewFindings?.length > 0 && <div className="sup-findings"><h5>Review findings</h5><ul className="sup-list">{unit.result.reviewFindings.map((finding, index) => <li key={index}><RichText value={finding} /></li>)}</ul></div>}
                    </>}
                  </div>}
                </article>;
              })}
            </>}
            {tab === "activity" && (events.length ? <ol className="sup-events">{events.slice(-150).reverse().map((event, index) => {
              const message = plainText(event.message);
              return <li key={event.id || `${event.at}:${index}`}><time dateTime={event.at} title={date(event.at)}>{time(event.at)}</time><strong>{String(event.type || "Event").replaceAll("_", " ")}</strong><span title={message}>{message}</span></li>;
            })}</ol> : <p className="sup-muted">Waiting for the first event.</p>)}
            {tab === "artifacts" && <>
              {artifacts.length ? <div className="sup-artifacts">{artifacts.map(artifact => <button type="button" className="btn" key={artifact.id} disabled={!!busy} onClick={() => openArtifact(artifact)}><FileText size={14} />{artifact.name || artifact.kind || artifact.id}</button>)}</div> : <p className="sup-muted">No artifacts recorded yet.</p>}
              {preview && <section className="sup-preview" aria-labelledby="sup-preview-title"><div className="sup-row"><h4 id="sup-preview-title">{preview.artifact?.name || "Artifact preview"}</h4><button type="button" className="sup-icon-btn" aria-label="Close artifact preview" onClick={() => setPreview(null)}><X size={14} /></button></div>{previewIsDoc ? <RichText value={preview.content} /> : <pre>{readable(preview.content)}</pre>}</section>}
            </>}
          </div>
        </>}
      </section>
    </div>
  </section>;
}
