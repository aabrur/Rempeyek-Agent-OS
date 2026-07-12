import { useMemo, useState } from "react";
import { Btn, Empty, PageHead, SectionRow } from "@rempeyek/ui";
import { obsUri } from "../lib/obsidian";
import { buildContinuityModel } from "../../lib/workspace-view-model.mjs";
import { NewProjectModal } from "./NewProjectModal";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { ProjectCard, TodayContinuity, useTodayWorkspace } from "./TodayContinuity";

export function WorkspaceView({ projects = [], agents = [], agentsById = {}, refresh }) {
  const [openProject, setOpenProject] = useState(null);
  const [creating, setCreating] = useState(false);
  const {
    today,
    approvals,
    loadError,
    actionError,
    deciding,
    reload,
    decide,
    retryDecision,
    dismissActionError,
  } = useTodayWorkspace();
  const continuity = buildContinuityModel(today);
  const currentId = continuity.project?.id || continuity.project?.slug;
  const projectCards = useMemo(() => projects.filter(project => (project.id || project.slug) !== currentId), [projects, currentId]);

  const open = (project, tab = "overview") => {
    if (project.kind === "workspace") setOpenProject({ slug: project.slug, tab });
    else window.location.href = obsUri(project.rel);
  };

  return <section className="view active">
    <PageHead title="TODAY">Continue the current project from its local Markdown record.</PageHead>
    <TodayContinuity
      today={today}
      approvals={approvals}
      loadError={loadError}
      actionError={actionError}
      deciding={deciding}
      onReload={reload}
      onDecision={decide}
      onRetryDecision={retryDecision}
      onDismissActionError={dismissActionError}
      agentsById={agentsById}
      onContinue={open}
    />

    <SectionRow label={`PROJECTS · ${projects.length}`}><Btn variant="primary" onClick={() => setCreating(true)}>New project</Btn></SectionRow>
    {!projects.length ? <Empty>No projects yet. Create a workspace to preserve the goal, next action, decisions, and resume context.</Empty> : projectCards.length ? <div className="ws-grid">{projectCards.map((project, index) => <ProjectCard key={project.rel} project={project} index={index} onOpen={open} agentsById={agentsById} />)}</div> : <Empty>The current project is shown above.</Empty>}

    {openProject && <div className="project-workspace-wrap"><ProjectWorkspace slug={openProject.slug} initialTab={openProject.tab} agents={agents} agentsById={agentsById} today={today} onClose={() => setOpenProject(null)} refresh={refresh} /></div>}
    <NewProjectModal open={creating} onClose={() => setCreating(false)} onCreated={slug => { setCreating(false); setOpenProject({ slug, tab: "overview" }); refresh(); }} />
  </section>;
}
