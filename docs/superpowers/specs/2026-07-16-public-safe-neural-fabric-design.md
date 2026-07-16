# Public-Safe Neural Fabric Design

## Goal

Make REMPEYEK Agent OS safe to publish and install without exposing the owner's agents, vault, runtime data, absolute paths, avatars, screenshots, or environment secrets. At the same time, replace the current disconnected Agent Map presentation with one coherent eight-agent neural constellation that preserves the dashboard's existing themes and evidence semantics.

The approved direction is **Hybrid Neural Fabric**. The implementation will use the repository-local `node_modules/Cyberpunk Cosmos Map Design` package as a composition and interaction reference. Its hard-coded demo roster and raster mockup are not runtime dependencies and will not be copied into the public application.

## Success criteria

1. A clean clone starts with zero agents and can register its first agent through `+ Add Agent` without copying an example roster.
2. User configuration, vault content, telemetry, uploaded avatars, environment secrets, and backups live outside tracked source and are excluded from packages.
3. Agent gateway processes receive only required operating-system variables plus explicitly allowlisted provider variables.
4. All registered agents occupy one readable neural constellation. An agent with no verified operational edge, including Claude Code, remains visually part of the fabric rather than being placed in a detached perimeter band.
5. Verified relationships remain distinguishable from non-semantic neural fabric. The interface never presents decorative filaments as provenance-backed operational facts.
6. Runtime UI artwork is SVG or code-native. Personal QA screenshots and raster design references are not shipped as public product assets.
7. Desktop, tablet, mobile, keyboard navigation, reduced motion, and the four existing theme profiles remain supported.
8. Tests, production build, privacy audit, live API probes, browser verification, and Graphify update pass before release.

## Public data boundary

### Per-user state

New installations resolve state under the operating system's local application-data directory, with environment overrides when explicitly configured. The state root owns:

- `agents.config.json`
- telemetry and gateway logs
- uploaded agent avatars
- generated backups and runtime handshakes
- an optional empty starter vault or the pointer to the user's own Obsidian vault

Compatibility with the current local installation is preserved by recognizing an existing ignored repository-local configuration and explicit `AGENTS_CONFIG` or `VAULT_PATH` values. The migration must not rewrite or delete the owner's existing vault.

When no configuration exists, the server creates a minimal schema containing the agency name, a safe default work directory, and `agents: []`. The tracked example is also empty and documents the `+ Add Agent` workflow.

### Secrets and subprocesses

The dashboard may load secrets from its local environment, but gateway commands must not inherit the complete dashboard environment. Child environments include only:

- Windows process essentials such as `PATH`, `PATHEXT`, `SystemRoot`, `COMSPEC`, `TEMP`, and the user's application-data paths;
- `AGENT_WORKDIR`;
- variables explicitly requested by `gateway.envAllow` or a narrow compatibility mapping for supported catalog agents.

Tests must prove that an unrelated provider key is absent and an explicitly allowed key is present. API responses, logs, errors, and generated configuration must never serialize secret values.

### Public repository and package

The release audit rejects tracked `.env`, actual agent configuration, vault files, runtime telemetry, uploaded avatars, personal absolute paths, and high-confidence secret patterns. Public documentation uses placeholders such as `%USERPROFILE%`, `%LOCALAPPDATA%`, `<repo>`, and `<your-vault>`.

Tracked QA screenshots and raster mockups that reveal the owner's roster are removed from release-facing documentation. A package allowlist or equivalent npm ignore policy excludes internal planning, Graphify output, tests, local skills, screenshots, and runtime state.

Git-history sterilization is a separate destructive release operation. It requires explicit approval before rewriting reachable commits, retagging releases, or force-pushing.

## Agent Map visual system

### Composition

The map is one horizontal instrument inside the existing dashboard, not a new application shell. It adopts the strongest ideas from `Cyberpunk Cosmos Map Design`:

- a deep, restrained cosmos field;
- a large central neural field with layered radial geometry;
- luminous curved paths with directional flow only when real runtime evidence permits it;
- capsule nodes with circular vector avatar wells, readable names, text status, and verified-link counts;
- a compact runtime overview and a focused inspector that use the existing dashboard's semantic tokens.

The map must not copy the reference's fake metrics, fixed names, fabricated capabilities, or synthetic relationship strengths.

### Hybrid Neural Fabric

The projection uses two explicitly different layers:

1. **Verified relationship layer** — interactive, typed, selectable edges generated only from accepted provenance records. These retain the current dependency, co-assignment, task, subagent, and communication semantics.
2. **Neural fabric layer** — non-interactive structural filaments that visually bind registered agents into one constellation. These are low-contrast, have no arrowheads, do not appear in the relationship legend or evidence table, and are labelled decorative for assistive technology by being hidden from it.

The highest-degree real agent remains the anchor when evidence exists. With zero evidence, the layout chooses a deterministic visual focus without marking it as an operational hub. Every remaining agent occupies a bounded elliptical orbit. There is no detached perimeter band.

The fabric is deterministic: connect each orbit node to its nearest visual neighbors and the visual focus using stable IDs and projected coordinates. It must not alter edge counts, degree, component IDs, inspector relationships, provenance rows, or accessible evidence output.

### SVG and generated reference

Because this is one dashboard section, the image-first phase produces one horizontal 16:9 reference image. It is used for analysis only and is not shipped by the application.

Production visual elements are code-native SVG/CSS:

- star field and neural dust use deterministic SVG symbols or lightweight CSS backgrounds;
- orbit guides, filaments, bezels, status symbols, and fallback agent glyphs use SVG paths and shapes;
- uploaded user avatars remain user-owned runtime media and may retain their original format outside the source tree;
- no generated raster image is required at runtime.

The art direction is Deep Dark Mode, refined grotesk plus existing display/data fonts, living-system narrative, asymmetric but balanced orbital composition, and restrained cyan/magenta/violet accents. Glow communicates hierarchy and activity; it is not applied uniformly. The result must avoid noisy AI-gradient blobs, fake HUD labels, excessive pills, and nested card stacks.

### Motion and performance

Framer Motion is limited to meaningful transitions: node entrance, selection emphasis, inspector crossfade, and bounded view-box zoom. Verified queued or running communication/task flow may animate along its real path. Neural fabric uses either static opacity or one slow shared opacity pulse, never per-filament JavaScript animation.

All geometry is derived in the pure map projection and memoized by topology revision. Rendering avoids per-frame layout reads, large bitmap backgrounds, and unbounded SVG filters. Effects are disabled for reduced motion and reduced for minimalist and brutalist themes.

## Interaction and accessibility

- Agent nodes and verified relationships remain keyboard reachable.
- Arrow, Home, End, Enter, Space, and Escape behavior remains intact.
- Touch controls are at least 44 by 44 CSS pixels.
- Status always includes readable text and is never color-only.
- Decorative fabric, stars, and orbit guides are hidden from assistive technology.
- The evidence table remains the complete non-visual representation of real relationships.
- On narrow screens the side rails stack, while the map retains a minimum readable canvas with controlled horizontal scrolling rather than collapsing node labels.

## Verification plan

### Model and privacy tests

- deterministic single-constellation placement for connected and isolated agents;
- no detached perimeter node and no node overlap;
- decorative fabric does not affect verified edge metadata or evidence rows;
- provenance filtering and live-flow gating remain unchanged;
- empty configuration bootstraps with zero agents;
- subprocess environment allowlisting blocks unrelated secrets;
- tracked example roster is empty and forbidden public paths remain ignored.

### Runtime checks

- `npm test`;
- production build;
- package dry run and public-release audit;
- `/api/state`, `/api/procs`, and one agent-detail endpoint on localhost;
- desktop and mobile browser screenshots in Cyberpunk, plus sanity checks for Minimalist, Brutalist, and Glassmorph;
- reduced-motion verification and browser-console inspection;
- `graphify update .` after source changes.

## Release boundary

The implementation may create normal commits and push `main` after all non-destructive checks pass. It must not rewrite Git history, delete remote tags, force-push, publish to npm, or make the repository public as part of the normal implementation. Those actions require separate explicit approval after the release audit reports the remaining historical exposure and exact remediation impact.
