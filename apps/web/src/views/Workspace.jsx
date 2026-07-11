import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Chip, Empty, Overlay, PageHead, SectionRow } from "@rempeyek/ui";
import { api } from "../api";
import { agentAccent } from "../lib/agents";
import { obsUri } from "../lib/obsidian";

/* Workspace — the front door. Not "which tool do I open" but "which project do I
   continue". Hero = the most recently touched project; Continue opens its panel
   with the decision log, the next pointer, and one-click dispatch to any agent. */

function ago(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Progress({ value, hero }) {
  return (
    <div className={`ws-prog ${hero ? "ws-prog-hero" : ""}`.trim()} title={value == null ? "no checkboxes yet" : `${value}%`}>
      <i style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

function StatusChip({ status }) {
  return <span className={`ws-status st-${status || "active"}`}>{status || "active"}</span>;
}

function AgentDots({ names, agentsById }) {
  if (!names?.length) return null;
  return (
    <span className="ws-agents" title={names.join(" · ")}>
      {names.slice(0, 5).map(n => {
        const a = agentsById[n] || Object.values(agentsById).find(x => x.name === n);
        return <i key={n} style={{ background: agentAccent(a || n) }} />;
      })}
    </span>
  );
}

function ProjectCard({ p, i, onOpen, agentsById }) {
  return (
    <button className="ws-card" style={{ animationDelay: `${i * 45}ms` }} onClick={() => onOpen(p)}>
      <div className="ws-card-top">
        <span className="ws-card-name">{p.name}</span>
        <StatusChip status={p.status} />
      </div>
      {p.goal && <div className="ws-card-goal">{p.goal}</div>}
      <Progress value={p.progress} />
      <div className="ws-card-meta">
        <span>{p.progress != null ? `${p.progress}%` : "—"}{p.tasksOpen > 0 ? ` · ${p.tasksOpen} open` : ""}</span>
        <AgentDots names={p.agents} agentsById={agentsById} />
        <span>{ago(p.updatedAt)}</span>
      </div>
    </button>
  );
}

function DispatchRow({ detail, agents }) {
  const [agent, setAgent] = useState(agents[0]?.id || "");
  const [msg, setMsg] = useState("");
  const send = async () => {
    setMsg("…");
    const title = `Resume project: ${detail.name}`;
    const body = [detail.next ? `Next: ${detail.next}` : "", detail.decisions[0] ? `Last: ${detail.decisions[0]}` : "", `Workspace: Projects/${detail.slug}/`]
      .filter(Boolean).join("  ·  ");
    const r = await api("/api/task", { method: "POST", body: JSON.stringify({ agent, title, detail: body }) });
    setMsg(r.error ? r.error : "brief sent to Tasks/Inbox — the agent picks it up");
  };
  return (
    <>
      <div className="task-form">
        <select value={agent} onChange={e => setAgent(e.target.value)}>
          {agents.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
        </select>
        <Btn variant="primary" onClick={send}>Send resume brief</Btn>
      </div>
      <div className="ws-hint">{msg}</div>
    </>
  );
}

function ProjectPanel({ slug, agents, agentsById, onClose, refresh }) {
  const [detail, setDetail] = useState(null);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  const load = async () => {
    const d = await api(`/api/project/${slug}`);
    if (!d.error) setDetail(d);
  };
  useEffect(() => { setDetail(null); load(); }, [slug]);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [detail?.slug]);

  if (!detail) return <div className="skeleton-block" style={{ height: 180 }} ref={ref} />;

  const ac = agentAccent(detail.agents?.[0] && (agentsById[detail.agents[0]] || detail.agents[0]));
  const logDecision = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    await api(`/api/project/${slug}/decision`, { method: "POST", body: JSON.stringify({ text: t }) });
    load(); refresh();
  };
  const copyBrief = async () => {
    try { await navigator.clipboard.writeText(detail.brief); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  };

  return (
    <div className="detail ws-detail" style={{ "--ac": ac }} ref={ref}>
      <div className="detail-head">
        <div>
          <h2>{detail.name}</h2>
          <div className="detail-meta">
            <StatusChip status={detail.status} />
            {detail.progress != null && <span>  {detail.progress}%</span>}
            {detail.tasksOpen > 0 && <span> · {detail.tasksOpen} open tasks</span>}
            {detail.updated && <span> · updated {detail.updated}</span>}
          </div>
        </div>
        <div className="detail-actions">
          <Btn onClick={copyBrief}>{copied ? "✓ Copied" : "⧉ Copy brief"}</Btn>
          <a className="chip" style={{ textDecoration: "none" }} href={obsUri(detail.rel)}>open note</a>
          <Btn onClick={onClose}>✕</Btn>
        </div>
      </div>

      <div className="detail-grid">
        <div className="dsec">
          <h3>Next step</h3>
          <div className="ws-next">{detail.next || <span className="muted">No next pointer yet — edit <code>next.md</code> or log a decision.</span>}</div>
          {detail.kind === "workspace" && (
            <>
              <h3 style={{ marginTop: 14 }}>Dispatch</h3>
              <DispatchRow detail={detail} agents={agents} />
            </>
          )}
          {detail.docs.length > 0 && (
            <>
              <h3 style={{ marginTop: 14 }}>Workspace files</h3>
              <div className="mini-list">
                {detail.docs.map(d => (
                  <a key={d.rel} href={obsUri(d.rel)}>{d.rel.split("/").pop()}<span className="d">{d.updated}</span></a>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="dsec">
          <h3>Decision log <span className="cnt">{detail.decisions.length}</span></h3>
          {detail.kind === "workspace" ? (
            <>
              <div className="task-form">
                <input
                  placeholder="Log a decision…" value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && logDecision()}
                />
                <Btn variant="primary" onClick={logDecision}>Log</Btn>
              </div>
              <div className="dsec-body">
                {detail.decisions.length
                  ? detail.decisions.map((d, i) => <div key={i} className="ws-dec">{d}</div>)
                  : <Empty>Nothing logged yet. Decisions land here — yours and ⚡auto ones from agent telemetry.</Empty>}
              </div>
            </>
          ) : (
            <Empty>This is a flat note (read-only here). New projects get a full workspace with a decision log.</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

function NewProjectModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [err, setErr] = useState("");
  const create = async () => {
    setErr("");
    const r = await api("/api/project", { method: "POST", body: JSON.stringify({ name, goal }) });
    if (r.error) return setErr(r.error);
    setName(""); setGoal("");
    onCreated(r.slug);
  };
  return (
    <Overlay open={open} onClose={onClose} boxClass="aa-box">
      <div className="token-title">NEW PROJECT WORKSPACE</div>
      <div className="token-sub">Creates <code>Projects/&lt;slug&gt;/</code> in the vault: project.md · decisions.md · next.md</div>
      <div className="aa-field wide">
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Startup A" autoFocus />
      </div>
      <div className="aa-field wide">
        <label>Goal (one line)</label>
        <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="Ship the landing page + waitlist" onKeyDown={e => e.key === "Enter" && create()} />
      </div>
      <div className="aa-hint err">{err}</div>
      <div className="aa-actions">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={create}>Create</Btn>
      </div>
    </Overlay>
  );
}

export function WorkspaceView({ projects = [], agents = [], agentsById = {}, refresh }) {
  const [open, setOpen] = useState(null);       // slug of the open panel
  const [creating, setCreating] = useState(false);

  const hero = projects[0];
  const rest = useMemo(() => projects.slice(1), [projects]);
  const heroAc = hero ? agentAccent(hero.agents?.[0] && (agentsById[hero.agents[0]] || hero.agents[0])) : undefined;

  const openProject = p => {
    if (p.kind === "workspace") setOpen(p.slug);
    else window.location.href = obsUri(p.rel);   // flat notes open in Obsidian
  };

  return (
    <section className="view active">
      <PageHead title="WORKSPACE">
        Continue where you left off — every agent, one project brain. Lives in <code>Projects/</code>.
      </PageHead>

      {!projects.length ? (
        <Empty>
          No projects yet. Create the first workspace — agents log their finished work into it, and you resume with one click.
          <div style={{ marginTop: 10 }}><Btn variant="primary" onClick={() => setCreating(true)}>＋ New project</Btn></div>
        </Empty>
      ) : (
        <>
          <div className="ws-hero" style={{ "--ac": heroAc }}>
            <div className="ws-eyebrow">◆ CONTINUE WHERE YOU LEFT OFF</div>
            <div className="ws-hero-row">
              <div className="ws-hero-main">
                <div className="ws-hero-name">{hero.name}</div>
                {hero.goal && <div className="ws-goal">{hero.goal}</div>}
                <Progress value={hero.progress} hero />
                <div className="ws-card-meta">
                  <span>{hero.progress != null ? `${hero.progress}%` : "no milestones yet"}{hero.tasksOpen > 0 ? ` · ${hero.tasksOpen} open` : ""}</span>
                  <StatusChip status={hero.status} />
                  <AgentDots names={hero.agents} agentsById={agentsById} />
                  <span>{ago(hero.updatedAt)}</span>
                </div>
                {hero.lastDecision && <div className="ws-last">↳ {hero.lastDecision}</div>}
              </div>
              <div className="ws-hero-act">
                <Btn variant="primary" className="ws-continue" onClick={() => openProject(hero)}>⟩ CONTINUE</Btn>
                <a className="chip chip-plain" style={{ textDecoration: "none" }} href={obsUri(hero.rel)}>open note</a>
              </div>
            </div>
          </div>

          <SectionRow label={`ALL PROJECTS · ${projects.length}`}>
            <Btn variant="primary" onClick={() => setCreating(true)}>＋ New project</Btn>
          </SectionRow>
          {rest.length
            ? <div className="ws-grid">{rest.map((p, i) => <ProjectCard key={p.rel} p={p} i={i} onOpen={openProject} agentsById={agentsById} />)}</div>
            : <Empty>One project so far — it's the hero above.</Empty>}

          {open && (
            <div style={{ marginTop: 18 }}>
              <ProjectPanel slug={open} agents={agents} agentsById={agentsById} onClose={() => setOpen(null)} refresh={refresh} />
            </div>
          )}
        </>
      )}

      <NewProjectModal open={creating} onClose={() => setCreating(false)} onCreated={slug => { setCreating(false); setOpen(slug); refresh(); }} />
    </section>
  );
}
