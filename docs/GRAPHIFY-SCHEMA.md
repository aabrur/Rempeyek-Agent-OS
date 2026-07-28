# Rempeyek Agent OS Graphify Data Model Schema

## Supported Node Types
- `Agent`, `NodeIdentity`, `Project`, `Document`, `Directory`, `Task`, `Session`, `Decision`, `Handoff`, `Skill`, `Capability`, `Memory`, `Entity`, `Person`, `Organization`, `Repository`, `Command`, `Evidence`, `Issue`, `Risk`, `Test`, `Artifact`.

## Supported Relationship Types
- `AGENT_HAS_IDENTITY`, `AGENT_USES_SKILL`, `AGENT_WORKED_ON`, `AGENT_CREATED`, `AGENT_MODIFIED`, `AGENT_HANDOFF_TO`, `PROJECT_CONTAINS`, `DOCUMENT_BELONGS_TO`, `DOCUMENT_REFERENCES`, `TASK_PART_OF`, `SESSION_EXECUTES`, `DECISION_AFFECTS`, `MEMORY_DERIVED_FROM`, `MEMORY_RELATED_TO`, `SKILL_SUPPORTS`, `EVIDENCE_SUPPORTS`, `ISSUE_BLOCKS`, `TEST_VALIDATES`, `ARTIFACT_PRODUCED_BY`, `ENTITY_MENTIONED_IN`, `SUPERSEDES`, `CONFLICTS_WITH`, `DEPENDS_ON`.

## Provenance Model
Every edge and node has a `confidence` level:
- `verified`: Directly extracted from structural source (AST, filesystem).
- `inferred`: Derived from semantic relationship or subagent analysis.
- `uncertain`: Potential edge requiring confirmation.
