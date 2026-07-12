# Domain Language

## Project Workspace

A durable project record stored in the Vault. It owns the project goal, status,
next action, decisions, approvals, task references, evidence, and resume brief.
The Markdown file layout is an implementation detail, not caller vocabulary.

## Today

The restart surface that selects one honest project to continue, explains why it
was selected, and presents the next action, approvals, and recent evidence.

## Project Thread

The ordered continuity line connecting the latest meaningful decision, current
next action, active work, approval state, and resulting evidence.

## Meaningful Activity

A human decision, explicit next-action edit, task-state change, approval change,
or agent result tied to a project. Incidental file metadata changes are excluded.

## Project Event

A typed, bounded fact with a stable event ID, project ID, actor, timestamp,
provenance, kind, and summary. Telemetry is one adapter that can produce events.

## Approval

An append-only authorization decision. Approval authorizes an action but never
implies that execution succeeded.

