# Contributing to Rempeyek Agent OS

Thank you for your interest in contributing to Rempeyek Agent OS! We welcome contributions from developers, security researchers, agent builders, and UX designers.

---

## Code of Conduct

Rempeyek Agent OS is built on principles of security, local-first data privacy, and open collaboration. We expect all contributors to maintain a welcoming, respectful, and professional environment.

---

## Getting Started

1. **Fork and Clone the Repository:**
   ```bash
   git clone https://github.com/aabrur/Rempeyek-Agent-OS.git
   cd Rempeyek-Agent-OS
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:4321` in your browser.

---

## Project Architecture

- **`bin/rempeyek-agent-os.mjs`**: Launcher CLI supporting `--non-interactive`, `--portable`, `--port`, `status`, and `export-data`.
- **`apps/web/server.js`**: Monolithic backend server with ESM helper integration.
- **`apps/web/lib/`**: Subsystem modules (ESM):
  - `bootstrap.mjs`: First-run zero-config orchestrator
  - `runtime-manifest.mjs`: State detection and manifest validation
  - `access-policy-engine.mjs`: Deny-by-default path access & symlink security controls
  - `config-resolver.mjs`: 4-layer config precedence system
  - `migration-engine.mjs`: Versioned schema migration runner
  - `backup-engine.mjs`: SHA-256 validated local backup system
  - `startup-lifecycle.mjs` & `shutdown-lifecycle.mjs`: Session recovery and clean teardown
  - `unified-command-router.mjs`: Slash command processor (`/agents`, `/rempeyek-status`)
  - `skills-sync-engine.mjs`: Central skills warehouse synchronization
  - `shared-memory-engine.mjs`: Cross-agent memory index & promotion

---

## Testing Guidelines

Always run the full unit test suite before opening a Pull Request:

```bash
npm test
```

Or run individual tests using Node.js built-in test runner:

```bash
node --test apps/web/test/bootstrap.test.mjs
node --test apps/web/test/security-hardening.test.mjs
```

### Security & Path Rules
- **No Hardcoded User Paths:** Never write fixed paths like `C:\Users\username`. Use dynamic resolution via `os.homedir()` or `process.env`.
- **Deny-by-Default:** Ensure access policy controls are strictly respected.
- **Atomic Operations:** File writes to state registries should use `.tmp` files with atomic renames.

---

## Knowledge Graph (Graphify)

Keep the AST knowledge graph up to date after making structural code changes:

```bash
graphify update .
```

---

## Submitting Pull Requests

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Commit changes with descriptive messages: `git commit -m "feat(security): add symlink safety check"`
3. Ensure all tests pass: `npm test`
4. Open a Pull Request on GitHub with a summary of changes and test evidence.
