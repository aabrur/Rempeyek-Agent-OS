# Rempeyek Agent OS Test Report

## Execution Summary
- **Command Executed:** `npm test` (`node --test apps/web/test/*.test.mjs`)
- **Total Tests:** 205
- **Passed:** 205
- **Failed:** 0
- **Duration:** 10,425 ms
- **Exit Code:** 0

## Key Scenarios Tested & Verified
1. **First Startup & Path Resolution:** Dynamic resolution of `%LOCALAPPDATA%\Rempeyek-Agent-OS` and `%USERPROFILE%\.skills`.
2. **AI Family Identity Persistence:** Deterministic assignment of `Node-1`, `Node-2`, etc., and creation of private node directories.
3. **Session Lifecycle & Handoffs:** Active session recording, decision logging, session completion, and Markdown handoff generation.
4. **Skills Synchronization Engine:** Skill discovery from central warehouse, SHA-256 checksumming, capability matching, and assignment.
5. **Graphify Project & Document Ingestion:** Registration of project source paths, document scanning, provenance tracking, and `GRAPH_REPORT.md` generation.
6. **Command Routing:** Validation of `/obsidian`, `/obsidian-vault`, `/shared-memory`, `/graphify`, and `/skills`.
7. **Security & Access Policy:** Denylist pattern matching for `.ssh`, `.gnupg`, Chrome user data, and secret redaction.
