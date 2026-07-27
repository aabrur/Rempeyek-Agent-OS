# Agent Launcher UI Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Add Agent reachable by scrolling, remove automatic browser redirects from registration, and create safe per-agent Windows launchers in the Rempeyek state root.

**Architecture:** The existing Marketplace adapters remain the only mechanism that installs upstream software. A small launcher writer creates a fixed `<stateRoot>\\<trigger>.cmd` wrapper after a reviewed or custom profile is registered. The UI only changes labels and scrolling in the existing visual system; the local checkout receives the same narrow changes but is committed locally only.

**Tech Stack:** React 18, Node.js CommonJS/ESM modules, existing Electron state-root contract, node:test.

## Global Constraints

- Preserve the existing Rempeyek visual tokens and component structure; no redesign.
- Never execute user-supplied install commands or use a shell for Marketplace adapters.
- Default launcher location is `%LOCALAPPDATA%\\Rempeyek-Agent-OS`; a supplied Home dir remains the agent working directory.
- A launcher must validate a bare trigger and must not claim that an unavailable upstream CLI is installed.
- Commit and push only `C:\\Users\\abrur\\Documents\\Rempeyek-Agent-Os`; commit the local workspace without pushing it.

---

### Task 1: Add a safe launcher writer

**Files:**
- Create: `apps/web/lib/agent-launcher.cjs`
- Create: `apps/web/test/agent-launcher.test.mjs`

**Interfaces:**
- Produces: `writeAgentLauncher({ stateRoot, trigger, workingDirectory, fsImpl }) -> { path, command } | null`
- Consumes: a state root and bare Marketplace/custom trigger.

- [x] **Step 1: Write failing tests** for a valid `codex` launcher, unsafe trigger rejection, and custom working-directory selection.
- [x] **Step 2: Run** `node --test apps/web/test/agent-launcher.test.mjs` and confirm the missing module fails.
- [x] **Step 3: Implement** a `.cmd` wrapper containing `cd /d`, `where`, an honest missing-CLI error, and a quoted trigger invocation.
- [x] **Step 4: Run** `node --test apps/web/test/agent-launcher.test.mjs` and confirm it passes.

### Task 2: Wire launchers into registration and Marketplace install

**Files:**
- Modify: `apps/web/server.js`
- Modify: `apps/web/lib/agent-catalog.mjs`
- Modify: `apps/web/lib/summon-profile.cjs`
- Modify: `apps/web/test/lifecycle-api.test.mjs`

**Interfaces:**
- Consumes: `writeAgentLauncher` from Task 1.
- Produces: a registered agent with `gateway.workdir` and a launcher at the runtime state root.

- [x] **Step 1: Write failing lifecycle assertions** proving custom registration uses the state root by default and creates its launcher.
- [x] **Step 2: Run** `node --test apps/web/test/lifecycle-api.test.mjs` and confirm the new assertion fails.
- [x] **Step 3: Implement** state-root workdir fallback, launcher creation after custom/reviewed registration, and summon cwd precedence `gateway.workdir -> state root -> legacy home`.
- [x] **Step 4: Run** `node --test apps/web/test/lifecycle-api.test.mjs apps/web/test/agent-launcher.test.mjs` and confirm both pass.

### Task 3: Make the existing UI honest and reachable

**Files:**
- Modify: `packages/design-system/src/index.css`
- Modify: `apps/web/src/components/AddAgentModal.jsx`
- Modify: `apps/web/src/components/CatalogGrid.jsx`
- Modify: `apps/web/src/components/Sidebar.jsx`

**Interfaces:**
- Consumes: existing `Overlay`, Marketplace actions, and sidebar navigation.
- Produces: a scrollable Add Agent overlay, non-redirecting launcher registration action, and the requested Trakteer control above Settings.

- [x] **Step 1: Add CSS/DOM assertions** to the focused UI tests or source-level test seam for overlay scroll, no `window.open` on register, and the Trakteer link.
- [x] **Step 2: Run** the focused tests and confirm the original behavior fails the new assertion.
- [x] **Step 3: Implement** `max-height`/vertical overflow on `.aa-box`, default-state-root form copy, a `Register launcher` action for adapterless agents, and a labelled Trakteer anchor directly above Settings.
- [x] **Step 4: Run** focused tests and `npm run build`.

### Task 4: Mirror the narrow changes and close safely

**Files:**
- Modify: matching Task 1-3 files in `C:\\Users\\abrur\\Rempeyek-Agent-Os`
- Modify: `checkpoint.md` in both workspaces

**Interfaces:**
- Consumes: validated public implementation.
- Produces: same launcher/scroll/Trakteer behavior in the local checkout, plus an explicit checkpoint of its non-pushed Git boundary.

- [x] **Step 1: Apply the same focused files** without rebasing, resetting, deleting, or staging the local packaged application folder.
- [x] **Step 2: Run** each repository's test command, production build, `git diff --check`, and Graphify update.
- [ ] **Step 3: Commit** public changes and push `main`; commit matching local changes without a push.

## Self-Review

- Scope coverage: scrolling, Marketplace registration behavior, state-root launcher, custom directory, Trakteer placement, two-workspace commit boundary, and verification each map to Tasks 1-4.
- No placeholders: the tasks name concrete files, interfaces, behavior, and commands.
- Interface consistency: every server call uses the Task 1 `writeAgentLauncher` contract, and workdir is a `gateway` property consumed by the summon profile.
