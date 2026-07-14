import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPORT = fileURLToPath(new URL("../../../scripts/report.cjs", import.meta.url));

function run(args) {
  const dir = mkdtempSync(join(tmpdir(), "report-"));
  // report.cjs writes to <script>/../telemetry — so point it at an isolated ROOT via a copy is
  // overkill; instead we run it and read the real path it prints, scoped to a throwaway id.
  try {
    const out = execFileSync(process.execPath, [REPORT, ...args], { encoding: "utf8", env: { ...process.env } });
    const rel = out.match(/telemetry\/([\w-]+\.jsonl)/)?.[1];
    const file = join(REPORT, "..", "..", "telemetry", rel);
    const lines = readFileSync(file, "utf8").trim().split("\n");
    return JSON.parse(lines[lines.length - 1]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const TID = "test-report-" + Date.now();
after(() => { rmSync(join(REPORT, "..", "..", "telemetry", `${TID}.jsonl`), { force: true }); });

test("report.cjs infers task_start / task_progress / task_done from progress (backward compatible)", () => {
  assert.equal(run([TID, "Boot", "0"]).type, "task_start");
  assert.equal(run([TID, "Work", "55"]).type, "task_progress");
  assert.equal(run([TID, "Done", "100"]).type, "task_done");
  assert.equal(run([TID, "Note"]).type, "task_progress");   // no progress → progress event
});

test("report.cjs emits subagent_start / subagent_done via --type", () => {
  const start = run([TID, "vault-indexer", "--type", "subagent_start", "spawned by Stage 5"]);
  assert.equal(start.type, "subagent_start");
  assert.equal(start.name, "vault-indexer");
  assert.equal(start.detail, "spawned by Stage 5");
  assert.equal(run([TID, "vault-indexer", "--type", "subagent_done"]).type, "subagent_done");
});

test("report.cjs emits comm and info via --type", () => {
  assert.equal(run([TID, "handoff", "--type", "comm", "to openclaw"]).type, "comm");
  assert.equal(run([TID, "Registered", "--type", "info"]).type, "info");
});

test("report.cjs rejects an unknown --type", () => {
  assert.throws(() => run([TID, "x", "--type", "nonsense"]));
});
