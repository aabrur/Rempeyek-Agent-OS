const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PROMPT_VERSION = 1;
const PROMPT_RELATIVE_PATH = "System/Operational Synchronization.md";
const TASK_RELATIVE_PATH = "Tasks/Inbox Tasks.md";

function registeredPrimaryAgents(config = {}) {
  return (Array.isArray(config.agents) ? config.agents : [])
    .filter(agent => agent && agent.kind !== "subagent" && agent.id && agent.name)
    .map(agent => ({
      id: String(agent.id),
      name: String(agent.name).replace(/[\r\n]+/g, " ").trim().slice(0, 100),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function renderOperationalSyncPrompt(template, {
  runtimeRoot,
  vaultPath,
  skillWarehouse,
} = {}) {
  const values = {
    "{{RUNTIME_ROOT}}": runtimeRoot,
    "{{VAULT_PATH}}": vaultPath,
    "{{SKILL_WAREHOUSE}}": skillWarehouse,
  };
  let rendered = String(template || "");
  for (const [token, value] of Object.entries(values)) {
    if (!value) throw new Error(`missing prompt value for ${token}`);
    rendered = rendered.replaceAll(token, String(value));
  }
  if (rendered.includes("{{")) {
    throw new Error("operational synchronization prompt has unresolved tokens");
  }
  return rendered.trim() + "\n";
}

function safeVaultPath(vaultPath, relativePath, pathImpl = path) {
  const root = pathImpl.resolve(vaultPath);
  const target = pathImpl.resolve(root, ...relativePath.split("/"));
  const relative = pathImpl.relative(root, target);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${pathImpl.sep}`) ||
    pathImpl.isAbsolute(relative)
  ) {
    throw new Error("synchronization path escapes the Vault");
  }
  return target;
}

function atomicReplace(filePath, content, {
  fsImpl = fs,
  pathImpl = path,
} = {}) {
  fsImpl.mkdirSync(pathImpl.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fsImpl.writeFileSync(temporary, content, "utf8");
    fsImpl.renameSync(temporary, filePath);
  } finally {
    try {
      if (fsImpl.existsSync(temporary)) fsImpl.unlinkSync(temporary);
    } catch {}
  }
}

function dispatchOperationalSyncPrompt({
  vaultPath,
  config,
  prompt,
  operationId,
  now = new Date(),
  fsImpl = fs,
  pathImpl = path,
} = {}) {
  const recipients = registeredPrimaryAgents(config);
  if (!recipients.length) throw new Error("no registered primary agents");

  const promptPath = safeVaultPath(
    vaultPath,
    PROMPT_RELATIVE_PATH,
    pathImpl,
  );
  const taskPath = safeVaultPath(vaultPath, TASK_RELATIVE_PATH, pathImpl);
  const lockPath = safeVaultPath(
    vaultPath,
    "System/.operational-synchronization.lock",
    pathImpl,
  );
  fsImpl.mkdirSync(pathImpl.dirname(lockPath), { recursive: true });

  let lock;
  try {
    lock = fsImpl.openSync(lockPath, "wx");
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error("synchronization dispatch is already in progress");
    }
    throw error;
  }

  const linesToAdd = [];
  try {
    atomicReplace(promptPath, prompt, { fsImpl, pathImpl });
    const date = new Date(now).toISOString().slice(0, 10);
    const header = "# Inbox Tasks\n\n> Tasks from the dashboard. Agents mark completed items with `[x]`.\n\n";
    const current = fsImpl.existsSync(taskPath)
      ? fsImpl.readFileSync(taskPath, "utf8").trimEnd() + "\n"
      : header;

    const opTag = operationId ? `<!-- opId:${operationId} --> ` : "";
    for (const agent of recipients) {
      const taskLine = `- [ ] ${opTag}Apply [[Operational Synchronization]] — ${agent.name} — ${date} · Read the shared contract, synchronize approved context, and report the acceptance gate.`;
      const isDuplicate = operationId
        ? (current.includes(`opId:${operationId}`) && current.includes(agent.name))
        : current.includes(taskLine);

      if (!isDuplicate) {
        linesToAdd.push(taskLine);
      }
    }

    if (linesToAdd.length > 0) {
      atomicReplace(taskPath, `${current}${linesToAdd.join("\n")}\n`, {
        fsImpl,
        pathImpl,
      });
    }
  } finally {
    try {
      if (lock !== undefined) fsImpl.closeSync(lock);
    } finally {
      try {
        if (fsImpl.existsSync(lockPath)) fsImpl.unlinkSync(lockPath);
      } catch {}
    }
  }

  return {
    ok: true,
    sent: linesToAdd.length,
    agentIds: recipients.map(agent => agent.id),
    promptRel: PROMPT_RELATIVE_PATH,
    taskRel: TASK_RELATIVE_PATH,
  };
}

module.exports = {
  PROMPT_RELATIVE_PATH,
  PROMPT_VERSION,
  TASK_RELATIVE_PATH,
  dispatchOperationalSyncPrompt,
  registeredPrimaryAgents,
  renderOperationalSyncPrompt,
};
