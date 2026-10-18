## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## REA investigations (optional, development only)

When compiled artifacts, Electron boundaries, or client bundles need investigation, read `docs/REA-WORKFLOW.md` and use REA for scoped, evidence-based analysis. Do not use REA for routine source changes, agent operation cycles, or production runtime. Preserve all existing project instructions and never commit `.rea-reports/` or confidential analysis output.
