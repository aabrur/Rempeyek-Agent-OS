# Rempeyek Agent OS - Work OS Roadmap 2026

Status: implementation roadmap for the current repository
Date: 2026-08-17

## Product thesis

Rempeyek Agent OS is a durable work operating system. The primary citizen is WORK, not an individual agent.

Canonical statement:

> AGENTS CAN CHANGE. SESSIONS CAN END. TOOLS CAN CHANGE. MODELS CAN CHANGE. THE WORK CONTINUES.

The existing Project Workspace, Today, approval queue, agent lifecycle, Switchboard, Unified Memory, Neural Vault, Agent Map, Marketplace, recovery, migrations, desktop runtime, themes, reports, security boundaries, and managed processes remain part of the product. New capabilities must enter through the same Work Loop instead of creating parallel sources of truth.

## Canonical Work Loop

PROJECT
-> GOAL
-> MISSION
-> WORK CONTRACT
-> RUN
-> WORK UNIT
-> CAPABILITY RESOLUTION
-> WORKER
-> TOOL ACTION
-> ARTIFACT
-> EVIDENCE
-> VERIFICATION
-> APPROVAL WHEN REQUIRED
-> MEMORY
-> NEXT ACTION
-> CONTINUE

## Roadmap correction

The previous roadmap was directionally correct but too broad to execute as one undifferentiated refactor. The repository already contains durable configuration, approval lifecycle, Today continuity, Project Workspace, meaningful project activity ingestion, managed process records, truthful graph rules, recovery, migrations, and marketplace primitives.

The next roadmap therefore uses vertical slices. Each slice must extend the existing contracts and be independently testable.

## Goal A - Canonical durable Work domain

Objective: consolidate Mission, Work Contract, Run, Work Unit, Evidence, Verification, and bounded events around existing Project Workspace and Vault persistence.

Acceptance conditions:

- Mission transitions are deterministic and invalid transitions fail closed.
- Work Contract preserves requirements, constraints, acceptance criteria, capabilities, risk, retries, verification, approval, and budget.
- Run and Work Unit state survives restart.
- completion cannot be produced only by an agent saying done.
- Today reflects the durable next action.
- another compatible worker can resume bounded context.

## Goal B - Capability routing and authority

Objective: use capabilities as the routing vocabulary and keep INTENT, CAPABILITY, and AUTHORITY separate.

Required capability classes include repository operations, testing, research, media generation, communication, publishing, and connector operations.

Routing must consider:

- required capabilities
- worker enabled/available state
- runtime compatibility
- contract policy
- risk ceiling
- capability-specific evidence where available

No universal decorative trust score is required.

## Goal C - Evidence, verification, approval

Objective: make completion evidence-backed and external side effects authority-bound.

Approval remains authorization, not evidence that the action succeeded.

High-impact actions include deployment, credential changes, destructive operations, external publishing, financial operations, consequential email sending, and irreversible account actions.

Approvals must be scoped, auditable, expiring where appropriate, and single-use where replay would be unsafe.

## Goal D - Memory lifecycle and continuity

Objective: prevent append-everything memory from becoming operational truth.

Memory status vocabulary:

- ACTIVE
- SUPERSEDED
- INVALIDATED
- HISTORICAL
- UNVERIFIED

Retrieval prefers active validated context. Conflicts remain visible. Workers receive progressive bounded context rather than the entire Vault.

## Goal E - Social Distribution capability

Social publishing is added as a Work capability, not as a separate Social Media OS.

Canonical flow:

GOAL
-> MISSION
-> WORK CONTRACT
-> MASTER CONTENT
-> PLATFORM-NATIVE VARIANTS
-> MEDIA VARIANTS
-> PREFLIGHT
-> APPROVAL OR CONTRACT AUTHORITY
-> QUEUE
-> PLATFORM JOBS
-> EXTERNAL PUBLISHER ADAPTER
-> RECEIPTS
-> EVIDENCE
-> ANALYTICS
-> MEMORY
-> NEXT ACTION

### Core domain

A Social Campaign is bound to projectId and missionId. It owns:

- title
- objective
- target platforms
- master content
- platform-native variants
- schedule
- approval policy
- platform jobs
- receipts
- durable events

### Supported platform vocabulary

The initial built-in vocabulary is:

- Instagram
- YouTube
- LinkedIn
- TikTok
- Facebook
- Threads
- X
- Pinterest
- Bluesky
- Reddit
- Telegram
- Discord
- Google Business

WhatsApp is intentionally treated as messaging distribution, not as a public social-feed publisher.

### One idea, native outputs

The system must not implement literal copy-paste syndication as the product model.

Use:

ONE IDEA
-> PLATFORM-NATIVE VERSIONS
-> EVERYWHERE

Master content remains one source. Each platform receives its own variant and media specification.

### Partial failure contract

Publishing is a distributed side effect. Success on one platform must not be rolled back because another platform fails.

Example:

Instagram LIVE
Threads LIVE
LinkedIn LIVE
TikTok FAILED

Retry only the failed TikTok job. Preserve the successful external receipts and evidence.

### Durable receipt

Every publish attempt records:

- campaign id
- project id
- mission id
- run id where present
- job id
- platform
- attempts
- status
- external post id where available
- external URL where available
- provider receipt where safe
- bounded error

The receipt becomes evidence, not a fabricated success claim.

### Approval policy

Default for arbitrary external publishing is approval required.

A Work Contract may explicitly allow publishing within a reviewed bounded contract. This must be represented as contract authority, not inferred from content, prompts, web pages, tool output, or agent messages.

### Secret boundary

Workers should not receive social API secrets by default.

Credentials stay in the connector/publisher boundary. A worker receives the minimum publishing capability and non-secret identifiers needed for its Work Unit.

## Goal F - Today and Project Workspace integration

Today should answer:

- what should continue
- last verified result
- current blocker
- next useful action
- recommended worker and why
- whether founder approval is required

Project Workspace should expose actual Mission, Work Contract summary, work units, evidence, verification, approvals, artifacts, memory state, and meaningful activity without inventing missing data.

For Social Campaigns, Project Workspace should eventually expose campaign state and receipts as project evidence, not as an isolated marketing dashboard.

## Goal G - Switchboard, Neural Vault, Agent Map, Marketplace

Switchboard receives structured operational handoffs such as review_requested, verification_requested, dependency_ready, blocked, decision_required, result_available, and handoff.

Neural Vault shows provenance-backed relationships such as Mission -> produced -> Artifact and Artifact -> verified_by -> Evidence.

Agent Map renders only operational relationships backed by real source records.

Marketplace becomes capability supply. Social publisher providers can advertise capabilities such as social.publish.instagram or social.publish.youtube, but installation does not grant authority.

## Goal H - Paid product readiness

Rempeyek is intended to become a paid product. Commercial readiness is therefore a separate release gate, not mixed into core Work correctness.

Before paid distribution:

- license and third-party dependency inventory
- credential and tenant isolation review
- settings migration compatibility
- updater rollback strategy
- privacy documentation
- telemetry opt-in/opt-out contract
- billing entitlement boundary if introduced
- provider cost visibility
- supportable manual setup flow
- error reporting that does not leak secrets
- release signing and installer verification
- backup and restore test on representative user data

Do not add billing architecture until the core Work and publishing flows are proven.

## Implementation phases

### Phase 0 - Repository truth

Inspect AGENTS.md, CLAUDE.md, graph data, current tests, persistence, approval, Today, Workspace, Marketplace, Switchboard, recovery, and migrations. Current code is authoritative over stale reports.

### Phase 1 - Social publishing kernel

Status in this branch: implemented initial vertical slice.

Deliverables:

- social campaign contract
- deterministic campaign/job state machines
- platform-native variant contract
- durable file store using existing atomic JSON infrastructure
- approval-bound orchestrator
- partial-failure semantics
- publish receipt/evidence model
- focused Node tests

### Phase 2 - Runtime API wiring

Add bounded server routes for campaign create/prepare/approve/queue/run/status/receipt. Reuse the existing access policy, approval queue, runtime paths, error redaction, and mutation idempotency patterns.

No raw credential values may be returned to the UI.

### Phase 3 - Publisher adapters

Implement adapters behind a stable contract. Prefer official platform APIs or a reviewed unified publishing gateway. Provider-specific code must remain outside the Work domain.

Adapter capabilities:

- publish
- schedule where supported
- fetch status
- fetch analytics where supported
- normalize provider errors

### Phase 4 - Project integration

Bind campaign evidence and meaningful events to Project Workspace, Today, Work Units, and Switchboard.

### Phase 5 - UI

Add publishing controls only after the server contract is stable. Preserve existing themes and accessibility. Avoid a generic social dashboard. The main workflow remains Project/Today driven.

### Phase 6 - Continuity and recovery

Restart mid-campaign, reload durable campaign state, preserve successful receipts, retry only failed jobs, and verify no duplicate external publishing occurs from replay.

### Phase 7 - Provider and policy verification

Run provider sandbox/test-account checks. Record which actions require manual review, app verification, or platform audit.

### Phase 8 - Paid release gate

Only after the canonical Work Loop and Social Distribution workflow pass end-to-end verification.

## Manual founder work

The founder performs account-owner steps that cannot safely be automated:

- create or verify social platform developer applications
- OAuth consent and account authorization
- TikTok/YouTube/Meta/LinkedIn/X/Pinterest/Reddit provider review where required
- domain ownership verification
- choose and pay for any unified publishing provider
- enter production credentials into the supported secret boundary
- approve external publishing policies
- validate production brand accounts
- final legal/privacy/terms review for a paid release

The agent must not fake completion of these steps.

## Release success conditions

PASS requires evidence that:

- Work survives agent/session replacement
- state survives restart
- founder does not need to reconstruct context manually
- external publishing cannot bypass authority
- successful platform jobs are not duplicated by retries
- failed criteria prevent false Mission completion
- receipts are durable and provenance-backed
- memory supersession works
- Today remains truthful
- no existing major feature is removed
- full repository tests and build pass
- browser and desktop release gates pass where supported

If a required manual platform approval is missing, the code may be complete while production publishing remains BLOCKED BY FOUNDER SETUP. That state must be reported explicitly rather than called a software failure or a false PASS.
