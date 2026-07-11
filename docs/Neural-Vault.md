# Neural Vault

The Obsidian Vault (`Obsidian Vault/`, gitignored) is the OS's shared memory layer.
Agents write markdown; the dashboard reads it live — no database in the loop.

## Vault contract

| Folder | Purpose |
|---|---|
| `Brains/<Lane>/` | per-agent lane: identity, knowledge, daily notes → drives "vault status" |
| `Daily/` | cross-agent daily work logs |
| `Tasks/` | open checkboxes → Needs Review board (dashboard writes `Tasks/Inbox Tasks.md`) |
| `Inbox/` | triage items + automatic DOWN alerts |
| `Projects/` | flat notes (read-only) + `Projects/<slug>/` **workspaces** → Workspace view |
| `Reports/` | generated dashboard reports |

Workspace folders hold `project.md` (frontmatter: `goal`, `progress`, `status`, `agents`),
`decisions.md` (append-only log — the dashboard and the memory-capture poller write here),
and `next.md` (the resume pointer that leads the Continue brief).

The dashboard only ever writes inside `Tasks/`, `Reports/`, `Inbox/`, `Brains/<lane>/`,
and `Projects/<slug>/` workspaces.

## Graph engine (`/api/graph` → NeuralGraph)

`buildGraph()` in `apps/web/server.js` scans every `.md` (symlink-safe, code blocks
stripped) and emits four toggleable edge layers:

- **link** — real `[[wikilinks]]` / `[](note.md)` between existing notes
- **ghost** — wikilinks whose target doesn't exist yet
- **tag** — note → `#tag` hub (star topology, honest counts)
- **folder** — structural skeleton (note → folder → parent)

Link resolution follows Obsidian's order: exact path → suffix match → sibling →
shallowest — duplicate basenames don't orphan notes.

`apps/web/public/graph.js` renders it: force-directed canvas, starfield, plasma halos
by degree, neural shockwaves, signal particles on wikilinks. Click a node → opens the
note in Obsidian via a path-based `obsidian://` URI.

## Health

The Vault Health panel tracks last git commit age and last backup age (`BACKUP_PATH`).
Rule of thumb: commit the vault daily; a >48h backup shows red.
