const priority = value => Number.isFinite(Number(value)) ? Number(value) : 999;
const time = value => Number.isFinite(Number(value)) && value !== null && value !== ""
  ? Number(value)
  : Number.isFinite(Date.parse(value || "")) ? Date.parse(value) : 0;
const taskState = status => status === "pending" ? 0 : status === "blocked" ? 2 : 1;
const ACTIONABLE_DECISION_STATES = new Set(["unresolved", "action-required"]);

export function buildTodayProjection(projects) {
  const active = [...(Array.isArray(projects) ? projects : [])]
    .filter(project => project && project.status !== "completed" && project.status !== "archived")
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || String(a.id).localeCompare(String(b.id)));
  const project = active[0] || null;
  if (!project) return { state: "empty", project: null, unfinishedTasks: [], unresolvedDecisions: [], recentArtifacts: [], nextAction: null };
  const unfinishedTasks = [...(project.tasks || [])]
    .filter(task => !["completed", "done", "cancelled"].includes(task.status))
    .sort((a, b) => priority(a.priority) - priority(b.priority) || taskState(a.status) - taskState(b.status) || String(a.id).localeCompare(String(b.id)));
  const unresolvedDecisions = (project.decisions || []).filter(decision => ACTIONABLE_DECISION_STATES.has(decision.status));
  const recentArtifacts = [...(project.recentArtifacts || project.artifacts || project.files || [])].sort((a, b) => time(b.updatedAt) - time(a.updatedAt)).slice(0, 8);
  const actionable = unfinishedTasks.find(task => task.status !== "blocked") || null;
  return {
    state: "ready",
    project,
    unfinishedTasks,
    unresolvedDecisions,
    recentArtifacts,
    nextAction: actionable ? { type: "task", taskId: actionable.id, label: actionable.title } : unresolvedDecisions[0] ? { type: "decision", decisionId: unresolvedDecisions[0].id, label: unresolvedDecisions[0].text } : null,
  };
}
