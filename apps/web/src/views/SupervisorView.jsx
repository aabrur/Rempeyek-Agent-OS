import { useCallback, useEffect, useRef, useState } from "react";
import { PageHead } from "@rempeyek/ui";
import { ArrowRight, FileText, Pause, Play, RefreshCw, Square, Workflow } from "lucide-react";
import { api } from "../api";
import "./supervisor.css";
import { SupervisorComposer } from "../components/SupervisorComposer";

const ROLES = ["HEAD", "BODY", "TAIL"];
const ROLE_NAMES = { HEAD: "Plan", BODY: "Implement", TAIL: "Review" };
const TERMINAL = new Set(["COMPLETED", "READY_FOR_QA", "CANCELLED", "FAILED"]);
const endpoint = id => `/api/supervisor/runs/${encodeURIComponent(id)}`;
const readable = value => typeof value === "string" ? value : value == null ? "Unknown" : JSON.stringify(value);
const date = value => value ? new Date(value).toLocaleString() : "Not recorded";
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
    setError(failures.join("; "));
    if (!results[0].error) setProviders(results[0].providers || []);
    if (!results[1].error) setConfig(results[1]);
    if (!results[2].error) setRuns(results[2].runs || []);
    setLoading(false);
  }, []);

  const refreshDetail = useCallback(async id => {
    if (!id) return;
    const results = await Promise.all([api(endpoint(id)), api(`${endpoint(id)}/events`), api(`${endpoint(id)}/artifacts`)]);
    if (!mounted.current || selectedRef.current !== id) return;
    setDetailError(results.filter(result => result.error).map(result => readable(result.error)).join("; "));
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
    if (result?.run?.id) { setSelected(result.run.id); setObjective(""); setContext([]); }
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

  return <section className="view active supervisor-view">
    <PageHead title="SUPERVISOR">Give your agents a task. Follow the plan, execution, and review in one place.</PageHead>
    <div className="sup-toolbar"><span className="sup-muted">Local execution · updates every 5 seconds</span><button className="btn" disabled={!!busy} onClick={() => Promise.all([refresh(), refreshDetail(selected)])}><RefreshCw size={14} /> Refresh</button></div>
    {loading && <p role="status" className="sup-notice">Connecting to Supervisor…</p>}
    {error && <div role="alert" className="sup-notice sup-error">Supervisor data unavailable: {error}. Previously loaded data may be stale.</div>}
    {actionError && <div role="alert" className="sup-notice sup-error">{actionError}</div>}
    <div className="sup-provider-grid" aria-label="Agent providers">
      {providers.map(provider => <section className="sup-card sup-provider" key={provider.id}>
        <div className="sup-row"><h2>{provider.name}</h2><Status value={provider.availability} /></div>
        <dl className="sup-facts"><div><dt>Installation</dt><dd>{provider.installed ? "Detected" : "Not found"}</dd></div><div><dt>Authentication</dt><dd>{readable(provider.auth)}</dd></div><div><dt>Quota</dt><dd>{readable(provider.quota?.status || "UNKNOWN")}</dd></div><div><dt>Running</dt><dd>{provider.runningJobs ?? "Unknown"} / {provider.concurrency ?? "Unknown"}</dd></div></dl>
        {provider.diagnostic && <p className="sup-muted">{readable(provider.diagnostic)}</p>}
        {provider.cooldownUntil && <p>Cooldown until {date(provider.cooldownUntil)}</p>}
        {provider.lastFailure && <p className="sup-warning">Last failure: {readable(provider.lastFailure)}</p>}
        {provider.staleProcesses?.length > 0 && <div role="alert" className="sup-notice sup-error sup-recovery"><strong>Recovery required</strong><ul className="sup-list">{provider.staleProcesses.map((process, index) => <li className="sup-recovery-process" key={`${process.pid || "unknown"}:${process.startedAt || index}`}><span>{`PID ${process.pid ?? "unknown"} · Run ${process.runId || "unknown"} · Unit ${process.unitId || "unknown"}`}</span><p>{readable(process.diagnostic || "Previous process ownership cannot be verified. No process was terminated.")}</p></li>)}</ul></div>}
        <details><summary>Provider settings</summary><fieldset disabled={!canMutate} className="sup-provider-settings-fieldset"><div className="sup-provider-settings">
          <label>Availability<select aria-label={`${provider.name} availability`} value={manualAvailability(provider.manualAvailability)} onChange={event => mutate(`provider:${provider.id}`, `/api/supervisor/providers/${encodeURIComponent(provider.id)}/config`, { manualAvailability: event.target.value })}><option value="AUTO">Automatic</option><option value="UNAVAILABLE">Mark unavailable</option></select></label>
          <label>Concurrent jobs<select aria-label={`${provider.name} concurrent jobs`} value={provider.concurrency || 1} onChange={event => mutate(`provider:${provider.id}`, `/api/supervisor/providers/${encodeURIComponent(provider.id)}/config`, { concurrency: Number(event.target.value) })}>{[1, 2, 3].map(number => <option key={number}>{number}</option>)}</select></label>
          <div className="sup-executable-setting"><label>Executable path<input aria-label={`${provider.name} executable path`} value={executablePaths[provider.id] ?? provider.executablePath ?? ""} onChange={event => setExecutablePaths(previous => ({ ...previous, [provider.id]: event.target.value }))} placeholder="Absolute path to CLI executable" autoComplete="off" spellCheck="false" /></label><button type="button" className="btn" onClick={() => mutate(`executable:${provider.id}`, `/api/supervisor/providers/${encodeURIComponent(provider.id)}/config`, { executablePath: (executablePaths[provider.id] ?? provider.executablePath ?? "").trim() || null })}>Save path</button></div>
        </div></fieldset></details>
      </section>)}
      {!loading && !error && providers.length === 0 && <p className="sup-notice">No providers detected. Install a supported agent to begin.</p>}
    </div>
    {config?.limitations?.length > 0 && <details className="sup-card"><summary>Current execution limits</summary><ul className="sup-list">{config.limitations.map((limit, index) => <li key={index}>{readable(limit)}</li>)}</ul></details>}
    <form className="sup-card sup-composer" onSubmit={submit}><fieldset disabled={!canMutate} className="sup-composer-fields">
      <div className="sup-row"><h2><Workflow size={17} /> New task</h2><span className="sup-muted">{executionMode === "single" ? "Single agent" : "Plan → implement → review"}</span></div>
      <SupervisorComposer objective={objective} setObjective={setObjective} projectId={projectId} setProjectId={setProjectId}
        repositoryPath={repositoryPath} setRepositoryPath={setRepositoryPath} projects={config?.projects || []}
        branch={branch} setBranch={setBranch} context={context} setContext={setContext} canStart={canStart} busy={busy}
        assignment={mode === "AUTO" ? "Auto assignment" : "Manual assignment"} />
      <div className="sup-form-grid sup-three"><label>Assignment<select value={mode} onChange={event => setMode(event.target.value)}><option value="AUTO">Automatic</option><option value="MANUAL">Manual</option></select></label><label>Workflow<select value={executionMode} onChange={event => setExecutionMode(event.target.value)}><option value="single">Single agent</option><option value="review">Implementation with review</option><option value="parallel">Parallel work units</option></select></label><label>Maximum parallel jobs<select value={maxConcurrency} onChange={event => setMaxConcurrency(Number(event.target.value))}>{[1, 2, 3].filter(number => number <= (config?.maxConcurrency || 3)).map(number => <option key={number}>{number}</option>)}</select></label></div>
      <div className="sup-role-grid">{requiredRoles.map(role => <div className="sup-role" key={role}><label><span>{role} <small>{ROLE_NAMES[role]}</small></span><select value={assignments[role]} required={mode === "MANUAL" || locks[role]} onChange={event => setAssignments(previous => ({ ...previous, [role]: event.target.value }))}><option value="">Select automatically</option>{providerOptions(role)}</select></label><label className="sup-check"><input type="checkbox" checked={locks[role]} onChange={event => setLocks(previous => ({ ...previous, [role]: event.target.checked }))} /> Lock provider</label></div>)}</div>
      <div className="sup-row"><p className="sup-muted">Unlocked roles can switch when a provider becomes unavailable. Unknown quota is not a guarantee of capacity.</p></div>
    </fieldset></form>
    <div className="sup-workspace">
      <section className="sup-card sup-runs"><h2>Task history <span className="sup-muted">{runs.length}</span></h2>{runs.length === 0 ? <p className="sup-empty">No tasks yet. Submit an objective above to begin.</p> : <div className="sup-run-list">{runs.map(item => <button type="button" key={item.id} className={`sup-run-item ${selected === item.id ? "is-selected" : ""}`} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}><Status value={item.status} /><strong>{item.objective}</strong><small>{date(item.updatedAt || item.createdAt)}</small><span>{item.phase || "Waiting"}</span></button>)}</div>}</section>
      <section className="sup-card sup-detail" aria-label="Selected task">
        {detailError && <p role="alert" className="sup-notice sup-error">{detailError}. Task controls are disabled until refreshed.</p>}
        {!selected ? <div className="sup-empty"><Workflow size={28} /><h2>Select a task</h2><p>Work units, decisions, and results appear here.</p></div> : !run ? <p role="status">Loading task…</p> : <>
          <div className="sup-row"><h2>{run.objective}</h2><Status value={run.status} /></div>
          <p className="sup-muted">{run.phase || "Waiting"} · Updated {date(run.updatedAt)}</p>
          <p className="sup-path">{run.repositoryPath} · {run.sourceBranch || "HEAD"}</p>
          {run.context?.length > 0 && <div className="sup-context-history" aria-label="Task references">{run.context.map((item, index) => <span key={index}><FileText size={13} /> {item.name} <small>{item.kind}{item.truncated ? " · text excerpt" : ""}</small></span>)}</div>}
          {run.error && <p className="sup-notice sup-error">{readable(run.error)}</p>}
          {run.nextAction && <p className="sup-notice"><strong>Next action:</strong> {readable(run.nextAction)}</p>}
          {active && <fieldset disabled={!canMutate || !!detailError} className="sup-controls"><legend className="sr-only">Task controls</legend>
            {!run.paused && status !== "PAUSED" && !needsReconcile ? <button type="button" className="btn" onClick={() => mutate("pause", `${endpoint(run.id)}/pause`)}><Pause size={14} /> Pause</button> : <button type="button" className="btn" disabled={needsReconcile && !reconcile} onClick={() => mutate("resume", `${endpoint(run.id)}/resume`, { reconcile })}><Play size={14} /> Resume</button>}
            <button type="button" className="btn" onClick={() => mutate("cancel", `${endpoint(run.id)}/cancel`)}><Square size={14} /> Cancel task</button>
            {needsReconcile && <label className="sup-check"><input type="checkbox" checked={reconcile} onChange={event => setReconcile(event.target.checked)} /> I reviewed the interrupted work and confirm it is safe to resume.</label>}
          </fieldset>}
          {approvalPending && active && <section className="sup-notice"><h3>Approval required</h3><p>{readable(run.approval.consequence)}</p><fieldset disabled={!canMutate || !!detailError} className="sup-actions"><legend className="sr-only">Execution approval</legend><button type="button" className="btn btn-primary" onClick={() => mutate("approve", `${endpoint(run.id)}/approval`, { decision: "approved" })}>Approve</button><button type="button" className="btn" onClick={() => mutate("reject", `${endpoint(run.id)}/approval`, { decision: "rejected" })}>Reject</button></fieldset></section>}
          <div className="sup-role-summary">{runRoles.map(role => <div key={role}><small>{role} · {ROLE_NAMES[role]}</small><strong>{providers.find(provider => provider.id === run.assignments?.[role])?.name || run.assignments?.[role] || "Unassigned"}</strong><span className="sup-muted">{run.locks?.[role] ? "Locked" : "Switching allowed"}</span></div>)}</div>
          {active && <details><summary>Switch a role to another provider</summary><fieldset disabled={!canMutate || !!detailError} className="sup-reassign-fieldset"><div className="sup-reassign"><label>Role<select value={replacement.role} onChange={event => setReplacement({ role: event.target.value, providerId: "" })}>{runRoles.map(role => <option key={role}>{role}</option>)}</select></label><label>Provider<select value={replacement.providerId} onChange={event => setReplacement(previous => ({ ...previous, providerId: event.target.value }))}><option value="">Choose provider</option>{providerOptions(replacement.role)}</select></label><button type="button" className="btn" disabled={!replacement.providerId || !supportsRole(replacementProvider, replacement.role)} onClick={() => mutate("reassign", `${endpoint(run.id)}/reassign`, replacement)}>Switch <ArrowRight size={14} /></button></div></fieldset>{run.locks?.[replacement.role] && <p className="sup-warning">Your manual switch changes this assignment. The role stays locked against automatic switching.</p>}</details>}
          <h3>Work units</h3>
          {!(run.units?.length) && <p className="sup-muted">Work units will appear when the plan is ready.</p>}
          {(run.units || []).map(unit => <article className="sup-unit" key={unit.id}><div className="sup-row"><h4>{unit.objective || unit.id}</h4><Status value={unit.status} /></div><p className="sup-muted">{unit.role} · {unit.providerId || "Unassigned"}</p>{unit.dependencies?.length > 0 && <p>Depends on: {unit.dependencies.join(", ")}</p>}{unit.ownedPaths?.length > 0 && <p>Scope: {unit.ownedPaths.join(", ")}</p>}{unit.worktreePath && <p className="sup-path">{unit.worktreePath}</p>}{unit.result && <><p className="sup-result">{readable(unit.result.summary)}</p><p>Verification: <Status value={unit.result.verification?.status || "NOT_RUN"} /></p>{unit.result.filesChanged?.length > 0 && <details><summary>Changed files ({unit.result.filesChanged.length})</summary><ul className="sup-list">{unit.result.filesChanged.map((file, index) => <li key={index} className="sup-path">{readable(file)}</li>)}</ul></details>}{unit.result.reviewFindings?.length > 0 && <details open><summary>Review findings</summary><ul className="sup-list">{unit.result.reviewFindings.map((finding, index) => <li key={index}>{readable(finding)}</li>)}</ul></details>}</>}</article>)}
          {run.conflicts?.length > 0 && <section className="sup-notice sup-warning"><h3>Integration conflicts</h3><ul className="sup-list">{run.conflicts.map((conflict, index) => <li key={index}>{readable(conflict)}</li>)}</ul></section>}
          <h3>Artifacts</h3>{artifacts.length ? <div className="sup-artifacts">{artifacts.map(artifact => <button type="button" className="btn" key={artifact.id} disabled={!!busy} onClick={() => openArtifact(artifact)}><FileText size={14} />{artifact.name || artifact.kind || artifact.id}</button>)}</div> : <p className="sup-muted">No artifacts recorded yet.</p>}
          {preview && <section className="sup-preview" aria-labelledby="sup-preview-title"><div className="sup-row"><h4 id="sup-preview-title">{preview.artifact?.name || "Artifact preview"}</h4><button type="button" className="btn" aria-label="Close artifact preview" onClick={() => setPreview(null)}>Close</button></div><pre>{readable(preview.content)}</pre></section>}
          <div className="sup-row"><h3>Activity</h3><span className="sup-muted">Verification: {run.verification?.status || "NOT_RUN"}</span></div>
          {events.length ? <ol className="sup-events">{events.slice(-150).reverse().map((event, index) => <li key={event.id || `${event.at}:${index}`}><time dateTime={event.at}>{date(event.at)}</time><strong>{String(event.type || "Event").replaceAll("_", " ")}</strong><p>{readable(event.message)}</p></li>)}</ol> : <p className="sup-muted">Waiting for the first event.</p>}
        </>}
      </section>
    </div>
  </section>;
}
