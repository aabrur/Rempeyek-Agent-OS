# Developer Guide

This document provides architecture details, development workflows, coding guidelines, and step-by-step extension instructions for developers working on **Rempeyek Agent OS**.

---

## Repository Structure

Rempeyek Agent OS is structured as a monorepo using npm workspaces:

```text
Rempeyek-Agent-OS/
├── apps/
│   ├── web/                     # Web dashboard & Node.js HTTP server
│   │   ├── lib/                 # Core domain engines & ESM logic modules (.mjs)
│   │   │   ├── migrations/      # Sequential runtime schema migration files
│   │   │   └── ...              # Subsystem modules (backup, access-policy, agent-map, etc.)
│   │   ├── src/                 # React UI components & frontend source
│   │   ├── test/                # Web application unit & integration tests
│   │   ├── server.js            # Node.js backend HTTP server & REST endpoint router
│   │   └── vite.config.mjs      # Vite build & bundle configuration
│   └── desktop/                 # Electron desktop wrapper application
├── packages/                    # Internal monorepo packages
│   ├── design-system/           # Shared CSS design tokens and theme variables
│   ├── neural-engine/           # Core neural network & graph algorithms
│   ├── theme-engine/            # Theme switcher & styling provider
│   └── ui/                      # Shared React UI component library
├── bin/                         # Command-line executables (rempeyek-agent-os.mjs)
├── runtime/                     # Local development runtime templates & stubs
├── scripts/                     # Build, release audit, and packaging scripts
└── docs/                        # Project documentation and specifications
```

---

## Development Environment Setup

### 1. Installation
Install all workspace dependencies from the repository root:
```bash
npm install
```

### 2. Running the Development Server
To launch the development server with live compilation:
```bash
npm run dev
```
This runs the full build sequence and launches the Node.js backend server (`apps/web/server.js`), making the dashboard accessible at `http://localhost:4321`.

### 3. Running Tests
Run the test suite using Node.js' native test runner:
```bash
# Run all web tests
npm test

# Run individual test files directly
node --test apps/web/test/*.test.mjs
```

---

## Module System: ESM in `lib/` vs `server.js`

Rempeyek Agent OS utilizes modern ECMAScript Modules (ESM) alongside CommonJS/dynamic import patterns in `server.js`:

* **`apps/web/lib/*.mjs`**: All core engine modules (such as `backup-engine.mjs`, `migration-engine.mjs`, `bootstrap.mjs`) are written as pure ES Modules (`.mjs`) using native `import`/`export` syntax.
* **`apps/web/server.js`**: Serves as the primary HTTP server entry point. ESM modules from `lib/` are imported dynamically via `import(...)` promises or loaded at server initialization:
  ```js
  const BOOTSTRAP_MOD = import("./lib/bootstrap.mjs");
  ```

---

## Extending Rempeyek Agent OS

### 1. Adding a New Agent Adapter
Agent adapters define how external agent runtimes (e.g., Claude Code, AutoGPT, custom CLI agents) interface with Rempeyek Agent OS.

1. Open `apps/web/lib/process-adapters.mjs`.
2. Define a new adapter factory or handler:
   ```js
   export function createCustomAgentAdapter(config) {
     return {
       id: 'custom-agent-adapter',
       async spawn(params) {
         // Custom process spawning logic
       },
       async terminate(pid) {
         // Custom termination logic
       }
     };
   }
   ```
3. Register your new adapter in `apps/web/lib/agent-catalog.mjs` to expose it in the Marketplace catalog.

---

## 2. Adding a New Schema Migration

Migrations maintain runtime directory and configuration consistency across system updates.

1. Create a new `.mjs` file in `apps/web/lib/migrations/` following the numerical naming convention (e.g., `002-add-telemetry-store.mjs`).
2. Export `version`, `description`, `reversible`, `up`, `down`, and `validate`:
   ```js
   export const version = 2;
   export const description = 'Initialize telemetry store directory';
   export const reversible = true;

   export async function up({ configDir, vaultPath }) {
     // Migration logic
   }

   export async function down({ configDir, vaultPath }) {
     // Rollback logic
   }

   export async function validate({ configDir, vaultPath }) {
     // Validation logic
     return { valid: true, errors: [] };
   }
   ```
3. Test your migration via unit tests or the migration engine API. See [MIGRATIONS.md](file:///docs/MIGRATIONS.md) for full details.

---

## 3. Adding a New REST API Endpoint to `server.js`

To add a new backend API route:

1. Open `apps/web/server.js`.
2. Locate the main HTTP request handler block (`server.on('request', ...)`).
3. Add a route matcher and handler logic:
   ```js
   if (url === "/api/my-feature" && req.method === "GET") {
     return json(res, 200, { success: true, data: "Hello World" });
   }
   ```
4. If the endpoint requires policy approval or authentication, wrap execution using `withApproval` or token checks:
   ```js
   if (url === "/api/my-feature/action" && req.method === "POST") {
     return withApproval(req, res, "my-feature.action", "registry", () => {
       // Privileged action execution
       return json(res, 200, { success: true });
     });
   }
   ```

---

## Codebase Knowledge Graph (`graphify`)

Rempeyek Agent OS maintains a knowledge graph of files, AST relations, and cross-file dependencies generated by `graphify`.

> [!IMPORTANT]
> Whenever you modify code or add new files, run the AST update command to keep the knowledge graph up to date:
> ```bash
> graphify update .
> ```
> This command runs locally (AST-only, zero API cost) and updates `graphify-out/`.
