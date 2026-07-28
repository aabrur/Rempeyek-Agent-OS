# First-Run Bootstrap Architecture & Workflow

When Rempeyek Agent OS is launched for the first time, it performs an automated **Bootstrap Process** designed to guarantee zero-configuration setup and system self-healing.

---

## The 10 Bootstrap Steps

The bootstrap system (`apps/web/lib/bootstrap.mjs`) executes 10 sequential setup steps during application startup:

1. **Create Runtime Directories**
   Ensures mandatory runtime folders exist under `REMPEYEK_RUNTIME_ROOT`: `Config`, `Logs`, `Cache`, `Backups`, `Quarantine`, `Temp`, `Runtime`, `Updates`, `Packages`, and `Agents`.

2. **Create or Validate Runtime Manifest**
   Generates `Config/runtime-manifest.json` tracking OS platform, architecture, version string, execution mode, and system health flags.

3. **Scaffold Neural Vault Structure**
   Scaffolds the directory structure for your local Neural Vault (`Vault/System`, `Vault/Memory`, `Vault/Graph`, `Vault/Agents`), populating initial README templates and metadata stores.

4. **Initialize AI Family Registry**
   Scans registered agents and writes `Vault/System/AI-Family/family-registry.json` and human-readable `family-registry.md`, indexing active node IDs, roles, and capability trees.

5. **Initialize Shared Memory Engine**
   Creates `Vault/Memory/Shared/index.json` to enable cross-agent episodic memory, daily logs, and shared task tracking.

6. **Initialize Graphify Unified Engine**
   Builds the initial graph index at `Vault/Graph/Indexes/graph-index.json` to link notes, code entities, and agent interaction topologies.

7. **Synchronize Skills Warehouse**
   Checks for the central skills directory (`~/.skills` or `REMPEYEK_SKILLS_PATH`). If present, synchronizes agent skill definitions. If absent, records a non-blocking warning.

8. **Write Default Security Access Policy**
   Creates `Config/access-policy.json` with deny-by-default file boundaries, blocked sensitive regex patterns, allowed extensions, and approval triggers.

9. **Mark Bootstrap Completion**
   Updates the runtime manifest file with `bootstrapCompleted: true`.

10. **Write Bootstrap Report**
    Writes a summary of step execution statuses, warnings, and errors to `Config/bootstrap-report.json`.

---

## Reading `bootstrap-report.json`

The report file is located at `<REMPEYEK_RUNTIME_ROOT>/Config/bootstrap-report.json`.

### Example Report:
```json
{
  "success": true,
  "timestamp": "2026-07-28T12:00:00.000Z",
  "steps": {
    "runtimeDirs": { "status": "created", "path": ".../Rempeyek-Agent-OS" },
    "manifest": { "status": "created" },
    "vault": { "status": "scaffolded" },
    "familyRegistry": { "status": "initialized", "nodeCount": 4 },
    "sharedMemory": { "status": "initialized" },
    "graphify": { "status": "initialized" },
    "skills": { "status": "initialized" },
    "accessPolicy": { "status": "created" }
  },
  "warnings": [],
  "errors": []
}
```

---

## Verification & Management via API

### Checking Status
Send a `GET` request to verify the current bootstrap state:
```bash
curl http://localhost:4321/api/bootstrap/status
```

### Re-running Bootstrap
If files are corrupted or manual re-initialization is required, trigger a bootstrap rerun via HTTP `POST`:
```bash
curl -X POST http://localhost:4321/api/bootstrap/run
```

---

## Common First-Run Issues & Troubleshooting

| Issue | Root Cause | Resolution |
| :--- | :--- | :--- |
| **Node.js Version Error** | Running Node.js < 18 | Upgrade Node.js to v18.0.0 or higher. Check version with `node -v`. |
| **Port 4321 Collision** | Another service occupies port 4321 | Launch with custom port: `PORT=5000 node bin/rempeyek-agent-os.mjs`. |
| **Skills Warehouse Warning** | `~/.skills` directory does not exist | Safe to ignore. Create `~/.skills` when adding custom skill tools. |
| **EACCES / Permission Denied** | Insufficient write permissions in runtime directory | Run standard user terminal (do not mix `sudo` and standard user execution), or set `REMPEYEK_RUNTIME_ROOT` to a writable folder. |
