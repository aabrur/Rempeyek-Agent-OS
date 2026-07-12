export const PROJECT_TABS = ["overview", "tasks", "memory", "files", "decisions", "activity"];

export function projectTabFromKey(current, key) {
  const index = Math.max(0, PROJECT_TABS.indexOf(current));
  if (key === "Home") return PROJECT_TABS[0];
  if (key === "End") return PROJECT_TABS.at(-1);
  if (key === "ArrowRight" || key === "ArrowDown") return PROJECT_TABS[(index + 1) % PROJECT_TABS.length];
  if (key === "ArrowLeft" || key === "ArrowUp") return PROJECT_TABS[(index - 1 + PROJECT_TABS.length) % PROJECT_TABS.length];
  return current;
}

const valueOf = (entry, fields) => fields.map(field => entry?.[field]).find(value => typeof value === "string" && value.trim()) || "";

export function tasksForProject(detail, today) {
  const currentId = today?.project?.id || today?.project?.slug;
  return detail?.slug && detail.slug === currentId && Array.isArray(today?.unfinishedTasks)
    ? today.unfinishedTasks
    : [];
}

export function buildContinuityModel(today) {
  const project = today?.state === "ready" ? today.project : null;
  if (!project) return { project: null, items: [], initialTab: "overview" };

  const nextTask = today.nextAction?.type === "task" ? today.nextAction : null;
  const task = nextTask || (today.unfinishedTasks || [])[0];
  const artifact = (today.recentArtifacts || [])[0];
  const decision = (today.unresolvedDecisions || [])[0];
  const candidates = [
    { kind: "goal", label: "Goal", value: valueOf(project, ["goal"]) },
    { kind: "task", label: nextTask ? "Next task" : task?.status === "blocked" ? "Blocked task" : "Open task", value: valueOf(task, ["label", "title"]) },
    { kind: "artifact", label: "Recent output", value: valueOf(artifact, ["label", "path", "rel", "target"]), target: valueOf(artifact, ["path", "rel", "target"]) },
    { kind: "decision", label: "Decision context", value: valueOf(decision, ["text", "label"]) },
    { kind: "memory", label: "Vault record", value: valueOf(project, ["rel"]), target: valueOf(project, ["rel"]) },
  ];

  return {
    project,
    items: candidates.filter(item => item.value),
    initialTab: today.nextAction?.type === "task" ? "tasks" : today.nextAction?.type === "decision" ? "decisions" : "overview",
  };
}
