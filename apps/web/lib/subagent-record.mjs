import path from "node:path";

const PERMISSION_PROFILES = new Set(["read-only", "standard", "custom"]);
const MEMORY_POLICIES = new Set([
  "inherit-summaries",
  "isolated",
  "shared-project",
]);
const ACTIVATION_MODES = new Set(["manual", "cadence", "event"]);

function cleanText(value, maximum) {
  return String(value || "")
    .replace(/[\x00-\x1f\x7f]+/g, " ")
    .trim()
    .slice(0, maximum);
}

function cleanList(value, maximum = 64) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  return [...new Set(value
    .map(item => cleanText(item, maximum))
    .filter(Boolean))];
}

function slug(value) {
  return cleanText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isSafeRelativePath(value) {
  const candidate = cleanText(value, 260);
  if (
    !candidate ||
    path.posix.isAbsolute(candidate) ||
    path.win32.isAbsolute(candidate)
  ) {
    return false;
  }
  return !candidate
    .replace(/\\/g, "/")
    .split("/")
    .some(part => part === "..");
}

export function buildSubagentRecord(input = {}, context = {}) {
  const parent = context.parent;
  if (!parent) return { error: "primary parent agent was not found" };
  if (parent.kind === "subagent") {
    return { error: "subagents can only be created under a primary agent" };
  }

  const name = cleanText(input.name, 60);
  const domain = cleanText(input.domain, 120);
  const outcome = cleanText(input.outcome, 400);
  const workspaceScope = cleanText(input.workspaceScope, 120);
  if (!name) return { error: "name is required" };
  if (!domain) return { error: "domain is required" };
  if (!outcome) return { error: "outcome is required" };
  if (!workspaceScope) return { error: "workspaceScope is required" };

  const childSlug = slug(name);
  const id = `${parent.id}-${childSlug}`.slice(0, 64).replace(/-+$/g, "");
  if (!childSlug || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) {
    return { error: "name cannot produce a valid subagent id" };
  }
  if ((context.existingIds || []).includes(id)) {
    return { error: `agent '${id}' already exists` };
  }

  const permissionProfile = cleanText(
    input.permissionProfile || "standard",
    32,
  );
  if (!PERMISSION_PROFILES.has(permissionProfile)) {
    return { error: "permissionProfile is invalid" };
  }
  const memoryPolicy = cleanText(input.memoryPolicy || "isolated", 32);
  if (!MEMORY_POLICIES.has(memoryPolicy)) {
    return { error: "memoryPolicy is invalid" };
  }
  const activation = cleanText(input.activation || "manual", 32);
  if (!ACTIVATION_MODES.has(activation)) {
    return { error: "activation is invalid" };
  }

  const allowedPaths = cleanList(input.allowedPaths, 260);
  if (!allowedPaths || allowedPaths.some(value => !isSafeRelativePath(value))) {
    return { error: "each allowed path must be relative and cannot contain '..'" };
  }
  const toolIds = cleanList(input.toolIds);
  const skillIds = cleanList(input.skillIds);
  if (!toolIds || !skillIds) {
    return { error: "toolIds and skillIds must be arrays" };
  }

  const nodeNumbers = (context.existingNodeNums || [])
    .map(Number)
    .filter(Number.isFinite);
  const node = (nodeNumbers.length ? Math.max(...nodeNumbers) : 0) + 1;
  const parentLane = cleanText(parent.lane || parent.name || parent.id, 80)
    .replace(/[^A-Za-z0-9]/g, "");
  const childLane = name.replace(/[^A-Za-z0-9]/g, "");
  if (!parentLane || !childLane) {
    return { error: "parent lane and subagent name must contain letters or numbers" };
  }

  return {
    agent: {
      id,
      kind: "subagent",
      parentId: parent.id,
      name,
      domain,
      role: domain,
      outcome,
      workspaceScope,
      permissions: {
        profile: permissionProfile,
        allowedPaths,
      },
      memoryPolicy,
      activation,
      modelProvider: cleanText(input.modelProvider, 80),
      toolIds,
      skillIds,
      cadence: cleanText(input.cadence, 120),
      eventTrigger: cleanText(input.eventTrigger, 120),
      checkpointRule: cleanText(input.checkpointRule, 240),
      instructions: cleanText(input.instructions, 4000),
      node: `Node-${node}`,
      lane: `${parentLane}/Subagents/${childLane}`,
      enabled: true,
      createdAt: context.now || new Date().toISOString(),
    },
  };
}

export const ALLOWED_EVENT_TYPES = new Set([
  "session_start",
  "session_end",
  "process_start",
  "process_exit",
  "install_start",
  "install_progress",
  "install_done",
  "install_failed",
  "gateway_start",
  "gateway_stop",
  "gateway_restart",
  "gateway_status",
  "summon_start",
  "summon_ready",
  "summon_exit",
  "update_start",
  "update_progress",
  "update_done",
  "update_failed",
  "task_start",
  "task_progress",
  "task_done",
  "subagent_start",
  "subagent_done",
  "comm",
  "info",
]);

export function formatAgentTelemetry({ agentId = "", events = [] } = {}) {
  const tasks = events.filter(e => e.type && e.type.startsWith("task_"));
  const subagents = events.filter(e => e.type && e.type.startsWith("subagent_"));
  return {
    tasksState: tasks.length ? "active" : "Not reported by this agent",
    subagentsState: subagents.length ? "active" : "Not reported by this agent",
    tasks,
    subagents,
  };
}
