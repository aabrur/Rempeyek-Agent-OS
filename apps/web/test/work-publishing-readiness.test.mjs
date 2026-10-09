import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "server.js");
const src = fs.readFileSync(serverPath, "utf8");

async function terminateChild(child, stateRoot) {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once("exit", resolve));
    child.kill();
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
    if (child.exitCode === null) {
      try { child.kill("SIGKILL"); } catch {}
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))]);
    }
  }
  if (stateRoot) {
    fs.rmSync(stateRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

test("listen gate awaits work and publishing modules", () => {
  assert.match(src, /createHttpReadinessRegistry/);
  assert.match(src, /WORK_LIFECYCLE_MOD/);
  assert.match(src, /PUBLISHING_SCHEDULER_MOD/);
  assert.match(src, /SWITCHBOARD_MOD/);
  assert.match(src, /PROCESS_MANAGER_MOD/);
  assert.match(src, /whenHttpModulesReady/);
  assert.doesNotMatch(
    src,
    /Promise\.allSettled\(\[\s*AGENT_DETAIL,[\s\S]*SOURCE_UPDATE_MOD,\s*\]\)\.then\(\(\) => server\.listen/,
  );
});

async function forkReadyServer() {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rempeyek-ready-"));
  fs.writeFileSync(
    path.join(stateRoot, "agents.config.json"),
    JSON.stringify({ agency: "Ready", agents: [] }),
  );
  const child = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: "0",
      DASH_HOST: "127.0.0.1",
      AGENT_STATE_DIR: stateRoot,
      AGENTS_CONFIG: path.join(stateRoot, "agents.config.json"),
      VAULT_PATH: path.join(stateRoot, "Vault"),
    },
    silent: true,
  });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ready timeout")), 20000);
    child.on("message", message => {
      if (message?.type === "rempeyek:ready") {
        clearTimeout(timer);
        resolve(message);
      }
    });
    child.once("exit", code => {
      clearTimeout(timer);
      reject(new Error(`exited ${code}`));
    });
  });
  return { child, stateRoot, origin: `http://127.0.0.1:${ready.port}` };
}

test("after rempeyek:ready, work and social routes are not loading", async () => {
  const { child, stateRoot, origin } = await forkReadyServer();
  try {
    const workRes = await fetch(`${origin}/api/work/missions?projectId=x`);
    const workBody = await workRes.json();
    assert.notEqual(workBody.error, "work lifecycle store loading");
    assert.equal(workRes.status, 200);
    const socialRes = await fetch(`${origin}/api/social/campaigns?projectId=x`);
    const socialBody = await socialRes.json();
    assert.notEqual(socialBody.error, "publishing store loading");
    assert.equal(socialRes.status, 200);
  } finally {
    await terminateChild(child, stateRoot);
  }
});

test("20 clean startups never return work/social loading after ready", async () => {
  for (let i = 0; i < 20; i++) {
    const { child, stateRoot, origin } = await forkReadyServer();
    try {
      const work = await (await fetch(`${origin}/api/work/missions`)).json();
      const social = await (await fetch(`${origin}/api/social/campaigns`)).json();
      assert.notEqual(work.error, "work lifecycle store loading", `iter ${i}`);
      assert.notEqual(social.error, "publishing store loading", `iter ${i}`);
    } finally {
      await terminateChild(child, stateRoot);
    }
  }
});
