# @rempeyek/neural-engine

**Live package.** `NeuralGraph` is the dependency-free Canvas 2D renderer for the
Obsidian-backed dataset returned by `/api/vault/graph`.

It renders four explicit relationship layers: resolved `[[wikilinks]]`, unresolved
ghost links, tag overlays, and folder overlays. Layout and the ambient Cosmos field
are seeded from dataset identity, so identical snapshots reload at identical
positions. Visible effects encode graph facts only:

- node size and halo strength: connection degree;
- recency bloom: note `mtime` within seven days of the graph snapshot;
- faded/dashed nodes and edges: unresolved links;
- shockwave: explicit user selection;
- dashed ring: node added or materially changed since the preceding API snapshot.

Wikilinks are treated as undirected relationships. The renderer deliberately has no
directional flow particles or automatic random firing.

```js
import { NeuralGraph, layersForMode, projectGraph } from "@rempeyek/neural-engine";

const graph = NeuralGraph(canvasEl, {
  onOpen: node => location.href = obsUri(node.id),
  onSelect: node => inspect(node),
  onFocus: node => focusNeighborhood(node.id),
  onEscape: () => clearNeighborhood(),
});

const view = projectGraph(apiDataset, {
  mode: "parity",
  layers: layersForMode("parity"),
});
graph.setData(view);
graph.setQuery("hermes");
graph.setMotion(false);
graph.destroy();
```

**Imperative by design.** The engine owns the Canvas and its RAF lifecycle; React
feeds it the same projected data used by the accessible table. Animation pauses
when the tab is hidden and honors `prefers-reduced-motion`. Pointer interaction is
mirrored by keyboard selection, open, and neighborhood controls.
