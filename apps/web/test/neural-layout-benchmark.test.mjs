import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { graphRenderProfile, layoutGraph, projectGraph } from "../../../packages/neural-engine/src/graph-view.js";

test("1,000-node deterministic layout and projection stay within an interactive update budget", () => {
  const nodes = Array.from({ length: 1000 }, (_, index) => ({
    id: `Folder${index % 20}/Note-${index}.md`, label: `Note ${index}`,
    folder: `Folder${index % 20}`, type: "note", degree: index % 12, mtime: 0,
  }));
  const edges = [];
  for (let index = 1; index < nodes.length; index += 1) {
    edges.push({ source: nodes[index - 1].id, target: nodes[index].id, type: "link" });
    if (index > 20) edges.push({ source: nodes[index - 20].id, target: nodes[index].id, type: "link" });
  }

  const started = performance.now();
  const profile = graphRenderProfile("aggregate-ready", nodes.length);
  const laidOut = layoutGraph({ nodes, edges }, { width: 1400, height: 900, iterations: profile.layoutIterations });
  const layoutMs = performance.now() - started;
  const projectedAt = performance.now();
  const view = projectGraph({ nodes: laidOut, edges }, { mode: "cosmos" });
  const projectionMs = performance.now() - projectedAt;

  assert.equal(view.counts.nodes, 1000);
  assert.equal(view.counts.edges, 1978);
  assert.ok(layoutMs + projectionMs < 1500, `1k graph update took ${(layoutMs + projectionMs).toFixed(2)}ms`);
  console.log(`1k graph benchmark: layout=${layoutMs.toFixed(2)}ms projection=${projectionMs.toFixed(2)}ms total=${(layoutMs + projectionMs).toFixed(2)}ms`);
});
