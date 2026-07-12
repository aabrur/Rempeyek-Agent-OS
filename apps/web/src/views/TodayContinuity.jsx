import { useEffect, useRef, useState } from "react";
import { Btn, Chip, Empty } from "@rempeyek/ui";
import { api } from "../api";
import { agentAccent } from "../lib/agents";
import { obsUri } from "../lib/obsidian";
import { buildContinuityModel } from "../../lib/workspace-view-model.mjs";

function ago(ts) {
  if (!ts) return "";
  const time = Number.isFinite(Number(ts)) ? Number(ts) : Date.parse(ts);
  if (!Number.isFinite(time)) return "";
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function Progress({ value }) {
  const label = value == null ? "Progress is not available" : `${value}% complete`;
  return <div className="ws-prog" title={label} role={value == null ? undefined : "progressbar"} aria-label={label} aria-valuemin={value == null ? undefined : 0} aria-valuemax={value == null ? undefined : 100} aria-valuenow={value == null ? undefined : value}><i style={{ width: `${value ?? 0}%` }} /></div>;
}

function StatusChip({ status }) {
  return <span className={`ws-status st-${status || "active"}`}>{status || "active"}</span>;
}

export function useTodayWorkspace() {
  const [today, setToday] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [failedDecision, setFailedDecision] = useState(null);
  const [deciding, setDeciding] = useState("");
  const decidingRef = useRef(false);

  const load = async () => {
    const [next, queue] = await Promise.all([api("/api/today"), api("/api/approvals")]);
    setLoadError(next.error || queue.error || "");
    if (!next.error) setToday(next);
    if (!queue.error) setApprovals(queue.approvals || []);
  };

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000);
    return () => clearInterval(timer);
  }, []);

  const submitDecision = async (approval, decision) => {
    if (decidingRef.current) return;
    setActionError("");
    decidingRef.current = true;
    setDeciding(approval.id);
    try {
      const result = await api(`/api/approvals/${approval.id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, confirmed: true }),
      });
      if (result.error) {
        setActionError(result.error);
        setFailedDecision({ approval, decision });
        return;
      }
      setActionError("");
      setFailedDecision(null);
      await load();
    } catch (error) {
      setActionError(error?.message || "The approval service did not respond.");
      setFailedDecision({ approval, decision });
    } finally {
      decidingRef.current = false;
      setDeciding("");
    }
  };

  const decide = async (approval, decision) => {
    const verb = decision === "approved" ? "APPROVE" : "REJECT";
    if (!window.confirm(`${verb} this request?\n\nConsequence: ${approval.consequence}\nScope: ${approval.type} → ${approval.target}`)) return;
    await submitDecision(approval, decision);
  };

  return {
    today,
    approvals,
    loadError,
    actionError,
    deciding,
    reload: load,
    decide,
    retryDecision: failedDecision ? () => submitDecision(failedDecision.approval, failedDecision.decision) : null,
    dismissActionError: () => { setActionError(""); setFailedDecision(null); },
  };
}

function AgentDots({ names, agentsById }) {
  if (!names?.length) return null;
  return <span className="ws-agents" title={names.join(" · ")}><span className="sr-only">Assigned agents: {names.join(", ")}</span>{names.slice(0, 5).map(name => { const agent = agentsById[name] || Object.values(agentsById).find(item => item.name === name); return <i key={name} aria-hidden="true" style={{ background: agentAccent(agent || name) }} />; })}</span>;
}

function ContinuityItem({ item, project, onContinue }) {
  const content = <><span>{item.label}</span><strong>{item.value}</strong></>;
  if (item.kind === "task") return <button type="button" onClick={() => onContinue(project, "tasks")}>{content}</button>;
  if (item.kind === "decision") return <button type="button" onClick={() => onContinue(project, "decisions")}>{content}</button>;
  if ((item.kind === "artifact" || item.kind === "memory") && item.target) return <a href={obsUri(item.target)}>{content}</a>;
  return content;
}

function ContinuityHero({ today, pendingApprovals, agentsById, onContinue }) {
  const model = buildContinuityModel(today);
  const project = model.project;
  if (!project) return null;
  const name = project.name || project.title || project.slug || project.id;
  const accent = agentAccent(project.agents?.[0] && (agentsById[project.agents[0]] || project.agents[0]));
  return <section className="continuity-hero" style={{ "--ac": accent }} aria-labelledby="continuity-title">
    <div className="continuity-copy"><div className="ws-eyebrow">PROJECT CONTINUITY</div><h2 id="continuity-title" className="ws-hero-name">{name}</h2>{project.goal && <p className="ws-goal">{project.goal}</p>}<div className="continuity-next"><span>Next useful action</span><strong>{today.nextAction?.label || "No next action has been recorded."}</strong></div><div className="continuity-actions"><Btn variant="primary" className="ws-continue" onClick={() => onContinue(project, model.initialTab)}>Continue {name}</Btn>{project.rel && <a className="chip chip-plain continuity-link" href={obsUri(project.rel)}>Open project note</a>}</div></div>
    <div className="continuity-map" role="group" aria-label={`Continuity records for ${name}`}><div className="continuity-core"><span>Current project</span><strong>{name}</strong></div><ol className="continuity-nodes">{model.items.map(item => <li key={item.kind} className={`continuity-node node-${item.kind}`}><ContinuityItem item={item} project={project} onContinue={onContinue} /></li>)}</ol></div>
    <div className="continuity-strip" aria-label="Project record status"><span><b>Source</b> Local Markdown</span><span><b>Updated</b> {ago(project.updatedAt) || project.updated || "not recorded"}</span><span><b>Approvals</b> {pendingApprovals} pending</span><span><b>Assigned</b> {project.agents?.length || 0} agents</span></div>
  </section>;
}

function TodayContext({ today }) {
  if (!today || today.state === "empty") return null;
  const tasks = today.unfinishedTasks || [];
  const decisions = today.project?.decisions || [];
  const artifacts = today.recentArtifacts || [];
  return <section className="today-context" aria-labelledby="today-context-title"><h2 id="today-context-title" className="sr-only">Current project details</h2>
    <article className="today-panel"><h3>Unfinished tasks <span className="cnt">{tasks.length}</span></h3><ul className="today-list">{tasks.slice(0, 5).map((task, index) => <li key={task.id || index}><StatusChip status={task.status} /><span>{task.title}</span></li>)}{!tasks.length && <li className="muted">No unfinished tasks.</li>}</ul></article>
    <article className="today-panel"><h3>Decision context <span className="cnt">{decisions.length}</span></h3><ul className="today-list">{decisions.slice(0, 4).map((decision, index) => <li key={decision.id || index}><span>{decision.text || decision.label || String(decision)}</span></li>)}{!decisions.length && <li className="muted">No decision record is available.</li>}</ul></article>
    <article className="today-panel"><h3>Recent output <span className="cnt">{artifacts.length}</span></h3><ul className="today-list">{artifacts.slice(0, 5).map((artifact, index) => { const notePath = artifact.path || artifact.rel || artifact.target; return <li key={notePath || index}>{notePath ? <a href={obsUri(notePath)}>{artifact.label || notePath.split("/").pop()}</a> : <span>{artifact.label || "Project output"}</span>}</li>; })}{!artifacts.length && <li className="muted">No recent output.</li>}</ul></article>
  </section>;
}

function ApprovalQueue({ approvals, deciding, actionError, onDecision, onRetry, onDismissError }) {
  const pending = approvals.filter(item => item.status === "pending");
  return <section className="approval-queue" aria-labelledby="approval-title"><div className="approval-head"><div><div className="today-label">FOUNDER DECISIONS</div><h2 id="approval-title">Approval queue</h2></div><Chip>{pending.length} pending</Chip></div>
    {actionError && <div className="today-error approval-action-error" role="alert"><span>Approval could not be completed: {actionError}</span><div className="approval-actions">{onRetry && <Btn onClick={onRetry} disabled={Boolean(deciding)}>Try again</Btn>}<Btn onClick={onDismissError}>Dismiss</Btn></div></div>}
    {!pending.length ? <p className="muted">No action is waiting for approval.</p> : pending.map(item => <article className="approval-item" key={item.id}><div className="approval-copy"><strong>{item.consequence}</strong><span><b>Applies to</b> {item.target}</span><span><b>Requested by</b> {item.actor}</span></div><div className="approval-actions" role="group" aria-label={`Decision for ${item.type} on ${item.target}`}><Btn disabled={Boolean(deciding)} onClick={() => onDecision(item, "rejected")}>Reject</Btn><Btn variant="primary" disabled={Boolean(deciding)} onClick={() => onDecision(item, "approved")}>{deciding === item.id ? "Deciding…" : "Approve for 15 min"}</Btn></div></article>)}
  </section>;
}

export function TodayContinuity({ today, approvals, loadError, actionError, deciding, onReload, onDecision, onRetryDecision, onDismissActionError, agentsById, onContinue }) {
  const pendingApprovals = approvals.filter(item => item.status === "pending").length;
  return <>
    {loadError && <div className="today-error" role="alert">Live project context is temporarily unavailable. <Btn onClick={onReload}>Try again</Btn></div>}
    {!today ? <div className="skeleton-block continuity-loading" role="status" aria-label="Loading current project" /> : today.state === "empty" ? <Empty>No active project is ready to continue.</Empty> : <ContinuityHero today={today} pendingApprovals={pendingApprovals} agentsById={agentsById} onContinue={onContinue} />}
    <TodayContext today={today} />
    <ApprovalQueue approvals={approvals} deciding={deciding} actionError={actionError} onDecision={onDecision} onRetry={onRetryDecision} onDismissError={onDismissActionError} />
  </>;
}

export function ProjectCard({ project, index, onOpen, agentsById }) {
  return <button className="ws-card" style={{ animationDelay: `${index * 45}ms` }} onClick={() => onOpen(project)}><div className="ws-card-top"><span className="ws-card-name">{project.name}</span><StatusChip status={project.status} /></div>{project.goal && <div className="ws-card-goal">{project.goal}</div>}<Progress value={project.progress} /><div className="ws-card-meta"><span>{project.progress != null ? `${project.progress}%` : "No progress recorded"}{project.tasksOpen > 0 ? ` · ${project.tasksOpen} open` : ""}</span><AgentDots names={project.agents} agentsById={agentsById} /><span>{ago(project.updatedAt)}</span></div></button>;
}
