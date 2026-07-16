import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildAgentEnv } = require("../lib/child-env.cjs");

const source = {
  PATH: "C:\\Windows\\System32",
  PATHEXT: ".COM;.EXE;.CMD",
  SystemRoot: "C:\\Windows",
  TEMP: "C:\\Temp",
  LOCALAPPDATA: "C:\\Users\\owner\\AppData\\Local",
  DASH_TOKEN: "dashboard-secret",
  GEMINI_API_KEY: "gemini-secret",
  OPENAI_API_KEY: "openai-secret",
  ANTHROPIC_API_KEY: "anthropic-secret",
  CUSTOM_PROVIDER_TOKEN: "custom-secret",
};

test("gateway environment retains OS essentials but removes dashboard and unrelated secrets", () => {
  const result = buildAgentEnv({ id: "codex", gateway: {} }, source, "C:\\work");
  assert.equal(result.PATH, source.PATH);
  assert.equal(result.SystemRoot, source.SystemRoot);
  assert.equal(result.AGENT_WORKDIR, "C:\\work");
  assert.equal(result.OPENAI_API_KEY, source.OPENAI_API_KEY);
  assert.equal(result.GEMINI_API_KEY, undefined);
  assert.equal(result.ANTHROPIC_API_KEY, undefined);
  assert.equal(result.DASH_TOKEN, undefined);
});

test("catalog compatibility mapping does not cross providers", () => {
  const claude = buildAgentEnv({ id: "claude-code", gateway: {} }, source, "C:\\work");
  const antigravity = buildAgentEnv({ id: "antigravity", gateway: {} }, source, "C:\\work");
  assert.equal(claude.ANTHROPIC_API_KEY, source.ANTHROPIC_API_KEY);
  assert.equal(claude.OPENAI_API_KEY, undefined);
  assert.equal(antigravity.GEMINI_API_KEY, source.GEMINI_API_KEY);
  assert.equal(antigravity.OPENAI_API_KEY, undefined);
});

test("explicit envAllow adds only named variables without mutating the source", () => {
  const before = { ...source };
  const result = buildAgentEnv({ id: "custom", gateway: { envAllow: ["CUSTOM_PROVIDER_TOKEN", "DASH_TOKEN", "bad-name"] } }, source, "D:\\agent");
  assert.equal(result.CUSTOM_PROVIDER_TOKEN, source.CUSTOM_PROVIDER_TOKEN);
  assert.equal(result.DASH_TOKEN, undefined);
  assert.equal(result["bad-name"], undefined);
  assert.deepEqual(source, before);
});
