# Rempeyek Agent OS Vault Architecture

## Vault Root Location
`C:\Users\abrur\AppData\Local\Rempeyek-Agent-OS\Vault`

## Structural Hierarchy
```text
Vault\
  00-Inbox\                  # Unprocessed notes & capture
  01-Daily\                  # Daily agent logs & human notes
  02-Projects\               # Project-specific state, tasks & memory
  03-Areas\                  # Long-term responsibilities
  04-Resources\              # Reference materials
  05-Archives\               # Archived projects
  Agents\                    # Shared agent representations
  Memory\
    Shared\                  # Cross-agent accepted facts & lessons
    Decisions\               # Architecture & project decision records
    Lessons\                 # Validated lessons learned
    Preferences\             # User preferences
    Entities\                # Knowledge entities
    Procedures\              # Reusable procedures
    Handoffs\                # Structured agent session handoffs
  Graph\
    Nodes\                   # Graph node records
    Edges\                   # Graph edge records
    Indexes\                 # Machine graph indexes
    Reports\                 # Human-readable GRAPH_REPORT.md
  Sessions\
    Active\                  # Live agent sessions
    Completed\               # Finished sessions
    Failed\                  # Interrupted/failed sessions
  Skills\
    Registry\                # Central skill registry index
    Assignments\             # Node-specific skill assignments
    Reports\                 # Skill sync reports
  System\
    AI-Family\               # family-registry.json & AI-Family.md
    Commands\                # Command routing logs
    Schemas\                 # JSON schemas for sessions, handoffs, etc.
    Policies\                # Access and sync policies
  Attachments\               # Embedded media and assets
  Imports\                   # Imported documents
  Quarantine\                # Quarantined assets
  .graphify\                 # Raw GraphRAG graph data (graph.json)
  .obsidian\                 # Obsidian configuration
```
