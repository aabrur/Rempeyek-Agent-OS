# Stage C — Today and Project Workspace Redesign Report

Date: 2026-07-13
Base commit: `4dbb2d7`
Branch: `codex/roadmap-continuation`

## Outcome

Stage C changes the default workspace from a project-card dashboard into a project-continuity surface. `Today` now takes its current project from `/api/today`, exposes one honest next action, and opens the relevant Tasks or Decisions destination in one click. Project detail is now a six-destination workspace: Overview, Tasks, Memory, Files, Decisions, and Activity.

The implementation preserves the Stage B structural theme system, existing API routes, approval confirmation, project creation, Obsidian links, decision logging, brief copying, and Tasks Inbox dispatch. No dependency, framework, Vault fixture, runtime configuration, or telemetry file was changed.

## Data-truth corrections

### Review closure: legacy decision contract

The server adapter now gives entries parsed from the legacy `decisions.md` shape an explicit `context` status. `buildTodayProjection()` uses an allow-list and considers only `unresolved` and `action-required` decisions actionable. Historical decisions remain present on `today.project.decisions` for the Decision context panel, but cannot become `unresolvedDecisions` or `nextAction` without an explicit actionable source. Regression coverage uses the actual legacy string-list adapter shape and separately proves the explicit `action-required` path.

### Current project authority

The previous hero used `projects[0]`, while `/api/today` independently filters completed/archived projects and selects the most recently active one. The new continuity hero uses only `today.project`, so the hero, next action, task context, decisions, and output cannot refer to different projects.

### Production recent-output contract

`todayProjectData()` sends `recentArtifacts`, but `buildTodayProjection()` previously read only `artifacts` or `files`. A red test reproduced the empty production projection. The projection now accepts `recentArtifacts` first and retains backward compatibility.

### Stable task order

The prior comparator returned `-1` for every same-priority pending task, which was non-transitive. Task ordering now compares priority, state rank, and stable task ID.

### No fabricated categories

- Tasks show full rows only when the open project owns the current `/api/today` task projection.
- Other projects show the real `tasksOpen` count and explain that task rows are not exposed.
- Memory shows the existing `detail.brief`, explicitly described as read-only resume context assembled from project Markdown.
- Files use only `detail.docs`.
- Decisions use only `detail.decisions` and the existing decision POST route.
- Activity displays an honest unavailable state and does not infer events from file timestamps.
- Decision records from the legacy adapter are labeled “Decision context,” not falsely claimed as unresolved.
- A missing next action is displayed as “No next action has been recorded.”

## Today redesign

### Project continuity hero

The hero is a compact continuity constellation with the current project as its center. Satellites are created only when the corresponding DTO field exists:

- Goal
- Next/open/blocked task
- Recent output
- Decision context
- Vault project record

Task and decision satellites open their real workspace destination. Output and Vault nodes open their real Obsidian path. There are no agent-flow, sync, system-health, or activity relationships.

The supporting strip reports only fields available in the approved sources: local Markdown source, project update, pending approvals, and assigned-agent count. The Stage C brief also requested system/Vault health, but `/api/today`, `/api/approvals`, project DTOs, project list data, and assignments do not expose health. Data truth therefore takes precedence; project metadata is not relabeled as health.

### Continue flow

`Continue <project>` opens the same project selected by Today and chooses the initial destination from `today.nextAction`:

- task → Tasks
- decision → Decisions
- no next action → Overview

This reaches the current next action in one interaction when the DTO supplies it.

### Approval queue

- Existing browser confirmation remains mandatory.
- Decision POST still includes `confirmed: true`.
- A single-flight guard prevents duplicate decision submission.
- Approval errors remain visible instead of being erased by the queue refresh.
- Raw process/gateway scope is no longer displayed in the Today card; consequence, target, and actor remain visible.
- Initial-load failures and approval-action failures are separate states. A failed approval is rendered beside the queue that owns it, with `Try again` and `Dismiss` recovery. A successful retry/decision or explicit dismissal clears the action error.

## Project Workspace

The previous 484-line workspace owner has been split along product boundaries rather than generic UI abstractions:

- `TodayContinuity.jsx` owns `/api/today`, approval state, continuity, context, and project cards.
- `ProjectWorkspace.jsx` owns project detail, tabs, resume dispatch, files, decisions, and activity states.
- `NewProjectModal.jsx` owns project creation.
- `Workspace.jsx` is now a 54-line composition and navigation owner.

### Overview

Shows goal, real progress, next action, assigned agents, and a functional composer. The composer does not claim to execute an agent: it accurately says that it adds the existing resume brief to the local Tasks Inbox.

### Tasks

Shows current-project unfinished task rows from `/api/today`. For any other project, it reports the true open count and an explicit limitation instead of generating rows.

### Memory

Shows the existing resume brief as read-only context. It does not claim semantic memory, live agent memory, or two-way Vault sync.

### Files

Shows the project files exposed by `detail.docs`, with real Obsidian links and timestamps.

### Decisions

Preserves decision logging. The input is retained when the request fails, submission is disabled while pending, and status is announced through an `aria-live` region.

### Activity

Shows an honest empty state because the production project detail route does not expose meaningful project events.

## Accessibility and interaction

- Six tabs use `tablist`, `tab`, `tabpanel`, `aria-selected`, roving `tabIndex`, and Arrow/Home/End navigation.
- Project focus moves into the opened workspace; smooth scrolling respects `prefers-reduced-motion`.
- The focus target is a semantic `<section>` labelled by the project workspace heading.
- Progress rails expose progressbar semantics and numeric values.
- New-project, decision, and agent assignment controls have associated labels.
- Approval actions use a named group.
- Async dispatch, decision, and copy feedback is announced.
- Agent color dots have hidden text and do not rely on color alone.
- Touched primary actions have a 44px minimum target.
- Overlay now supports `aria-labelledby`, traps Tab within the dialog, handles Escape, and restores focus.
- IME composition does not accidentally submit Enter-driven forms.

## Theme and responsive preservation

Stage C consumes Stage B semantic and structural tokens rather than defining a fifth theme layer.

- Minimalist uses an editorial rule-based hero and removes the inner boxed treatment.
- Brutalist uses square geometry, thick borders, hard shadow, and a black selected tab.
- Glassmorph uses the existing translucent surface and restrained inner highlight.
- Cyberpunk limits additional glow to the continuity core and focused interactive nodes.

Responsive layout is explicitly handled at 1000px, 768px, and 390px. The constellation collapses to a vertical relationship list, tabs remain horizontally reachable, forms stack to full width, action groups stop overflowing, and project files become narrow-screen rows.

## TDD evidence

The implementation used vertical red/green slices:

1. Production `recentArtifacts` test failed with an empty array, then passed after projection support.
2. Continuity-model import failed because the module did not exist, then passed after the minimal model.
3. Tab-key test failed because `projectTabFromKey` did not exist, then passed after keyboard selection was added.
4. Project task-ownership test failed because `tasksForProject` did not exist, then passed after scoped selection.
5. Stable same-priority ordering failed (`z-task` before `a-task`), then passed after comparator correction.
6. Blocked-task semantics failed with `Next task`, then passed with `Blocked task`.
7. The real legacy decision-list adapter test failed because history was marked unresolved, then passed after introducing the explicit `context` contract and actionable allow-list.
8. The explicit `action-required` decision test proves that genuine founder decisions still become the next action when no task is actionable.

## Files changed

- `apps/web/lib/today-projection.mjs`
- `apps/web/lib/workspace-view-model.mjs`
- `apps/web/src/views/Workspace.jsx`
- `apps/web/src/views/TodayContinuity.jsx`
- `apps/web/src/views/ProjectWorkspace.jsx`
- `apps/web/src/views/NewProjectModal.jsx`
- `apps/web/test/today-projection.test.mjs`
- `apps/web/test/workspace-view-model.test.mjs`
- `packages/design-system/src/index.css`
- `packages/theme-engine/src/themes.css`
- `packages/ui/src/index.jsx`
- `.superpowers/sdd/stage-c-report.md`

## Verification

- Focused Today projection tests: 7/7 passed.
- Full `npm test`: 44/44 passed, 0 failures.
- `npm run build`: passed; Vite transformed 58 modules.
- `git diff --check`: passed.
- Static UI contract: CSS braces balanced, all six tabpanels present, responsive gates present at 1000/768/390, no gateway/PID/schtasks/telemetry plumbing text in `Workspace.jsx`.

## Self-review and known concerns

- No package manifest or lockfile changed.
- No Obsidian Vault, telemetry runtime, agent config, gateway, or summon path changed.
- No fake health, activity, task row, relationship, timestamp, or sync claim was introduced.
- The existing browser harness does not include Playwright, jsdom, or React Testing Library. Starting the production server would activate gateway polling, daily bridge, memory capture, and runtime writes, which violates this task’s no-runtime-write constraint. Browser interaction and screenshot matrix verification therefore remain an explicit Stage F release gate.
- Required Stage F matrix: four themes at 1440×900, 1280×800, 768×1024, and 390×844; one-click Continue; approval confirm/cancel; tab keyboard/focus; reduced motion; dialog focus containment.
- Tabs are local React state rather than URL-deep-linked destinations. This is acceptable for the Stage C two-interaction workflow but remains a navigation enhancement for a later stage.

## Hypertaks compliance

- Tier and gate: Standard / Express.
- Roles produced: UX/data-truth auditor, test/accessibility auditor, frontend integrator.
- Engineering discipline: TDD, surgical changes, no new dependency, verification before completion.
- Browser connector was not available as a safe read-only harness for this runtime; no browser evidence is claimed.
