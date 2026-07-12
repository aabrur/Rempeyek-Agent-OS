import { useEffect, useRef, useState } from "react";
import { Btn, Chip, Empty } from "@rempeyek/ui";
import { api } from "../api";
import { agentAccent } from "../lib/agents";
import { obsUri } from "../lib/obsidian";
import { PROJECT_TABS, projectTabFromKey, tasksForProject } from "../../lib/workspace-view-model.mjs";

function Progress({ value }) {
  const label = value == null ? "Progress is not available" : `${value}% complete`;
  return <div className="ws-prog" title={label} role={value == null ? undefined : "progressbar"} aria-label={label} aria-valuemin={value == null ? undefined : 0} aria-valuemax={value == null ? undefined : 100} aria-valuenow={value == null ? undefined : value}><i style={{ width: `${value ?? 0}%` }} /></div>;
}

function StatusChip({ status }) {
  return <span className={`ws-status st-${status || "active"}`}>{status || "active"}</span>;
}

function DispatchRow({ detail, agents }) {
  const [agent, setAgent] = useState(agents[0]?.id || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const selectId = `resume-agent-${detail.slug}`;
  const send = async () => {
    if (!agent || busy) return;
    setBusy(true);
    setMessage("Adding the resume brief to Tasks Inbox…");
    const title = `Resume project: ${detail.name}`;
    const body = [detail.next ? `Next: ${detail.next}` : "", detail.decisions[0] ? `Last: ${detail.decisions[0]}` : "", `Workspace: Projects/${detail.slug}/`].filter(Boolean).join(" · ");
    const result = await api("/api/task", { method: "POST", body: JSON.stringify({ agent, title, detail: body }) });
    setMessage(result.error ? `Could not add the brief: ${result.error}` : "Resume brief added to Tasks Inbox.");
    setBusy(false);
  };
  return <><div className="task-form ws-composer"><label htmlFor={selectId}>Assign the inbox task to</label><select id={selectId} value={agent} onChange={event => setAgent(event.target.value)} disabled={!agents.length || busy}>{agents.map(item => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}</select><Btn variant="primary" onClick={send} disabled={!agent || busy}>{busy ? "Adding…" : "Add resume brief"}</Btn></div>{!agents.length && <div className="ws-hint">No agent is available for assignment.</div>}<div className="ws-hint" role="status" aria-live="polite">{message}</div></>;
}

const TAB_LABELS = { overview: "Overview", tasks: "Tasks", memory: "Memory", files: "Files", decisions: "Decisions", activity: "Activity" };

function ProjectTabs({ active, onChange }) {
  const refs = useRef({});
  const move = (current, key) => {
    const next = projectTabFromKey(current, key);
    if (next === current) return;
    onChange(next);
    requestAnimationFrame(() => refs.current[next]?.focus());
  };
  return <div className="project-tabs" role="tablist" aria-label="Project workspace destinations">{PROJECT_TABS.map(tab => <button key={tab} ref={node => { refs.current[tab] = node; }} id={`project-tab-${tab}`} type="button" role="tab" aria-selected={active === tab} aria-controls={`project-panel-${tab}`} tabIndex={active === tab ? 0 : -1} className={active === tab ? "active" : ""} onClick={() => onChange(tab)} onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return; event.preventDefault(); move(tab, event.key); }}>{TAB_LABELS[tab]}</button>)}</div>;
}

export function ProjectWorkspace({ slug, agents, agentsById, today, initialTab = "overview", onClose, refresh }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [decisionText, setDecisionText] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [actionMessage, setActionMessage] = useState("");
  const [logging, setLogging] = useState(false);
  const ref = useRef(null);
  const copyTimer = useRef(null);

  const load = async () => {
    setError("");
    const result = await api(`/api/project/${slug}`);
    if (result.error) setError(result.error); else setDetail(result);
  };
  useEffect(() => { setDetail(null); setActiveTab(initialTab); load(); }, [slug, initialTab]);
  useEffect(() => {
    if (!detail?.slug || !ref.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    ref.current.focus({ preventScroll: true });
  }, [detail?.slug]);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  if (error) return <div className="empty ws-load-error" role="alert" ref={ref}>Project details could not be loaded: {error}. <Btn onClick={load}>Try again</Btn></div>;
  if (!detail) return <div className="skeleton-block project-loading" role="status" aria-label="Loading project workspace" ref={ref} />;

  const accent = agentAccent(detail.agents?.[0] && (agentsById[detail.agents[0]] || detail.agents[0]));
  const projectTasks = tasksForProject(detail, today);
  const panelProps = tab => ({ id: `project-panel-${tab}`, role: "tabpanel", "aria-labelledby": `project-tab-${tab}`, hidden: activeTab !== tab });
  const logDecision = async () => {
    const text = decisionText.trim();
    if (!text || logging) return;
    setLogging(true);
    setActionMessage("Logging decision…");
    const result = await api(`/api/project/${slug}/decision`, { method: "POST", body: JSON.stringify({ text }) });
    if (result.error) setActionMessage(`Could not log the decision: ${result.error}`);
    else { setDecisionText(""); setActionMessage("Decision logged in the project record."); await load(); refresh(); }
    setLogging(false);
  };
  const copyBrief = async () => {
    try { await navigator.clipboard.writeText(detail.brief); setCopied(true); setActionMessage("Resume brief copied."); copyTimer.current = setTimeout(() => setCopied(false), 1600); }
    catch { setActionMessage("The resume brief could not be copied."); }
  };

  return <section className="detail ws-detail project-workspace" style={{ "--ac": accent }} ref={ref} tabIndex="-1" aria-labelledby="project-workspace-title">
    <div className="detail-head"><div><div className="today-label">PROJECT WORKSPACE</div><h2 id="project-workspace-title">{detail.name}</h2><div className="detail-meta"><StatusChip status={detail.status} />{detail.progress != null && <span>{detail.progress}%</span>}{detail.tasksOpen > 0 && <span>{detail.tasksOpen} open tasks</span>}{detail.updated && <span>Updated {detail.updated}</span>}</div></div><div className="detail-actions"><Btn onClick={copyBrief}>{copied ? "Copied" : "Copy brief"}</Btn><a className="chip project-link" href={obsUri(detail.rel)}>Open project note</a><Btn onClick={onClose}>Close</Btn></div></div>
    <ProjectTabs active={activeTab} onChange={setActiveTab} />
    <div className="project-panels">
      <section {...panelProps("overview")}><div className="project-overview-grid"><article><div className="today-label">GOAL</div><p className="project-goal">{detail.goal || "No project goal has been recorded."}</p><Progress value={detail.progress} /></article><article><div className="today-label">NEXT ACTION</div><div className="ws-next">{detail.next || <span className="muted">No next action has been recorded.</span>}</div></article></div><div className="project-assignees"><span>Assigned agents</span>{detail.agents?.length ? detail.agents.map(name => <Chip key={name}>{name}</Chip>) : <span className="muted">None recorded</span>}</div>{detail.kind === "workspace" && <div className="project-composer"><h3>Continue with an agent</h3><p>Add the existing resume brief to the local Tasks Inbox.</p><DispatchRow detail={detail} agents={agents} /></div>}</section>
      <section {...panelProps("tasks")}><div className="project-section-head"><div><div className="today-label">OPEN WORK</div><h3>Tasks</h3></div><Chip>{detail.tasksOpen || 0} open</Chip></div>{projectTasks.length ? <ul className="project-task-list">{projectTasks.map(task => <li key={task.id}><StatusChip status={task.status} /><span>{task.title}</span></li>)}</ul> : detail.tasksOpen > 0 ? <Empty>{detail.tasksOpen} open task{detail.tasksOpen === 1 ? " is" : "s are"} recorded in the project note. Task details are not exposed for this project yet.</Empty> : <Empty>No unfinished tasks are recorded for this project.</Empty>}</section>
      <section {...panelProps("memory")}><div className="project-section-head"><div><div className="today-label">RESUME CONTEXT</div><h3>Memory</h3></div></div>{detail.brief ? <><p className="muted">Read-only context assembled from the project goal, status, next action, and decision log.</p><pre className="project-memory">{detail.brief}</pre></> : <Empty>No resume context is available for this project.</Empty>}</section>
      <section {...panelProps("files")}><div className="project-section-head"><div><div className="today-label">LOCAL MARKDOWN</div><h3>Files</h3></div><Chip>{detail.docs.length} recent</Chip></div>{detail.docs.length ? <div className="project-files">{detail.docs.map(doc => <a key={doc.rel} href={obsUri(doc.rel)}><span>{doc.rel.split("/").pop()}</span><time>{doc.updated}</time></a>)}</div> : <Empty>No project files are exposed for this project.</Empty>}</section>
      <section {...panelProps("decisions")}><div className="project-section-head"><div><div className="today-label">PROJECT RECORD</div><h3>Decisions</h3></div><Chip>{detail.decisions.length} logged</Chip></div>{detail.kind === "workspace" ? <><div className="task-form decision-form"><label htmlFor={`decision-${slug}`}>Log a decision</label><input id={`decision-${slug}`} placeholder="State the decision and why it matters" value={decisionText} onChange={event => setDecisionText(event.target.value)} onKeyDown={event => event.key === "Enter" && !event.nativeEvent?.isComposing && logDecision()} disabled={logging} /><Btn variant="primary" onClick={logDecision} disabled={!decisionText.trim() || logging}>{logging ? "Logging…" : "Log decision"}</Btn></div><div className="decision-list">{detail.decisions.length ? detail.decisions.map((decision, index) => <div key={index} className="ws-dec">{decision}</div>) : <Empty>No decision has been logged yet.</Empty>}</div></> : <Empty>This flat project note is read-only in the workspace.</Empty>}</section>
      <section {...panelProps("activity")}><div className="project-section-head"><div><div className="today-label">MEANINGFUL EVENTS</div><h3>Activity</h3></div></div><Empty>Project activity is not exposed by the current API. No events are inferred from file timestamps.</Empty></section>
    </div>
    <div className="project-status" role="status" aria-live="polite">{actionMessage}</div>
  </section>;
}
