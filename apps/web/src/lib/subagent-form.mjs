const text = value => String(value || "").trim();

function list(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n,]/);
  return [...new Set(values.map(text).filter(Boolean))];
}

export function normalizeSubagentForm(form = {}) {
  return {
    name: text(form.name),
    domain: text(form.domain),
    outcome: text(form.outcome),
    workspaceScope: text(form.workspaceScope),
    permissionProfile: text(form.permissionProfile) || "standard",
    memoryPolicy: text(form.memoryPolicy) || "isolated",
    activation: text(form.activation) || "manual",
    modelProvider: text(form.modelProvider),
    allowedPaths: list(form.allowedPaths),
    toolIds: list(form.toolIds),
    skillIds: list(form.skillIds),
    cadence: text(form.cadence),
    eventTrigger: text(form.eventTrigger),
    checkpointRule: text(form.checkpointRule),
    instructions: text(form.instructions),
  };
}

export function validateSubagentForm(form = {}) {
  const normalized = normalizeSubagentForm(form);
  const errors = {};
  if (!normalized.name) errors.name = "Name is required";
  if (!normalized.domain) errors.domain = "Field/domain is required";
  if (!normalized.outcome) errors.outcome = "Concrete outcome is required";
  if (!normalized.workspaceScope) {
    errors.workspaceScope = "Workspace scope is required";
  }
  return errors;
}
