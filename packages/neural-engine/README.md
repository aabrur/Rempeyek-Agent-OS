# @rempeyek/neural-engine

**Extraction target — code lives in `apps/web` today.**

`NeuralGraph(canvas, opts)` — self-contained force-directed 2D canvas renderer:
starfield, plasma halos by degree, typed curved edges, signal particles, shockwaves,
pan/zoom/drag/search. API: `setData` `setLayers` `setQuery` `reheat` `legend` `destroy`.

Current source: `apps/web/public/graph.js` (already dependency-free — the easiest
extraction; needs only an ES-module wrapper).
