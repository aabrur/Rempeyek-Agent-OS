# @rempeyek/neural-engine

**Live package.** `NeuralGraph` — the force-directed vault graph, pure 2D canvas, zero
dependencies.

Renders the 4-layer graph from `/api/graph`: **link** (real `[[wikilinks]]`) · **ghost**
(links to notes that don't exist yet) · **tag** · **folder**. Starfield, plasma halos
sized by node degree, curved typed edges, signal particles along wikilinks, neural
shockwaves, pan/zoom/drag/search.

```js
import { NeuralGraph } from "@rempeyek/neural-engine";

const g = NeuralGraph(canvasEl, { onOpen: node => location.href = obsUri(node.id) });
g.setData({ nodes, edges, stats });
g.setLayers({ link: true, tag: false, folder: true, ghost: true });
g.setQuery("hermes");
g.reheat();     // re-energize the simulation (e.g. after a theme switch)
g.destroy();    // detach observers + cancel the RAF loop
```

**Imperative by design.** The engine owns the canvas and its own RAF loop; React wraps
it in a ref (`apps/web/src/components/NeuralGraphCanvas.jsx`) and only feeds it data,
layer toggles, and the query. A 60fps physics simulation should not re-render through
React.

Respects `prefers-reduced-motion`.
