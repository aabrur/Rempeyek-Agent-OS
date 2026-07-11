# @rempeyek/ui

**Extraction target — code lives in `apps/web` today.**

Reusable UI primitives: `.panel`, `.tile`, `.agent-card`, `.pill`/`.chip`, `.btn` family,
modal (`.token-ov`/`.token-box`), toggle pills (`.lyr`), empty/skeleton states.

Current source: `apps/web/public/style.css` (component blocks) + render helpers in
`apps/web/public/app.js` (`el`, `esc`, `pill`, `avatarHtml`, `gwButtons`).

Extract when: `apps/desktop` or a second surface needs the same primitives.
