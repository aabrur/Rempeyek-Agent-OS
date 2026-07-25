import assert from "node:assert/strict";
import test from "node:test";

import {
  runSourceUpdate,
  sourceUpdateSteps,
} from "../lib/source-update.mjs";

test("source update uses fixed sequential commands and no shell", () => {
  assert.deepEqual(sourceUpdateSteps("C:\\repo", "win32"), [
    {
      program: "git",
      args: ["status", "--porcelain"],
      cwd: "C:\\repo",
      expectEmpty: true,
    },
    {
      program: "git",
      args: ["pull", "--ff-only"],
      cwd: "C:\\repo",
    },
    { program: "npm.cmd", args: ["ci"], cwd: "C:\\repo" },
    {
      program: "npm.cmd",
      args: ["run", "build"],
      cwd: "C:\\repo",
    },
  ]);
});

test("dirty checkout stops before pull", async () => {
  const calls = [];
  await assert.rejects(runSourceUpdate({
    root: "C:\\repo",
    platform: "win32",
    execFileImpl(program, args, options, callback) {
      calls.push({ program, args, options });
      callback(null, " M apps/web/server.js\n", "");
    },
    onLine: () => {},
  }), /working tree is not clean/);
  assert.equal(calls.length, 1);
  assert.equal(Object.hasOwn(calls[0].options, "shell"), false);
});

test("source update executes every fixed step in order", async () => {
  const calls = [];
  await runSourceUpdate({
    root: "/repo",
    platform: "linux",
    execFileImpl(program, args, options, callback) {
      calls.push({ program, args: [...args], options });
      callback(null, "", "");
    },
  });
  assert.deepEqual(
    calls.map(call => [call.program, call.args]),
    [
      ["git", ["status", "--porcelain"]],
      ["git", ["pull", "--ff-only"]],
      ["npm", ["ci"]],
      ["npm", ["run", "build"]],
    ],
  );
  assert.equal(calls.every(call => !Object.hasOwn(call.options, "shell")), true);
});
