# Supervisor V1

Supervisor is a destination in the existing dashboard. Rempeyek owns scheduling,
approvals, process ownership, durable state, Git evidence, and the final handoff.
Providers propose plans and implement or review scoped work. A provider response
cannot independently approve a task or mark it verified.

## Operation

1. Open **Supervisor** and select a project or an absolute local Git repository.
2. Enter the objective. Choose one worker, implementation with review, or a
   dependency-aware parallel plan. Use automatic assignments or select providers.
3. The repository must have a committed baseline and no uncommitted changes.
   Supervisor never commits, resets, cleans, or overwrites the source checkout.
4. For review/parallel workflows, HEAD proposes structured work units. The kernel
   rejects cycles, duplicate IDs, unsafe paths, and overlapping ownership without
   dependency ordering. Single-worker mode assigns the repository to one BODY.
5. Approve the displayed local scope and file ownership. This approval authorizes
   work in managed checkouts and integration into a separate managed checkout.
   It does not authorize push, deployment, publishing, spending, or production writes.
6. Follow work units, provider events, actual changed files, findings, and artifacts.
   Pause stops future dispatch; active workers may finish. Cancel stops owned
   processes and preserves their output and worktrees.
7. `READY_FOR_QA` means implementation was collected, with independent verification
   still `NOT_RUN`. The source checkout is unchanged. The handoff identifies the
   integration worktree for independent QA and a separately authorized application
   of its changes.

## Components

| File | Responsibility |
| --- | --- |
| `apps/web/lib/supervisor/controller.mjs` | Run lifecycle, scheduling, approvals, repair, durable state, lifecycle records, evidence and handoffs |
| `apps/web/lib/supervisor/planner.mjs` | Plan validation, ownership/dependency rules, role selection and scoped provider prompts |
| `apps/web/lib/supervisor/providers.mjs` | CLI discovery, capability gates, bounded process output, authentication signals, cooldowns and owned process cancellation |
| `apps/web/lib/supervisor/worktrees.mjs` | Baseline inspection, isolated checkouts, temporary-index snapshots, binary patches and integration conflict reporting |
| `apps/web/lib/supervisor/routes.mjs` | Bounded JSON requests and Supervisor HTTP routes after application access checks |
| `apps/web/src/views/SupervisorView.jsx` | Task composer, provider settings, approvals, controls, results and artifact previews |
| `apps/web/src/views/supervisor.css` | Responsive layout using existing theme tokens |

The existing `server.js` composes the service and includes its shutdown path.
Existing child-environment and Windows launcher helpers are reused. Supervisor
uses a dedicated process owner because its stdin prompts, JSONL results, output
redaction, and bounded capture differ from long-lived gateway service processes.
The existing Work store receives Mission, Contract, Run, WorkUnit, Evidence and
Handoff records. Supervisor state is the authoritative recovery record; canonical
Work records are projections, and final runs remain `VERIFYING` rather than
`COMPLETED` while QA is pending.

## API

All routes share the application server, access policy and authentication.
Mutation requests require JSON and are limited to 32 KB. The browser does not
automatically retry mutations after a transport error. Inspect task history before
resubmitting an objective whose response was lost.

| Method | Route | Result |
| --- | --- | --- |
| GET | `/api/supervisor/providers` | Discovered providers and observed capacity |
| GET | `/api/supervisor/config` | Projects, limits and operational restrictions |
| POST / GET | `/api/supervisor/runs` | Create a task / list durable tasks |
| GET | `/api/supervisor/runs/:id` | Full run state |
| GET | `/api/supervisor/runs/:id/events` | Bounded recent event history |
| GET | `/api/supervisor/runs/:id/artifacts` | Artifact references |
| GET | `/api/supervisor/runs/:id/artifacts/:artifactId` | Read-only, scoped artifact content |
| POST | `/api/supervisor/runs/:id/pause` | Pause dispatch |
| POST | `/api/supervisor/runs/:id/resume` | Explicit continuation, with reconciliation for interrupted work |
| POST | `/api/supervisor/runs/:id/cancel` | Cancel owned workers and retain results |
| POST | `/api/supervisor/runs/:id/reassign` | Explicitly change an eligible role assignment |
| POST | `/api/supervisor/runs/:id/approval` | Approve or reject the displayed local execution scope |
| POST | `/api/supervisor/providers/:id/config` | Set availability, concurrency or executable location |

Task creation accepts `objective`, `projectId`, `repositoryPath`, `mode`
(`AUTO`/`MANUAL`), `executionMode` (`single`/`review`/`parallel`), `assignments`,
`locks` and `maxConcurrency`. A manual switch preserves a role lock; automatic
selection cannot override it. Provider settings do not bypass capability or
authentication gates.

## State and bounds

Private Supervisor records, provider metadata, artifacts and managed checkouts
live below the runtime `Supervisor` directory. On a normal Windows installation
this is `%LOCALAPPDATA%/Rempeyek-Agent-OS/Supervisor`. They are outside packaged
resources and the repository. The Electron resource filter already includes
`apps/web/lib/**`, including these backend modules.

An exclusive PID ownership record prevents concurrent servers from writing the
same Supervisor state. After restart, interrupted runs require a human decision.
Unknown process ownership is not evidence of completion and never authorizes
killing an inherited PID. Provider cooldowns and manual settings survive restart.
Uncertain execution is not automatically replayed. Only an explicit native quota
failure before tools run, combined with no observed workspace changes, may retry
automatically within the retry budget.

Limits: 3 simultaneous workers globally, 1 to 3 per run, at most 12 planned units,
3 attempts per unit, 2 repair rounds, 20 open runs, and 200 retained runs. Dispatch
waits if free memory is below 512 MB. Worker processes have timeouts. Git operations
are asynchronous, have a 120-second deadline and a 2 MiB output bound. Artifacts
are bounded and redacted; retained worktrees remain the authoritative file output.
The dashboard shows a bounded recent event window, not an unlimited audit stream.

## Deliberate boundaries and remaining acceptance work

- Quota remains `UNKNOWN` when the provider offers no verified account signal.
  A cooldown inferred from a native rate-limit error is scheduling policy, not a
  claim about the account's actual remaining subscription allowance.
- Installed software does not imply usable execution. Capability diagnostics
  explain missing authentication, unsupported interfaces and isolation restrictions.
- Git worktrees isolate changes, not operating-system access. Provider-native
  restrictions are required; unrestricted provider modes are never used.
- Symlinks, junctions and submodules in worker snapshots fail closed. Windows is
  the initial execution environment. WSL requires a separately reviewed adapter;
  this implementation does not silently translate paths or switch environments.
- Dependency snapshots carry upstream changes forward. Repair rebuilds downstream
  work when needed. A conflict-free integration does not prove semantic compatibility.
- Review output is advisory and structured. Model claims about successful tests
  never become verified test evidence.
- No automated test suites, browser E2E, stress tests, security audit, or live model
  execution were part of this implementation assignment. Build and startup evidence
  must be read separately from independent QA acceptance.

The independent QA assignment should exercise all provider capability and auth
states, scoped permissions and external-action denial, quota switching, concurrent
ownership and DAG dependencies, binary/untracked/rename/deletion patches, repair
limits, cancellation and process descendants, interrupted writes, stale/reused PID
recovery, approval expiration, artifact path access, all themes/mobile widths,
packaged Electron startup, and complete one-/two-/three-provider workflows. Use
disposable repositories and explicitly authorized provider calls for that phase.

## Implementation handoff: 9 October 2026

Implementation status: **PARTIAL**. The dashboard and orchestration code are
integrated, but execution with Grok Build and Antigravity remains disabled by
capability gates. Both installed binaries expose noninteractive interfaces; this
implementation does not yet have a verified filesystem, network, MCP and hook
isolation policy for them. Their authentication is reported as unknown. Completing
those provider policies is implementation work, not merely a deferred QA verdict.

Codex was detected and `codex login status` confirmed authentication. The live
Supervisor endpoint reported Codex `AVAILABLE`, Grok Build `UNAVAILABLE` and
Antigravity `UNAVAILABLE`. Codex CLI discovery confirmed the native sandbox flags,
and native feature inspection confirmed that hooks and plugins can be disabled.
Project `.codex/config.toml` files are rejected before execution because their
tool policy cannot be safely assumed. No live coding-agent task was dispatched.

Observed startup evidence:

- `npm.cmd run build`: exit 0; Vite produced the dashboard bundle.
- `node --check` accepted the server and Supervisor modules; the controller and
  router imports loaded successfully.
- `$env:PORT='4321'; node apps/web/server.js`: announced the app at
  `http://localhost:4321`. The observed listener was Node PID `20848`.
- Dashboard `/`, `/api/state`, `/api/procs`, `/api/supervisor/config`,
  `/api/supervisor/providers` and `/api/supervisor/runs` returned HTTP 200.
- No projects or prior Supervisor runs were present in the observed API response.
  A repository can be entered directly in the composer.
- `graphify update .` rebuilt the AST graph. No semantic labeling was requested.

Operational status: **STARTED**. Independent QA: **PENDING**. Runtime outcomes,
cross-provider switching, process cancellation, crash recovery, visual acceptance
and Electron packaging have not been exercised end to end. The active repository
branch was `main`; no source commit or push was made. Existing unrelated Vault
changes were preserved.
