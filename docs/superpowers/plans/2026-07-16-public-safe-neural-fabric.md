# Public-Safe Neural Fabric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make clean installations private by default and render every registered agent inside one evidence-honest neural constellation.

**Architecture:** Move path and child-environment decisions into small testable backend modules, then let `server.js` consume those boundaries without changing its API contract. Extend the existing pure Agent Map projection with deterministic decorative fabric geometry while keeping verified relationships as the only evidence rows; render the result with code-native SVG and existing Framer Motion primitives.

**Tech Stack:** Node.js ESM/CommonJS, React 18, Framer Motion 12, SVG/CSS, Vite, Node test runner.

## Global Constraints

- Preserve explicit `AGENTS_CONFIG` and `VAULT_PATH` overrides and never mutate the existing personal vault.
- Clean installations start with `agents: []` and use `+ Add Agent`.
- Never serialize secret values or pass the full dashboard environment to agent gateways.
- Neural fabric is decorative, non-interactive, absent from evidence counts, and hidden from assistive technology.
- Preserve four themes, keyboard navigation, 44 px controls, reduced motion, and verified live-flow gating.
- Do not ship generated raster art, personal screenshots, runtime avatars, telemetry, local config, vault data, or absolute personal paths.
- Do not rewrite Git history or force-push without separate approval.

---

### Task 1: Private per-user runtime boundary

**Files:**
- Create: `apps/web/lib/runtime-paths.cjs`
- Create: `apps/web/test/runtime-paths.test.mjs`
- Modify: `apps/web/server.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `resolveRuntimePaths({ env, root, home, platform, exists })` returning `{ stateRoot, configPath, vaultPath, telemetryDir, avatarDir, legacyConfig }`.
- Produces: `ensureEmptyConfig(configPath, { home, agency })` returning parsed config and creating its parent when absent.

- [ ] Write tests proving explicit paths win, an existing ignored repo config remains compatible, and a clean install resolves outside tracked source with an empty roster.
- [ ] Run `node --test apps/web/test/runtime-paths.test.mjs` and confirm failures because the module does not exist.
- [ ] Implement the minimal path resolver and empty-config bootstrap.
- [ ] Replace server constants and config loading with the resolver; create runtime directories lazily and serve `/avatars/*` from the resolved avatar directory.
- [ ] Re-run the focused test and existing server tests until green.

### Task 2: Gateway environment isolation

**Files:**
- Create: `apps/web/lib/child-env.cjs`
- Create: `apps/web/test/child-env.test.mjs`
- Modify: `apps/web/server.js`
- Modify: `apps/web/lib/agent-catalog.mjs`

**Interfaces:**
- Produces: `buildAgentEnv(agent, sourceEnv, workdir)` returning a new allowlisted environment object.
- Consumes: optional `agent.gateway.envAllow: string[]` plus a narrow built-in provider mapping.

- [ ] Write tests proving OS essentials and `AGENT_WORKDIR` are retained, unrelated API keys are removed, explicit variables are retained, and catalog defaults do not cross providers.
- [ ] Run `node --test apps/web/test/child-env.test.mjs` and confirm the expected module-not-found failure.
- [ ] Implement the minimal allowlist helper with immutable inputs.
- [ ] Use it for owned and terminal gateway spawns; document `envAllow` in the catalog/example schema.
- [ ] Re-run focused and server tests until green.

### Task 3: Empty public template and release audit

**Files:**
- Modify: `agents.config.example.json`
- Modify: `.env.example`
- Modify: `README.md`
- Create: `SECURITY.md`
- Create: `scripts/public-release-audit.mjs`
- Create: `apps/web/test/public-release.test.mjs`
- Modify: `package.json`
- Modify: `.npmignore`
- Modify: public documentation containing personal absolute paths
- Remove: tracked personal QA screenshots and obsolete raster design references

**Interfaces:**
- Produces: `npm run audit:public` with exit code 0 only when tracked/package content satisfies the public boundary.

- [ ] Write tests asserting the example roster is empty, required ignore rules exist, forbidden tracked roots are absent, and public text has no owner-specific absolute path.
- [ ] Run the focused test and confirm it fails on the current eight-agent example and personal paths.
- [ ] Empty the example, update onboarding/security docs, sanitize paths, and add package exclusions.
- [ ] Implement the audit script using `git ls-files`, package JSON inspection, and high-confidence secret/path patterns without printing secret values.
- [ ] Remove tracked personal raster evidence and update documentation references.
- [ ] Run the focused test, `npm run audit:public`, and `npm pack --dry-run` until all public-data assertions pass.

### Task 4: One connected neural constellation

**Files:**
- Modify: `apps/web/test/agent-map.test.mjs`
- Modify: `apps/web/lib/agent-map.mjs`
- Modify: `apps/web/src/components/TopologyMap.jsx`
- Modify: `packages/design-system/src/index.css`
- Modify: `packages/theme-engine/src/themes.css`

**Interfaces:**
- Extends `buildAgentMap()` output with `fabric: Array<{ id, source, target, path }>`.
- Keeps `edges`, `rows`, `metadata.edgeCount`, degree, components, and provenance unchanged.

- [ ] Generate and inspect one 16:9 reference image using the supplied Cyberpunk Cosmos resource as composition reference; keep it outside shipped runtime assets.
- [ ] Add model tests proving all nodes use one bounded orbit, formerly isolated Claude Code is not placed in a perimeter band, fabric is deterministic, and fabric does not alter evidence metadata.
- [ ] Run the Agent Map test and confirm the new assertions fail.
- [ ] Replace component-band/perimeter projection with a single deterministic visual focus and elliptical rings; compute stable nearest-neighbor fabric paths separately from verified edges.
- [ ] Render fabric below evidence edges as `aria-hidden`, then refine SVG background, central field, capsule hierarchy, and responsive rails using theme tokens and the existing Framer Motion dependency.
- [ ] Add no raster runtime asset; use SVG shapes for stars, dust, orbit guides, symbols, and fallback glyphs.
- [ ] Re-run Agent Map and full frontend tests until green.

### Task 5: End-to-end verification and release checkpoint

**Files:**
- Update only files required by failed verification.
- Generated locally: browser screenshots outside the npm package.
- Generated: `graphify-out/*` (ignored local knowledge graph).

**Interfaces:**
- Produces: verified clean tree ready for a normal commit/push; reports history rewrite separately.

- [ ] Run `npm test`, `npm run build`, `npm run audit:public`, `npm pack --dry-run`, `node --check apps/web/server.js`, and `git diff --check`.
- [ ] Start the dashboard on localhost and probe `/api/state`, `/api/procs`, and one available `/api/agent/<id>/detail` endpoint without exposing tokens.
- [ ] Capture desktop and mobile Cyberpunk screenshots; sanity-check Minimalist, Brutalist, Glassmorph, reduced motion, keyboard focus, console errors, and all eight agents in one fabric.
- [ ] Run `graphify update .` and report graph-health output.
- [ ] Review the staged diff for personal paths, secrets, vault data, runtime avatars, telemetry, and unrelated user changes.
- [ ] Create normal scoped commit(s) and push `main` only after all checks pass; do not rewrite history or force-push.
