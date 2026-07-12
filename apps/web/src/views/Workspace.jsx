import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Chip, Empty, Overlay, PageHead, SectionRow } from "@rempeyek/ui";
import { api } from "../api";
import { agentAccent } from "../lib/agents";
import { obsUri } from "../lib/obsidian";
import { PROJECT_TABS, buildContinuityModel, projectTabFromKey, tasksForProject } from "../../lib/workspace-view-model.mjs";

function ago(ts) {
  if (!ts) return "";
  const time = Number.isFinite(Number(ts)) ? Number(ts) : Date.parse(ts);
  if (!Number.isFinite(time)) return "";
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Progress({ value, hero }) {
  const label = value == null ? "Progress is not available" : `${value}% complete`;
  return (
    <div
      className={`ws-prog ${hero ? "ws-prog-hero" : ""}`.trim()}
      title={label}
      role={value == null ? undefined : "progressbar"}
      aria-label={label}
      aria-valuemin={value == null ? undefined : 0}
      aria-valuemax={value == null ? undefined : 100}
      aria-valuenow={value == null ? undefined : value}
    >
      <i style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

function StatusChip({ status }) {
  return <span className={`ws-status st-${status || "active"}`}>{status || "active"}</span>;
}

function useTodayWorkspace() {
  const [today, setToday] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
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
  const decide = async (approval, decision) => {
    if (decidingRef.current) return;
    const verb = decision === "approved" ? "APPROVE" : "REJECT";
    if (!window.confirm(`${verb} this request?\n\nConsequence: ${approval.consequence}\nScope: ${approval.type} → ${approval.target}`)) return;
    setActionError("");
    decidingRef.current = true;
    setDeciding(approval.id);
    const result = await api(`/api/approvals/${approval.id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, confirmed: true }),
    });
    if (result.error) {
      setActionError(result.error);
      decidingRef.current = false;
      setDeciding("");
      return;
    }
    await load();
    decidingRef.current = false;
    setDeciding("");
  };
  return { today, approvals, error: actionError || loadError, deciding, reload: load, decide };
}

function AgentDots({ names, agentsById }) {
  if (!names?.length) return null;
  return (
    <span className="ws-agents" title={names.join(" · ")}>
      <span className="sr-only">Assigned agents: {names.join(", ")}</span>
      {names.slice(0, 5).map(name => {
        const agent = agentsById[name] || Object.values(agentsById).find(item => item.name === name);
        return <i key={name} aria-hidden="true" style={{ background: agentAccent(agent || name) }} />;
      })}
    </span>
  );
}

function ContinuityItem({ item, project, onContinue }) {
  const content = <><span>{item.label}</span><strong>{item.value}</strong></>;
  if (item.kind === "task") return <button type="button" onClick={() => onContinue(project, "tasks")}>{content}</button>;
  if (item.kind === "decision") return <button type="button" onClick={() => onContinue(project, "decisions")}>{content}</button>;
  if (item.kind === "artifact" && item.target) return <a href={obsUri(item.target)}>{content}</a>;
  if (item.kind === "memory" && item.target) return <a href={obsUri(item.target)}>{content}</a>;
  return content;
}

function ContinuityHero({ today, pendingApprovals, agentsById, onContinue }) {
  const model = buildContinuityModel(today);
  const project = model.project;
  if (!project) return null;
  const name = project.name || project.title || project.slug || project.id;
  const accent = agentAccent(project.agents?.[0] && (agentsById[project.agents[0]] || project.agents[0]));
  return (
    <section className="continuity-hero" style={{ "--ac": accent }} aria-labelledby="continuity-title">
      <div className="continuity-copy">
        <div className="ws-eyebrow">PROJECT CONTINUITY</div>
        <h2 id="continuity-title" className="ws-hero-name">{name}</h2>
        {project.goal && <p className="ws-goal">{project.goal}</p>}
        <div className="continuity-next">
          <span>Next useful action</span>
          <strong>{today.nextAction?.label || "No next action has been recorded."}</strong>
        </div>
        <div className="continuity-actions">
          <Btn variant="primary" className="ws-continue" onClick={() => onContinue(project, model.initialTab)}>Continue {name}</Btn>
          {project.rel && <a className="chip chip-plain continuity-link" href={obsUri(project.rel)}>Open project note</a>}
        </div>
      </div>

      <div className="continuity-map" role="group" aria-label={`Continuity records for ${name}`}>
        <div className="continuity-core"><span>Current project</span><strong>{name}</strong></div>
        <ol className="continuity-nodes">
          {model.items.map(item => <li key={item.kind} className={`continuity-node node-${item.kind}`}><ContinuityItem item={item} project={project} onContinue={onContinue} /></li>)}
        </ol>
      </div>

      <div className="continuity-strip" aria-label="Project record status">
        <span><b>Source</b> Local Markdown</span>
        <span><b>Updated</b> {ago(project.updatedAt) || project.updated || "not recorded"}</span>
        <span><b>Approvals</b> {pendingApprovals} pending</span>
        <span><b>Assigned</b> {project.agents?.length || 0} agents</span>
      </div>
    </section>
  );
}

function TodayContext({ today }) {
  if (!today || today.state === "empty") return null;
  const tasks = today.unfinishedTasks || [];
  const decisions = today.unresolvedDecisions || [];
  const artifacts = today.recentArtifacts || [];
  return (
    <section className="today-context" aria-labelledby="today-context-title">
      <h2 id="today-context-title" className="sr-only">Current project details</h2>
      <article className="today-panel">
        <h3>Unfinished tasks <span className="cnt">{tasks.length}</span></h3>
        <ul className="today-list">
          {tasks.slice(0, 5).map((task, index) => <li key={task.id || index}><StatusChip status={task.status} /><span>{task.title}</span></li>)}
          {!tasks.length && <li className="muted">No unfinished tasks.</li>}
        </ul>
      </article>
      <article className="today-panel">
        <h3>Decision context <span className="cnt">{decisions.length}</span></h3>
        <ul className="today-list">
          {decisions.slice(0, 4).map((decision, index) => <li key={decision.id || index}><span>{decision.text || decision.label || String(decision)}</span></li>)}
          {!decisions.length && <li className="muted">No decision record is available.</li>}
        </ul>
      </article>
      <article className="today-panel">
        <h3>Recent output <span className="cnt">{artifacts.length}</span></h3>
        <ul className="today-list">
          {artifacts.slice(0, 5).map((artifact, index) => {
            const notePath = artifact.path || artifact.rel || artifact.target;
            return <li key={notePath || index}>{notePath ? <a href={obsUri(notePath)}>{artifact.label || notePath.split("/").pop()}</a> : <span>{artifact.label || "Project output"}</span>}</li>;
          })}
          {!artifacts.length && <li className="muted">No recent output.</li>}
        </ul>
      </article>
    </section>
  );
}

function ApprovalQueue({ approvals, deciding, onDecision }) {
  const pending = approvals.filter(item => item.status === "pending");
  return (
    <section className="approval-queue" aria-labelledby="approval-title">
      <div className="approval-head">
        <div><div className="today-label">FOUNDER DECISIONS</div><h2 id="approval-title">Approval queue</h2></div>
        <Chip>{pending.length} pending</Chip>
      </div>
      {!pending.length ? <p className="muted">No action is waiting for approval.</p> : pending.map(item => (
        <article className="approval-item" key={item.id}>
          <div className="approval-copy">
            <strong>{item.consequence}</strong>
            <span><b>Applies to</b> {item.target}</span>
            <span><b>Requested by</b> {item.actor}</span>
          </div>
          <div className="approval-actions" role="group" aria-label={`Decision for ${item.type} on ${item.target}`}>
            <Btn disabled={Boolean(deciding)} onClick={() => onDecision(item, "rejected")}>Reject</Btn>
            <Btn variant="primary" disabled={Boolean(deciding)} onClick={() => onDecision(item, "approved")}>{deciding === item.id ? "Deciding…" : "Approve for 15 min"}</Btn>
          </div>
        </article>
      ))}
    </section>
  );
}

function ProjectCard({ project, index, onOpen, agentsById }) {
  return (
    <button className="ws-card" style={{ animationDelay: `${index * 45}ms` }} onClick={() => onOpen(project)}>
      <div className="ws-card-top"><span className="ws-card-name">{project.name}</span><StatusChip status={project.status} /></div>
      {project.goal && <div className="ws-card-goal">{project.goal}</div>}
      <Progress value={project.progress} />
      <div className="ws-card-meta">
        <span>{project.progress != null ? `${project.progress}%` : "No progress recorded"}{project.tasksOpen > 0 ? ` · ${project.tasksOpen} open` : ""}</span>
        <AgentDots names={project.agents} agentsById={agentsById} />
        <span>{ago(project.updatedAt)}</span>
      </div>
    </button>
  );
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
  return (
    <>
      <div className="task-form ws-composer">
        <label htmlFor={selectId}>Assign the inbox task to</label>
        <select id={selectId} value={agent} onChange={event => setAgent(event.target.value)} disabled={!agents.length || busy}>
          {agents.map(item => <option key={item.id} value={item.id}>{item.icon} {item.name}</option>)}
        </select>
        <Btn variant="primary" onClick={send} disabled={!agent || busy}>{busy ? "Adding…" : "Add resume brief"}</Btn>
      </div>
      {!agents.length && <div className="ws-hint">No agent is available for assignment.</div>}
      <div className="ws-hint" role="status" aria-live="polite">{message}</div>
    </>
  );
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
  return (
    <div className="project-tabs" role="tablist" aria-label="Project workspace destinations">
      {PROJECT_TABS.map(tab => (
        <button
          key={tab}
          ref={node => { refs.current[tab] = node; }}
          id={`project-tab-${tab}`}
          type="button"
          role="tab"
          aria-selected={active === tab}
          aria-controls={`project-panel-${tab}`}
          tabIndex={active === tab ? 0 : -1}
          className={active === tab ? "active" : ""}
          onClick={() => onChange(tab)}
          onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            move(tab, event.key);
          }}
        >{TAB_LABELS[tab]}</button>
      ))}
    </div>
  );
}

function ProjectPanel({ slug, agents, agentsById, today, initialTab = "overview", onClose, refresh }) {
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
    if (result.error) setError(result.error);
    else setDetail(result);
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
    else {
      setDecisionText("");
      setActionMessage("Decision logged in the project record.");
      await load();
      refresh();
    }
    setLogging(false);
  };
  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(detail.brief);
      setCopied(true);
      setActionMessage("Resume brief copied.");
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch { setActionMessage("The resume brief could not be copied."); }
  };

  return (
    <div className="detail ws-detail project-workspace" style={{ "--ac": accent }} ref={ref} tabIndex="-1" aria-labelledby="project-workspace-title">
      <div className="detail-head">
        <div>
          <div className="today-label">PROJECT WORKSPACE</div>
          <h2 id="project-workspace-title">{detail.name}</h2>
          <div className="detail-meta">
            <StatusChip status={detail.status} />
            {detail.progress != null && <span>{detail.progress}%</span>}
            {detail.tasksOpen > 0 && <span>{detail.tasksOpen} open tasks</span>}
            {detail.updated && <span>Updated {detail.updated}</span>}
          </div>
        </div>
        <div className="detail-actions">
          <Btn onClick={copyBrief}>{copied ? "Copied" : "Copy brief"}</Btn>
          <a className="chip project-link" href={obsUri(detail.rel)}>Open project note</a>
          <Btn onClick={onClose}>Close</Btn>
        </div>
      </div>

      <ProjectTabs active={activeTab} onChange={setActiveTab} />
      <div className="project-panels">
        <section {...panelProps("overview")}>
          <div className="project-overview-grid">
            <article><div className="today-label">GOAL</div><p className="project-goal">{detail.goal || "No project goal has been recorded."}</p><Progress value={detail.progress} /></article>
            <article><div className="today-label">NEXT ACTION</div><div className="ws-next">{detail.next || <span className="muted">No next action has been recorded.</span>}</div></article>
          </div>
          <div className="project-assignees"><span>Assigned agents</span>{detail.agents?.length ? detail.agents.map(name => <Chip key={name}>{name}</Chip>) : <span className="muted">None recorded</span>}</div>
          {detail.kind === "workspace" && <div className="project-composer"><h3>Continue with an agent</h3><p>Add the existing resume brief to the local Tasks Inbox.</p><DispatchRow detail={detail} agents={agents} /></div>}
        </section>

        <section {...panelProps("tasks")}>
          <div className="project-section-head"><div><div className="today-label">OPEN WORK</div><h3>Tasks</h3></div><Chip>{detail.tasksOpen || 0} open</Chip></div>
          {projectTasks.length
            ? <ul className="project-task-list">{projectTasks.map(task => <li key={task.id}><StatusChip status={task.status} /><span>{task.title}</span></li>)}</ul>
            : detail.tasksOpen > 0
              ? <Empty>{detail.tasksOpen} open task{detail.tasksOpen === 1 ? " is" : "s are"} recorded in the project note. Task details are not exposed for this project yet.</Empty>
              : <Empty>No unfinished tasks are recorded for this project.</Empty>}
        </section>

        <section {...panelProps("memory")}>
          <div className="project-section-head"><div><div className="today-label">RESUME CONTEXT</div><h3>Memory</h3></div></div>
          {detail.brief ? <><p className="muted">Read-only context assembled from the project goal, status, next action, and decision log.</p><pre className="project-memory">{detail.brief}</pre></> : <Empty>No resume context is available for this project.</Empty>}
        </section>

        <section {...panelProps("files")}>
          <div className="project-section-head"><div><div className="today-label">LOCAL MARKDOWN</div><h3>Files</h3></div><Chip>{detail.docs.length} recent</Chip></div>
          {detail.docs.length ? <div className="project-files">{detail.docs.map(doc => <a key={doc.rel} href={obsUri(doc.rel)}><span>{doc.rel.split("/").pop()}</span><time>{doc.updated}</time></a>)}</div> : <Empty>No project files are exposed for this project.</Empty>}
        </section>

        <section {...panelProps("decisions")}>
          <div className="project-section-head"><div><div className="today-label">PROJECT RECORD</div><h3>Decisions</h3></div><Chip>{detail.decisions.length} logged</Chip></div>
          {detail.kind === "workspace" ? <>
            <div className="task-form decision-form">
              <label htmlFor={`decision-${slug}`}>Log a decision</label>
              <input id={`decision-${slug}`} placeholder="State the decision and why it matters" value={decisionText} onChange={event => setDecisionText(event.target.value)} onKeyDown={event => event.key === "Enter" && !event.nativeEvent?.isComposing && logDecision()} disabled={logging} />
              <Btn variant="primary" onClick={logDecision} disabled={!decisionText.trim() || logging}>{logging ? "Logging…" : "Log decision"}</Btn>
            </div>
            <div className="decision-list">{detail.decisions.length ? detail.decisions.map((decision, index) => <div key={index} className="ws-dec">{decision}</div>) : <Empty>No decision has been logged yet.</Empty>}</div>
          </> : <Empty>This flat project note is read-only in the workspace.</Empty>}
        </section>

        <section {...panelProps("activity")}>
          <div className="project-section-head"><div><div className="today-label">MEANINGFUL EVENTS</div><h3>Activity</h3></div></div>
          <Empty>Project activity is not exposed by the current API. No events are inferred from file timestamps.</Empty>
        </section>
      </div>
      <div className="project-status" role="status" aria-live="polite">{actionMessage}</div>
    </div>
  );
}

function NewProjectModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    const result = await api("/api/project", { method: "POST", body: JSON.stringify({ name, goal }) });
    setBusy(false);
    if (result.error) return setError(result.error);
    setName("");
    setGoal("");
    onCreated(result.slug);
  };
  return (
    <Overlay open={open} onClose={onClose} boxClass="aa-box" labelledBy="new-project-title">
      <div className="token-title" id="new-project-title">NEW PROJECT WORKSPACE</div>
      <div className="token-sub">Creates a local Markdown workspace in the Vault.</div>
      <div className="aa-field wide">
        <label htmlFor="new-project-name">Name</label>
        <input id="new-project-name" value={name} onChange={event => setName(event.target.value)} placeholder="Startup A" />
      </div>
      <div className="aa-field wide">
        <label htmlFor="new-project-goal">Goal</label>
        <input id="new-project-goal" value={goal} onChange={event => setGoal(event.target.value)} placeholder="Ship the landing page and waitlist" onKeyDown={event => event.key === "Enter" && !event.nativeEvent?.isComposing && create()} />
      </div>
      <div className="aa-hint err" role={error ? "alert" : undefined}>{error}</div>
      <div className="aa-actions">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={create} disabled={!name.trim() || busy}>{busy ? "Creating…" : "Create project"}</Btn>
      </div>
    </Overlay>
  );
}

export function WorkspaceView({ projects = [], agents = [], agentsById = {}, refresh }) {
  const [openProject, setOpenProject] = useState(null);
  const [creating, setCreating] = useState(false);
  const { today, approvals, error: todayError, deciding, reload: reloadToday, decide } = useTodayWorkspace();
  const continuity = buildContinuityModel(today);
  const currentId = continuity.project?.id || continuity.project?.slug;
  const projectCards = useMemo(() => projects.filter(project => (project.id || project.slug) !== currentId), [projects, currentId]);
  const pendingApprovals = approvals.filter(item => item.status === "pending").length;

  const open = (project, tab = "overview") => {
    if (project.kind === "workspace") setOpenProject({ slug: project.slug, tab });
    else window.location.href = obsUri(project.rel);
  };

  return (
    <section className="view active">
      <PageHead title="TODAY">Continue the current project from its local Markdown record.</PageHead>
      {todayError && <div className="today-error" role="alert">Live project context is temporarily unavailable. <Btn onClick={reloadToday}>Try again</Btn></div>}

      {!today ? <div className="skeleton-block continuity-loading" role="status" aria-label="Loading current project" />
        : today.state === "empty" ? <Empty>No active project is ready to continue.</Empty>
          : <ContinuityHero today={today} pendingApprovals={pendingApprovals} agentsById={agentsById} onContinue={open} />}

      <TodayContext today={today} />
      <ApprovalQueue approvals={approvals} deciding={deciding} onDecision={decide} />

      <SectionRow label={`PROJECTS · ${projects.length}`}><Btn variant="primary" onClick={() => setCreating(true)}>New project</Btn></SectionRow>
      {!projects.length ? <Empty>No projects yet. Create a workspace to preserve the goal, next action, decisions, and resume context.</Empty>
        : projectCards.length ? <div className="ws-grid">{projectCards.map((project, index) => <ProjectCard key={project.rel} project={project} index={index} onOpen={open} agentsById={agentsById} />)}</div>
          : <Empty>The current project is shown above.</Empty>}

      {openProject && <div className="project-workspace-wrap"><ProjectPanel slug={openProject.slug} initialTab={openProject.tab} agents={agents} agentsById={agentsById} today={today} onClose={() => setOpenProject(null)} refresh={refresh} /></div>}
      <NewProjectModal open={creating} onClose={() => setCreating(false)} onCreated={slug => { setCreating(false); setOpenProject({ slug, tab: "overview" }); refresh(); }} />
    </section>
  );
}
