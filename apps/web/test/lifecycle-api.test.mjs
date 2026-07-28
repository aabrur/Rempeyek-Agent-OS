import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createServer } = require("../server.js");

function fakeChild() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

async function withServer(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-api-"));
  const configPath = path.join(root, "agents.config.json");
  const vaultPath = path.join(root, "Vault");
  const telemetryDir = path.join(root, "telemetry");
  fs.mkdirSync(vaultPath, { recursive: true });
  fs.mkdirSync(telemetryDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      agency: "Test",
      activeAgentId: "codex",
      agents: [{
        id: "codex",
        kind: "agent",
        name: "Codex",
        role: "Coding agent",
        node: "Node-12",
        enabled: true,
        lane: "Codex",
        gateway: {
          marketplaceId: "codex",
          trigger: "codex",
          envAllow: ["OPENAI_API_KEY"],
        },
      }],
    }),
  );
  const launched = [];
  const launchOptions = [];
  const children = [];
  const server = createServer({
    configPath,
    stateRoot: root,
    vaultPath,
    telemetryDir,
    userHome: path.join(root, "home"),
    bundleRoot: path.resolve("marketplace", "bundles"),
    startResolvedProcess(spec, options) {
      launched.push(spec);
      launchOptions.push(options);
      const child = fakeChild();
      children.push(child);
      return child;
    },
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ base, root, vaultPath, telemetryDir, launched, launchOptions, children });
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function approve(base, type, target) {
  const requested = await fetch(`${base}/api/approvals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type,
      target,
      consequence: `${type} ${target}`,
      actor: "test",
    }),
  }).then(value => value.json());
  const decision = await fetch(`${base}/api/approvals/${requested.id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approved", confirmed: true }),
  });
  assert.equal(decision.status, 200);
  return requested.id;
}

async function mutation(base, url, {
  method = "POST",
  body,
  approvalId,
  confirmationId,
} = {}) {
  return fetch(`${base}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(approvalId ? { "x-approval-id": approvalId } : {}),
      ...(confirmationId ? { "x-confirmation-id": confirmationId } : {}),
    },
    body: JSON.stringify(body || {}),
  });
}

test("Marketplace response is redacted, aliased, and contains exactly 20 agents", async () => {
  await withServer(async ({ base }) => {
    for (const route of ["/api/marketplace", "/api/catalog"]) {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.schemaVersion, 1);
      assert.equal(body.entries.filter(entry => entry.kind === "agent").length, 20);
      assert.equal(JSON.stringify(body).includes("\"program\""), false);
      assert.equal(JSON.stringify(body).includes("\"package\""), false);
      assert.equal(JSON.stringify(body).includes("\"packageId\""), false);
    }
  });
});

test("activate and disable mutate only registry state and replay one operation id", async () => {
  await withServer(async ({ base }) => {
    const approvalId = await approve(base, "agent.disable", "codex");
    const disable = await mutation(base, "/api/agents/codex", {
      method: "PATCH",
      approvalId,
      body: { operationId: "disable-1", enabled: false },
    });
    assert.equal(disable.status, 200);
    const body = await disable.json();
    assert.equal(body.operationId, "disable-1");
    assert.equal(body.state.profile, "disabled");
    assert.equal(body.event.type, "agent.profile_updated");

    const replayApproval = await approve(base, "agent.disable", "codex");
    const replay = await mutation(base, "/api/agents/codex", {
      method: "PATCH",
      approvalId: replayApproval,
      body: { operationId: "disable-1", enabled: false },
    }).then(value => value.json());
    assert.equal(replay.replayed, true);

    const state = await fetch(`${base}/api/state`).then(value => value.json());
    assert.equal(state.activeAgentId, null);
    assert.equal(state.agents.find(agent => agent.id === "codex").enabled, false);

    const lifecycle = await fetch(`${base}/api/agents/lifecycle`).then(value => value.json());
    const codex = lifecycle.agents.find(agent => agent.id === "codex");
    assert.equal(codex.name, "Codex");
    assert.equal(codex.role, "Coding agent");
    assert.equal(codex.uninstallable, true);
  });
});

test("remove preserves runtime data and restore returns the same profile id", async () => {
  await withServer(async ({ base, vaultPath, telemetryDir }) => {
    const note = path.join(vaultPath, "Codex memory.md");
    const telemetry = path.join(telemetryDir, "codex.jsonl");
    fs.writeFileSync(note, "# retained\n");
    fs.writeFileSync(telemetry, "{\"type\":\"info\"}\n");

    const removeApproval = await approve(base, "agent.remove", "codex");
    const removedResponse = await mutation(base, "/api/agents/codex/remove", {
      approvalId: removeApproval,
      body: { operationId: "remove-1", detachChildren: false },
    });
    assert.equal(removedResponse.status, 200);
    const removed = await removedResponse.json();
    assert.deepEqual(removed.retained, [
      "vault",
      "telemetry",
      "activity",
      "workflows",
      "logs",
      "credentials",
      "software",
      "user-files",
    ]);
    assert.equal(fs.existsSync(note), true);
    assert.equal(fs.existsSync(telemetry), true);

    const wrongApproval = await approve(base, "agent.restore", "pi");
    const wrongRestore = await mutation(base, "/api/agents/pi/restore", {
      approvalId: wrongApproval,
      body: {
        operationId: "restore-wrong-profile",
        tombstoneId: removed.tombstone.id,
      },
    });
    assert.equal(wrongRestore.status, 409);
    const afterWrongRestore = await fetch(`${base}/api/state`).then(value => value.json());
    assert.equal(
      afterWrongRestore.agents.some(agent => agent.id === "codex"),
      false,
    );

    const restoreApproval = await approve(base, "agent.restore", "codex");
    const restoredResponse = await mutation(base, "/api/agents/codex/restore", {
      approvalId: restoreApproval,
      body: {
        operationId: "restore-1",
        tombstoneId: removed.tombstone.id,
      },
    });
    assert.equal(restoredResponse.status, 200);
    const restored = await restoredResponse.json();
    assert.equal(restored.state.id, "codex");
    assert.equal(restored.state.profile, "registered");

    const replayApproval = await approve(base, "agent.restore", "codex");
    const replay = await mutation(base, "/api/agents/codex/restore", {
      approvalId: replayApproval,
      body: {
        operationId: "restore-1",
        tombstoneId: removed.tombstone.id,
      },
    }).then(value => value.json());
    assert.equal(replay.replayed, true);
  });
});

test("uninstall requires two scoped approvals and launches only a reviewed adapter", async () => {
  await withServer(async ({ base, launched }) => {
    const firstOnly = await approve(base, "agent.uninstall", "codex");
    const denied = await mutation(base, "/api/agents/codex/uninstall", {
      approvalId: firstOnly,
      body: { operationId: "uninstall-denied", adapterId: "npm" },
    });
    assert.equal(denied.status, 403);
    assert.equal(launched.length, 0);

    const first = await approve(base, "agent.uninstall", "codex");
    const second = await approve(base, "agent.uninstall.confirm", "codex");
    const accepted = await mutation(base, "/api/agents/codex/uninstall", {
      approvalId: first,
      confirmationId: second,
      body: { operationId: "uninstall-1", adapterId: "npm" },
    });
    assert.equal(accepted.status, 202);
    assert.equal(launched.length, 1);
    assert.equal(launched[0].program, process.platform === "win32" ? "npm.cmd" : "npm");
    assert.deepEqual(launched[0].args, [
      "uninstall",
      "--global",
      "@openai/codex",
    ]);
    assert.equal(Object.hasOwn(launched[0], "shell"), false);

    const lifecycle = await fetch(`${base}/api/agents/lifecycle`).then(value => value.json());
    assert.equal(lifecycle.busy, true);
  });
});

test("agent install rejects executable input and can atomically register a reviewed profile", async () => {
  await withServer(async ({ base, launched, launchOptions, children, root }) => {
    const rejected = await mutation(base, "/api/marketplace/opencode/install", {
      body: {
        operationId: "install-rejected",
        adapterId: "npm",
        register: true,
        program: "powershell",
      },
    });
    assert.equal(rejected.status, 400);
    assert.equal(launched.length, 0);

    const approvalId = await approve(base, "agent.install", "opencode");
    const installed = await mutation(base, "/api/marketplace/opencode/install", {
      approvalId,
      body: {
        operationId: "install-opencode",
        adapterId: "npm",
        register: true,
      },
    });
    assert.equal(installed.status, 202);
    const body = await installed.json();
    assert.notEqual(body.state.profile, "registered");
    assert.equal(launched.length, 1);
    assert.deepEqual(launched[0].args, [
      "install",
      "--global",
      "opencode-ai",
    ]);
    assert.equal(launchOptions[0].visible, true);

    const beforeExit = JSON.parse(fs.readFileSync(path.join(root, "agents.config.json"), "utf8"));
    assert.equal(beforeExit.agents.some(agent => agent.id === "opencode"), false);
    children[0].emit("exit", 0);
    await new Promise(resolve => setImmediate(resolve));

    const state = await fetch(`${base}/api/state`).then(value => value.json());
    assert.equal(state.agents.some(agent => agent.id === "opencode"), true);
    const registered = state.agents.find(agent => agent.id === "opencode");
    assert.equal(registered.gateway, undefined);
    const config = JSON.parse(fs.readFileSync(path.join(root, "agents.config.json"), "utf8"));
    assert.equal(config.agents.find(agent => agent.id === "opencode").gateway.workdir, root);
    assert.equal(fs.existsSync(path.join(root, "opencode.cmd")), true);
  });
});

test("agent registration failure is contained and replayable after installer success", async () => {
  await withServer(async ({ base, children, root }) => {
    const approvalId = await approve(base, "agent.install", "opencode");
    const started = await mutation(base, "/api/marketplace/opencode/install", {
      approvalId,
      body: {
        operationId: "install-registration-failure",
        adapterId: "npm",
        register: true,
      },
    });
    assert.equal(started.status, 202);

    const configPath = path.join(root, "agents.config.json");
    const config = fs.readFileSync(configPath, "utf8");
    fs.writeFileSync(configPath, "{ invalid json", "utf8");
    children[0].emit("exit", 0);
    fs.writeFileSync(configPath, config, "utf8");
    await new Promise(resolve => setImmediate(resolve));

    const replayApproval = await approve(base, "agent.install", "opencode");
    const replay = await mutation(base, "/api/marketplace/opencode/install", {
      approvalId: replayApproval,
      body: {
        operationId: "install-registration-failure",
        adapterId: "npm",
        register: true,
      },
    });
    assert.equal(replay.status, 200);
    const body = await replay.json();
    assert.equal(body.event.type, "agent.install_registration_failed");
    assert.equal(body.error, "installer completed but agent registration failed");
    assert.equal(body.event.stage, "onExit");
  });
});

test("official-url adapters open setup guidance without spawning an invalid process", async () => {
  await withServer(async ({ base, launched, root }) => {
    const approvalId = await approve(base, "agent.install", "openhands");
    const response = await mutation(base, "/api/marketplace/openhands/install", {
      approvalId,
      body: {
        operationId: "install-openhands-manual",
        adapterId: "official-url",
        register: true,
      },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.event.type, "agent.manual_install_required");
    assert.match(body.event.url, /^https:\/\//);
    assert.equal(launched.length, 0);
    const config = JSON.parse(fs.readFileSync(path.join(root, "agents.config.json"), "utf8"));
    assert.equal(config.agents.some(agent => agent.id === "openhands"), false);
  });
});

test("Hypertaks installs only from the verified embedded bundle and uninstalls managed files", async () => {
  await withServer(async ({ base, root, launched }) => {
    const installApproval = await approve(base, "agent.install", "hypertaks-agent");
    const installed = await mutation(
      base,
      "/api/marketplace/hypertaks-agent/install",
      {
        approvalId: installApproval,
        body: {
          operationId: "install-hypertaks",
          adapterId: "agents-standard",
          register: false,
        },
      },
    );
    assert.equal(installed.status, 200);
    assert.equal(launched.length, 0);
    const plugin = path.join(root, "home", ".agents", "plugins", "hypertaks.json");
    const skill = path.join(root, "home", ".agents", "skills", "hypertaks", "SKILL.md");
    assert.equal(fs.existsSync(plugin), true);
    assert.equal(fs.existsSync(skill), true);

    const first = await approve(base, "agent.uninstall", "hypertaks-agent");
    const second = await approve(base, "agent.uninstall.confirm", "hypertaks-agent");
    const uninstalled = await mutation(
      base,
      "/api/agents/hypertaks-agent/uninstall",
      {
        approvalId: first,
        confirmationId: second,
        body: {
          operationId: "uninstall-hypertaks",
          adapterId: "agents-standard",
        },
      },
    );
    assert.equal(uninstalled.status, 200);
    assert.equal(fs.existsSync(plugin), false);
    assert.equal(fs.existsSync(skill), false);
  });
});

test("runtime settings patch and backup restore are atomic and recoverable", async () => {
  await withServer(async ({ base, root }) => {
    const initial = await fetch(`${base}/api/settings/runtime`);
    assert.equal(initial.status, 200);
    const initialBody = await initial.json();
    assert.equal(initialBody.settings.logRetentionDays, 30);
    assert.deepEqual(initialBody.providerVariables.map(item => item.name), [
      "OPENAI_API_KEY",
    ]);
    assert.equal(JSON.stringify(initialBody).includes(process.env.OPENAI_API_KEY || "never"), false);

    for (const [days, operation] of [[60, "settings-60"], [90, "settings-90"]]) {
      const approvalId = await approve(base, "settings.runtime", "runtime");
      const patched = await mutation(base, "/api/settings/runtime", {
        method: "PATCH",
        approvalId,
        body: {
          operationId: operation,
          logRetentionDays: days,
          anonymousTelemetry: false,
        },
      });
      assert.equal(patched.status, 200);
      assert.equal((await patched.json()).settings.logRetentionDays, days);
    }

    const restoreApproval = await approve(
      base,
      "settings.restore-backup",
      "registry",
    );
    const restored = await mutation(base, "/api/settings/restore-backup", {
      approvalId: restoreApproval,
      body: {
        operationId: "restore-settings-backup",
        agencyName: "Test",
      },
    });
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).settings.logRetentionDays, 60);
    const nextBackup = JSON.parse(
      fs.readFileSync(path.join(root, "agents.config.json.bak"), "utf8"),
    );
    assert.equal(nextBackup.settings.logRetentionDays, 90);
  });
});

test("Clear Logs requires the exact preview and diagnostics are downloadable and redacted", async () => {
  await withServer(async ({ base, root }) => {
    const logDir = path.join(root, "telemetry", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, "codex.log"), "one");
    fs.writeFileSync(path.join(logDir, "reviewer.log"), "two");

    const preview = await fetch(`${base}/api/settings/runtime`).then(value => value.json());
    assert.deepEqual(preview.logFiles, ["codex.log", "reviewer.log"]);

    const partialApproval = await approve(base, "settings.clear-logs", "owned-logs");
    const partial = await mutation(base, "/api/settings/clear-logs", {
      approvalId: partialApproval,
      body: { operationId: "clear-partial", names: ["codex.log"] },
    });
    assert.equal(partial.status, 409);
    assert.equal(fs.existsSync(path.join(logDir, "codex.log")), true);

    const approvalId = await approve(base, "settings.clear-logs", "owned-logs");
    const cleared = await mutation(base, "/api/settings/clear-logs", {
      approvalId,
      body: { operationId: "clear-exact", names: preview.logFiles },
    });
    assert.equal(cleared.status, 200);
    assert.deepEqual((await cleared.json()).removed, preview.logFiles);

    const diagnostics = await fetch(`${base}/api/diagnostics`);
    assert.equal(diagnostics.status, 200);
    assert.match(
      diagnostics.headers.get("content-disposition"),
      /attachment; filename="rempeyek-diagnostics\.json"/,
    );
    const diagnosticsText = await diagnostics.text();
    assert.equal(diagnosticsText.includes(process.env.OPENAI_API_KEY || "never"), false);
    assert.equal(diagnosticsText.includes(os.homedir()), false);
  });
});

test("creates a primary-bound subagent without inventing telemetry", async () => {
  await withServer(async ({ base, vaultPath, telemetryDir }) => {
    const approvalId = await approve(base, "subagent.create", "codex");
    const response = await mutation(base, "/api/agents/codex/subagents", {
      approvalId,
      body: {
        operationId: "subagent-security-reviewer",
        name: "Security Reviewer",
        domain: "Application security",
        outcome: "Review changed code and report actionable findings",
        workspaceScope: "current-project",
      },
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.agent.id, "codex-security-reviewer");
    assert.equal(created.agent.parentId, "codex");
    assert.deepEqual(created.event, {
      type: "subagent.created",
      agentId: "codex-security-reviewer",
      parentId: "codex",
    });

    const detail = await fetch(`${base}/api/agent/codex/detail`).then(value => value.json());
    assert.deepEqual(
      detail.configuredSubagents.map(agent => agent.id),
      ["codex-security-reviewer"],
    );
    assert.deepEqual(detail.activity.subagents, []);

    const topology = await fetch(`${base}/api/agent-topology`).then(value => value.json());
    const relation = topology.edges.find(edge => edge.type === "spawned_subagent");
    assert.deepEqual(relation, {
      source: "codex",
      target: "codex-security-reviewer",
      type: "spawned_subagent",
      provenance: {
        source: "subagent",
        id: "registry:codex:codex-security-reviewer",
      },
      status: "configured",
      flowing: false,
    });
    assert.equal(
      fs.existsSync(path.join(
        vaultPath,
        "Brains",
        "Codex",
        "Subagents",
        "SecurityReviewer",
        "Identity.md",
      )),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(telemetryDir, "codex-security-reviewer.jsonl")),
      false,
    );
  });
});
