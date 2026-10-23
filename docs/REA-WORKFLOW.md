# REA Investigation Workflow: Rempeyek Agent OS

Use [morluto/rea](https://github.com/morluto/rea) as an **optional local developer tool**, not a production dependency. Pin: `rea-agents@6.7.0`. No application runtime changes are required.

## 1. Register the coding agent once on the development machine

REA requires Node.js 22.19+, 24.11+, or 26+ and npm.

```powershell
npx -y rea-agents@6.7.0 setup --client hermes --client antigravity --client codex --dry-run
```

Review the plan and run the command again without `--dry-run` only for clients installed on the machine. Approve changes, restart the agent, then verify:

```powershell
npx -y rea-agents@6.7.0 doctor --json
```

The registration is local to the agent configuration. It must not be added to an application runtime, user installer, or deployment pipeline.

## 2. Static inspection

From the repository root:

```powershell
npm run build
node scripts/rea-inspect.mjs --dry-run
node scripts/rea-inspect.mjs
```

The default target is `apps/web/dist`. REA outputs a JSON evidence report under gitignored `.rea-reports/`. The runner does not build, launch, or modify the target. If a build is missing, it stops with an explicit error.

To inspect a packaged Electron artifact, use the existing desktop packaging command, locate the actual app.asar, then run node scripts/rea-inspect.mjs --target "C:\\actual\\path\\app.asar". Never guess the file's location or treat static inspection as runtime proof.

## 3. First investigation

**Question:** Does the compiled UI match the agent activity paths, and is the Electron preload/main/renderer boundary preserved in the actual packaged app?

Read these source paths with ordinary code tools before interpreting the bundle: apps/desktop/main.mjs, apps/desktop/preload.cjs, apps/desktop/server-process.mjs, apps/web/lib/supervisor/, apps/web/lib/agent-lifecycle.mjs, apps/web/src/

Give the agent this task:

```text
Read AGENTS.md, docs/REA-WORKFLOW.md and the current source.
Use REA MCP tools if available, or the local .rea-reports JSON
from scripts/rea-inspect.mjs. Investigate only the stated question.

Distinguish verified source facts, compiled-bundle evidence,
observed runtime behavior, and unproven hypotheses.
Cite relevant paths, module identifiers and evidence in findings.

Start read-only. Do not claim REA was executed if tools or
built artifacts are unavailable. Propose small changes only
where verified; implement them using normal coding tools.

Preserve: Obsidian Vault, agent lifecycle, permissions, release settings, and user data.
Run relevant existing tests and report only actual results.
Do not deploy or publish REA analysis outputs.
```

## Limits and data handling

REA static inspection cannot establish full live behavior, remote database correctness, or server-only business logic. Use controlled runtime observation separately when required. Reports can contain source excerpts or sensitive information: do not share raw reports publicly, do not paste secrets into AI prompts, and keep `.rea-reports/` outside Git.
