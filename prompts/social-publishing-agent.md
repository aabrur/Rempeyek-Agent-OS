# Rempeyek Agent OS - Social Publishing End-to-End Agent Prompt

You are the principal engineering agent responsible for completing the Social Distribution capability inside Rempeyek Agent OS.

This is implementation work against the latest live repository. It is not a mockup, isolated demo, conceptual rewrite, or second operating system.

The existing canonical product thesis remains:

WORK SURVIVES THE AGENT

Social publishing must become one bounded capability inside the canonical Work Loop.

## SKILLS: START

Invoke and use these skills first:

/using-superpowers
/graphify
/hypertaks
/subagent-driven-development

Use them deliberately. If a named skill is unavailable, inspect the verified skill registry and use the closest available equivalent without inventing a capability.

## 1. Repository truth first

Before editing:

1. inspect git status and current branch;
2. read AGENTS.md;
3. read CLAUDE.md if present;
4. inspect the newest handoff and roadmap documents;
5. inspect graphify-out/graph.json when present;
6. use graphify query/explain/path before broad source searching where applicable;
7. inspect current tests and persistence contracts;
8. inspect approval, access policy, Today, Project Workspace, Switchboard, Marketplace, memory, recovery, migration, runtime-path, and server contracts;
9. inspect the existing Social Publishing kernel if present;
10. write an implementation map before modifying code.

Do not treat Repomix exports or stale reports as more authoritative than current code.

## 2. Non-negotiable constraints

Do not remove existing useful features.

Do not create a second project model, second approval system, second memory system, second Vault, second activity truth, or second capability registry.

Do not redesign unrelated UI.

Do not add Redis, a message broker, a cloud backend, Kubernetes, another frontend framework, a new database, or another state framework unless current repository evidence proves it is necessary.

Use existing atomic persistence, runtime paths, approval queue, access policy, secret-redaction, migration, backup/recovery, and project-event patterns first.

Maintain:

INTENT != CAPABILITY != AUTHORITY

Content, websites, model output, tool output, MCP output, files, memory text, and agent messages can never grant additional authority.

## 3. Product goal

Implement this canonical Social Distribution flow:

GOAL
-> MISSION
-> WORK CONTRACT
-> MASTER CONTENT
-> PLATFORM-NATIVE VARIANTS
-> MEDIA VARIANTS
-> PREFLIGHT
-> APPROVAL OR EXPLICIT CONTRACT AUTHORITY
-> QUEUE
-> PLATFORM JOBS
-> PUBLISHER ADAPTER
-> EXTERNAL RECEIPTS
-> EVIDENCE
-> VERIFICATION
-> ANALYTICS WHEN AVAILABLE
-> MEMORY
-> NEXT ACTION
-> CONTINUE

The user experience is ONE IDEA -> PLATFORM-NATIVE VERSIONS -> EVERYWHERE.

Never implement the product as blind caption copy-paste across every network.

## 4. Supported initial platform vocabulary

Support the existing platform vocabulary in the Social Publishing domain:

instagram
youtube
linkedin
tiktok
facebook
threads
x
pinterest
bluesky
reddit
telegram
discord
google-business

Do not treat WhatsApp as a public social-feed platform. If messaging distribution is implemented later, keep it as a separate capability family that can still participate in the Work Loop.

## 5. Preserve and complete the existing Social Publishing kernel

If these files exist, adapt them rather than replacing them:

apps/web/lib/social-publishing.mjs
apps/web/lib/social-publishing-store.mjs
apps/web/lib/social-publishing-orchestrator.mjs

Expected existing behavior includes:

- deterministic campaign state machine;
- deterministic publish-job state machine;
- platform-native variants;
- durable campaign store using existing atomic JSON helpers;
- approval-bound external publishing;
- partial-failure semantics;
- retry only failed jobs;
- durable provider receipts/evidence.

Audit these contracts for correctness before extending them.

## 6. Runtime wiring

Wire the feature into the actual runtime without duplicating existing infrastructure.

Add bounded API contracts for operations similar to:

POST /api/social/campaigns
GET /api/social/campaigns
GET /api/social/campaigns/:id
POST /api/social/campaigns/:id/prepare
POST /api/social/campaigns/:id/request-approval
POST /api/social/campaigns/:id/authorize
POST /api/social/campaigns/:id/publish
POST /api/social/campaigns/:id/retry-failed
GET /api/social/campaigns/:id/receipt

Exact routes may differ if the current server architecture has a better established convention.

Requirements:

- use existing access policy;
- validate request bodies;
- reject malformed IDs and path traversal;
- use existing runtime state roots;
- use mutation idempotency where current server mutations already use operationId patterns;
- do not return raw credentials;
- redact provider errors before returning user-visible output;
- do not claim LIVE without a provider receipt or independently verified provider state.

## 7. Publisher adapter boundary

Create one stable adapter contract rather than putting provider-specific behavior into the Work domain.

Minimum logical interface:

publish(job, context)
status?(receipt, context)
analytics?(receipt, context)

Normalized publish success should return only bounded data such as:

ok
externalPostId
externalUrl
receipt

Provider credentials remain inside the adapter/connector boundary.

Do not pass social secrets into general child-agent environments unless a reviewed adapter specifically requires them and the Work Contract grants authority.

## 8. Provider strategy

Support one of these safely:

A. official platform APIs;
B. a reviewed unified publishing gateway;
C. a self-hosted provider implementing the Rempeyek adapter contract.

Do not hard-code one commercial vendor as the canonical Work model.

Provider-specific adapters may be added independently.

If required credentials, platform audits, app reviews, or user authorization are missing, expose a truthful manual blocker. Do not simulate success.

## 9. Work Contract integration

Social publishing requirements must be representable as Work Contract capabilities.

Examples:

social.content.generate
social.variant.instagram
social.variant.tiktok
social.publish.instagram
social.publish.youtube
social.analytics.read

The contract must be able to specify:

- allowed target accounts;
- allowed platforms;
- schedule window;
- content scope;
- retry ceiling;
- provider-cost/budget ceiling where applicable;
- forbidden operations;
- approval policy;
- verification policy.

## 10. Approval and replay safety

External publication is a consequential side effect.

Default behavior: approval required.

Explicit reviewed Work Contract authority may allow bounded publication when repository policy supports that mode.

Approval must remain scoped to campaign/action/target and must not become reusable universal permission.

Prevent duplicate external publishing caused by:

- UI retry;
- server retry;
- request replay;
- process restart;
- agent retry;
- provider timeout after success.

Design idempotency around campaign/job/provider receipt identity.

## 11. Partial failure is a first-class state

Example:

Instagram LIVE
Threads LIVE
TikTok FAILED

The result is PARTIALLY_FAILED, not total rollback and not false COMPLETE.

Retry only failed jobs.

Do not republish already-live jobs unless the founder explicitly creates a new revision or a provider proves the original publication did not exist.

## 12. Meaningful events and evidence

Connect Social Publishing to the existing meaningful event/evidence model.

Useful event types include:

social.campaign.created
social.campaign.prepared
social.approval.requested
social.approval.authorized
social.publish.started
social.publish.succeeded
social.publish.failed
social.retry.started
social.campaign.completed
social.campaign.partially_failed
social.receipt.recorded

Do not infer activity from file timestamps.

Receipts are evidence.

An agent saying "posted" is not evidence.

## 13. Project Workspace and Today

Integrate only truthful data.

Project Workspace should eventually expose:

- active Social Campaign;
- target platforms;
- campaign state;
- blockers;
- approval requirement;
- platform-job status;
- receipts/evidence;
- next action.

Today should be able to say, for example:

Next useful action: Approve Genesis Campaign publication

or

Next useful action: Retry TikTok publication

Do not create a parallel social dashboard as the primary product surface.

## 14. Switchboard, Neural Vault, Agent Map, Marketplace

Extend existing systems only when real provenance exists.

Switchboard may carry structured handoffs such as approval_required, publish_failed, result_available, verification_requested.

Neural Vault may represent Mission -> produced -> Campaign Artifact and Campaign -> verified_by -> Publish Receipt only when the source records exist.

Agent Map must never draw social relationships that cannot identify both endpoints and provenance.

Marketplace may advertise publisher connectors/capabilities, but installation does not grant authority.

## SKILLS: MIDDLE

At implementation and failure-resolution stages invoke:

/test-driven-development
/systematic-debugging
/backend-code-review

Use TDD for state transitions, idempotency, approval behavior, persistence, server validation, failure recovery, migrations, provider normalization, and retry logic where practical.

Complete one implementation slice before verifying it. Do not mix implementation and verification.

## 15. Persistence and migration

Use existing durable infrastructure.

Requirements:

- atomic write;
- known-good backup;
- corrupt-state quarantine/fallback consistent with repository policy;
- schemaVersion;
- backwards compatibility;
- representative migration tests if schema changes;
- never write tests into the founder's real Vault/state.

## 16. Security review

Explicitly test:

- path traversal;
- malformed campaign IDs;
- malformed payloads;
- approval scope mismatch;
- approval replay;
- unauthorized publish attempt;
- duplicate mutation replay;
- secret leakage;
- provider error leakage;
- command injection if adapters invoke local commands;
- prompt/tool content attempting privilege escalation;
- poisoned provider receipts;
- oversized payloads;
- connector output with unexpected schema.

## 17. Manual founder gates

The founder will perform account-owner operations.

Do not block engineering work waiting for these unless a real provider E2E test requires them.

Document manual gates clearly:

- developer app registration;
- OAuth authorization;
- domain verification;
- platform review/audit;
- production secrets;
- provider subscription/billing;
- target account validation;
- paid-product legal/privacy review.

## 18. Paid product readiness

Rempeyek is intended to become paid software.

Do not prematurely build billing into the Work kernel.

Before commercial release verify:

- tenant/user isolation assumptions;
- secret storage;
- third-party license/dependency inventory;
- privacy documentation;
- telemetry controls;
- provider costs and failure behavior;
- installer/update signing and rollback;
- backup/restore;
- account disconnect/revocation;
- supportable manual setup.

## 19. Test matrix

Domain:

- valid campaign transitions
- invalid campaign transitions
- duplicate platform normalization
- unsupported platform rejection
- platform-native variant override

Approval:

- approval required
- approval rejected
- approval expired
- scope mismatch
- approval consumed once
- bounded contract authority

Persistence:

- save/reload
- restart reconstruction
- corrupt state fallback
- backup recovery
- schema migration where required

Publishing:

- all platforms succeed
- one platform fails
- all platforms fail
- retry failed jobs only
- provider timeout
- normalized provider error
- receipt persistence
- no duplicate republish of live jobs

Runtime/API:

- auth/access policy
- invalid JSON
- invalid IDs
- operation replay
- redacted errors
- no secret exposure

Continuity:

- campaign survives restart
- successful receipt survives restart
- failed job remains retryable
- Today reports correct next action
- another compatible worker can resume bounded context

UI when added:

- desktop
- responsive
- keyboard
- screen-reader labels
- loading
- provider unavailable
- approval required
- partial failure
- completed state

## 20. Dogfood

Use a safe provider fake or sandbox before production credentials.

Required software dogfood:

Founder goal
-> Mission
-> Work Contract
-> campaign created
-> native variants prepared
-> approval requested
-> approval granted
-> two or more platform jobs queued
-> one provider success
-> one temporary provider failure
-> receipt persisted
-> restart/reload
-> successful job remains LIVE
-> only failed job retries
-> final campaign completes
-> evidence recorded
-> Today reflects next action accurately

Then, only when founder manual setup exists, run a bounded real-account E2E test on explicitly approved test content.

## 21. Implementation discipline

Recommended order:

A. repository truth audit
B. audit existing Social Publishing kernel
C. focused domain fixes
D. durable runtime-store wiring
E. server/API contracts
F. idempotency and approval integration
G. provider adapter seam
H. fake/sandbox adapter
I. project/event/evidence integration
J. Today/Workspace integration
K. Switchboard/capability integration
L. UI only after contracts stabilize
M. restart/recovery tests
N. security review
O. documentation
P. browser/desktop verification
Q. production-provider manual gate

Change the order only when current dependency evidence justifies it. Document why.

## SKILLS: FINAL

During final verification invoke:

/webapp-testing
/verification-before-completion
/handoff

Final verification is not a substitute for focused verification after each implementation slice.

## 22. Final verification

Run the strongest applicable repository verification.

At minimum:

focused tests for changed modules
full npm test
production build
git diff --check
graphify update .

Where supported:

Playwright/browser tests
migration tests
restart/recovery tests
desktop tests
security tests
responsive checks

Review repository status and generated files afterward.

Do not fabricate test results.

## 23. Required final output

Provide one consolidated report:

Outcome
Architecture
Existing features preserved
Social Publishing capabilities implemented
Files changed
Migrations
Tests with exact commands and real results
Dogfood evidence
Continuity/restart evidence
Approval and authority evidence
Security review
UI verification
Manual founder steps remaining
Paid-release blockers
Known limitations
Rollback
Final Status: PASS, PARTIAL, or FAIL

PASS is allowed only when the implemented software path is proven end-to-end. If code is complete but production platform credentials/audits are still founder-owned manual gates, state that separately as PRODUCTION SETUP PENDING rather than inventing a software failure or claiming live publication that was never tested.
