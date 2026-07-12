/* NeuralGraph — cosmos-neural force-directed graph, pure 2D canvas.
   Renders the 4-layer vault graph from /api/graph: link | ghost | tag | folder.
   API: const g = NeuralGraph(canvas, {onOpen});
        g.setData({nodes,edges,stats}); g.setQuery(q);
        g.setLayers({link,ghost,tag,folder}); g.reheat(); g.destroy() */
import { datasetIdentity, graphRenderProfile, hashString, layoutGraph, nextNodeId, nodeSemantics, seededRandom } from "./graph-view.js";
export {
  breadcrumbFor, changedNodeIds, graphRenderProfile, labelForNodeId, layersForMode,
  nodeSemantics, projectGraph, resolveMotionState,
} from "./graph-view.js";

export function resolveGraphPalette(readToken = (_name, fallback) => fallback) {
  const effectEnabled = (name, fallback = true) => !["0", "false", "off", "none", "no"].includes(String(readToken(name, fallback ? "1" : "0")).trim().toLowerCase());
  const nodes = {
    note: readToken("--graph-note", "#46D9FF"),
    tag: readToken("--graph-tag", "#FF3DD8"),
    ghost: readToken("--graph-ghost", "#8E88BE"),
    folder: readToken("--graph-folder", "#7C5CFF"),
  };
  return {
    nodes,
    edges: {
      link: readToken("--graph-edge-link", "90,160,255"),
      ghost: readToken("--graph-edge-ghost", "160,140,255"),
      tag: readToken("--graph-edge-tag", "255,61,216"),
      folder: readToken("--graph-edge-folder", "124,92,255"),
    },
    starRgb: readToken("--graph-star", "210,205,255"),
    folderPalette: [nodes.note, readToken("--violet", "#8C5BFF"), readToken("--cyan", "#00E5FF"), readToken("--amber", "#FFB01F"), nodes.tag, readToken("--lime", "#3CFFC8"), readToken("--acc", "#C85CFF"), readToken("--red", "#FF4D6A")],
    foreground: {
      label: readToken("--graph-label", "rgba(220,214,255,.75)"),
      folderLabel: readToken("--graph-label-folder", "rgba(190,175,255,.9)"),
      hoverLabel: readToken("--graph-label-hover", "#EEEBFF"),
      meta: readToken("--graph-meta", "#8E88BE"),
      core: readToken("--graph-core", "rgba(255,255,255,.85)"),
      particle: readToken("--graph-particle", "#8CC8FF"),
      particleGlow: readToken("--graph-particle-glow", "#4C9BFF"),
      edgeHighlight: readToken("--graph-edge-highlight", "0,229,255"),
      wave: readToken("--graph-wave", "255,255,255"),
    },
    effects: {
      glow: effectEnabled("--graph-effect-glow"),
      halo: effectEnabled("--graph-effect-halo"),
      shadow: effectEnabled("--graph-effect-shadow"),
    },
  };
}

export function NeuralGraph(canvas, opts = {}) {
  const ctx = canvas.getContext("2d");
  let palette = ["#8C5BFF", "#4C9BFF", "#00E5FF", "#FFB01F", "#FF3DD8", "#3CFFC8", "#A78BFA", "#FF8A3C", "#F2E34C", "#FF4D6A"];
  let tagColor = "#FF3DD8", ghostColor = "#8E88BE", folderColorToken = "#7C5CFF", starRgb = "210,205,255";
  let foreground = resolveGraphPalette().foreground, effects = resolveGraphPalette().effects;
  // per-layer physics + stroke: folders form the short stiff skeleton, links the mid web,
  // tags/ghosts long loose threads — that spread is what makes it read as tissue, not a blob
  const EDGE = {
    link:   { rgb: "90,160,255",  w: 1.15, a: .34, curve: .16, len: 95,  k: .0045 },
    ghost:  { rgb: "160,140,255", w: .8,   a: .15, curve: .10, len: 120, k: .0018, dash: [3, 5] },
    tag:    { rgb: "255,61,216",  w: .8,   a: .18, curve: .24, len: 140, k: .0016 },
    folder: { rgb: "124,92,255",  w: .9,   a: .13, curve: .06, len: 62,  k: .006 },
  };
  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let motionRequested = !motionQuery.matches;
  let motion = motionRequested && !motionQuery.matches;
  let mode = "cosmos";
  let renderProfile = graphRenderProfile("full");
  let nodes = [], allEdges = [], edges = [], folderColor = new Map();
  let layers = { link: true, ghost: true, tag: true, folder: true };
  let waves = []; // selection shockwave only; never automatic
  let datasetKey = "empty", selected = null, positionCache = new Map();
  let cam = { x: 0, y: 0, z: 1 };
  let alpha = 0;
  let hover = null, dragNode = null, panning = false, query = "";
  let raf = null, last = { x: 0, y: 0 }, moved = 0, dpr = 1;
  let stars = null; // offscreen starfield, rebuilt on resize

  function refreshTheme() {
    const style = getComputedStyle(canvas);
    const token = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    const resolved = resolveGraphPalette(token);
    tagColor = resolved.nodes.tag;
    ghostColor = resolved.nodes.ghost;
    folderColorToken = resolved.nodes.folder;
    starRgb = resolved.starRgb;
    palette = resolved.folderPalette;
    foreground = resolved.foreground;
    effects = resolved.effects;
    for (const type of Object.keys(EDGE)) EDGE[type].rgb = resolved.edges[type];
    folderColor = new Map();
    stars = null;
    if (!effects.glow) waves = [];
    for (const n of nodes) n.c = nodeColor(n);
  }

  function colorOf(folder) {
    const top = (folder || "").split("/")[0];
    if (!folderColor.has(top)) folderColor.set(top, palette[folderColor.size % palette.length]);
    return folderColor.get(top);
  }
  function nodeColor(n) {
    if (n.type === "tag") return tagColor;
    if (n.type === "ghost") return ghostColor;
    if (n.type === "folder") return folderColorToken;
    return colorOf(n.folder);
  }
  function nodeRadius(n) {
    const degree = n.degree ?? n.deg ?? 0;
    if (n.type === "folder") return 5.5 + Math.min(degree, 30) * 0.35;
    if (n.type === "tag") return 3.5 + Math.min(degree, 16) * 0.5;
    if (n.type === "ghost") return 2.6;
    return 3.2 + Math.min(degree, 14) * 1.05;
  }

  function setData(data) {
    refreshTheme();
    folderColor = new Map();
    const W = canvas.clientWidth || 800, H = canvas.clientHeight || 600;
    const selectedId = selected?.id;
    const nextDatasetKey = data.metadata?.datasetIdentity || datasetIdentity(data);
    if (nextDatasetKey !== datasetKey) positionCache = new Map();
    datasetKey = nextDatasetKey;
    renderProfile = graphRenderProfile(data.metadata?.effectTier, data.nodes.length);
    const semanticContext = { ...data.metadata, changedNodeIds: new Set(data.metadata?.changedNodeIds || []) };
    nodes = layoutGraph(data, { width: W, height: H, iterations: renderProfile.layoutIterations }).map(n => {
      const semantic = nodeSemantics(n, semanticContext);
      const cached = positionCache.get(n.id);
      const positioned = cached ? { ...n, x: cached.x, y: cached.y } : n;
      positionCache.set(n.id, { x: positioned.x, y: positioned.y });
      return { ...positioned, ...semantic, vx: 0, vy: 0, r: nodeRadius(n), c: null };
    });
    // color notes first so folder palette order is driven by real content folders
    for (const n of nodes) if (n.type === "note") n.c = nodeColor(n);
    for (const n of nodes) if (!n.c) n.c = nodeColor(n);
    const renderedHalos = new Set([...nodes]
      .filter(node => !node.unresolved && (node.halo || node.recent))
      .sort((a, b) => Number(b.recent) - Number(a.recent) || (b.degree || 0) - (a.degree || 0) || a.id.localeCompare(b.id))
      .slice(0, renderProfile.maxHalos)
      .map(node => node.id));
    for (const node of nodes) node.renderHalo = renderedHalos.has(node.id);
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    allEdges = (data.edges || [])
      .map(e => ({ ...e, s: e.source ?? e.s, t: e.target ?? e.t }))
      .filter(e => idx.has(e.s) && idx.has(e.t))
      .map(e => ({ a: nodes[idx.get(e.s)], b: nodes[idx.get(e.t)], type: e.type || "link" }));
    selected = selectedId ? nodes.find(node => node.id === selectedId) || null : null;
    applyLayers();
    alpha = 0;
    kick();
  }

  function applyLayers() {
    edges = allEdges.filter(e => layers[e.type]);
    // a node hides when its own layer is off (notes always show)
    for (const n of nodes) n.hidden = (n.type === "ghost" && !layers.ghost) ||
      (n.type === "tag" && !layers.tag) || (n.type === "folder" && !layers.folder);
  }
  function setLayers(on) {
    layers = { ...layers, ...on };
    applyLayers();
    kick();
  }

  function legend() {
    return [...folderColor.entries()].map(([name, color]) => ({ name, color }));
  }

  /* ------- simulation ------- */
  function tick() {
    const N = nodes.length;
    const neighborLimit = N > 300 ? 36 : N;
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      if (a.hidden) continue;
      for (let j = i + 1; j < Math.min(N, i + neighborLimit); j++) {
        const b = nodes[j];
        if (b.hidden) continue;
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          const sign = hashString(`${a.id}|${b.id}`) % 2 ? 1 : -1;
          d2 = 1; dx = .5 * sign; dy = -.5 * sign;
        }
        if (d2 > 250000) continue;
        const f = 1500 / d2;
        const d = Math.sqrt(d2);
        dx = dx / d * f; dy = dy / d * f;
        a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
      }
    }
    for (const e of edges) {
      if (e.a.hidden || e.b.hidden) continue;
      const s = EDGE[e.type];
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - s.len) * s.k;
      e.a.vx += dx / d * f * 2; e.a.vy += dy / d * f * 2;
      e.b.vx -= dx / d * f * 2; e.b.vy -= dy / d * f * 2;
    }
    for (const n of nodes) {
      n.vx -= n.x * 0.0015; n.vy -= n.y * 0.0015;
      if (n !== dragNode) { n.x += n.vx * alpha; n.y += n.vy * alpha; }
      n.vx *= 0.86; n.vy *= 0.86;
      positionCache.set(n.id, { x: n.x, y: n.y });
    }
    alpha = Math.max(0, alpha - 0.0035);
  }

  /* ------- render ------- */
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (!stars || canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
      stars = buildStars(w, h);
    }
  }
  function buildStars(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    const n = Math.round((w * h) / renderProfile.starAreaPerPoint);
    const random = seededRandom(hashString(`${datasetKey}|field|${w}|${h}`));
    for (let i = 0; i < n; i++) {
      const r = random();
      x.fillStyle = r > 0.94 ? `rgba(${starRgb},.8)` : r > 0.85 ? `rgba(${starRgb},.55)` : `rgba(${starRgb},.28)`;
      x.beginPath(); x.arc(random() * w, random() * h, r > 0.9 ? 1.2 : 0.6, 0, 7); x.fill();
    }
    return c;
  }
  function toScreen(n) {
    return {
      x: canvas.clientWidth / 2 + (n.x + cam.x) * cam.z,
      y: canvas.clientHeight / 2 + (n.y + cam.y) * cam.z,
    };
  }
  function draw() {
    resize();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (mode === "cosmos" && stars) ctx.drawImage(stars, 0, 0);

    const q = query.toLowerCase();
    const neighbors = new Set();
    const activeNode = hover || selected;
    if (activeNode) { neighbors.add(activeNode); for (const e of edges) { if (e.a === activeNode) neighbors.add(e.b); if (e.b === activeNode) neighbors.add(e.a); } }

    const now = performance.now();

    // plasma halos under the strongest hubs — breathing glow that follows real degree
    if (effects.halo) for (const n of nodes) {
      const degree = n.degree ?? n.deg ?? 0;
      if (mode !== "cosmos" || n.hidden || !n.renderHalo) continue;
      const s = toScreen(n);
      const breathe = !motion ? 1 : 1 + 0.10 * Math.sin(now / 1100 + degree * 1.7);
      const R = (30 + degree * 3.2) * cam.z * breathe;
      if (s.x < -R || s.y < -R || s.x > w + R || s.y > h + R) continue;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, R);
      g.addColorStop(0, n.c + "2C");
      g.addColorStop(1, n.c + "00");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, 7); ctx.fill();
    }

    // Waves are created only by an explicit selection; never automatic firing.
    for (let i = waves.length - 1; i >= 0; i--) {
      const wv = waves[i];
      wv.r += Math.max(1.1, wv.max * 0.022);
      const t = wv.r / wv.max;
      if (t >= 1) { waves.splice(i, 1); continue; }
      const s = toScreen(wv.n);
      const R = wv.r * cam.z;
      if (s.x < -R || s.y < -R || s.x > w + R || s.y > h + R) continue;
      const fade = (1 - t) * 0.6;
      ctx.strokeStyle = wv.n.c;
      ctx.globalAlpha = fade;
      ctx.lineWidth = 1.6 * (1 - t) + 0.4;
      if (effects.shadow) { ctx.shadowColor = wv.n.c; ctx.shadowBlur = 12 * (1 - t); }
      ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, 7); ctx.stroke();
      ctx.globalAlpha = fade * 0.7;
      ctx.strokeStyle = `rgba(${foreground.wave},.8)`;
      ctx.lineWidth = 0.6;
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(s.x, s.y, R * 0.86, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;

    for (const e of edges) {
      if (e.a.hidden || e.b.hidden) continue;
      const st = EDGE[e.type];
      const A = toScreen(e.a), B = toScreen(e.b);
      if (Math.max(A.x, B.x) < -40 || Math.max(A.y, B.y) < -40 || Math.min(A.x, B.x) > w + 40 || Math.min(A.y, B.y) > h + 40) continue;
      const hot = hover && (e.a === hover || e.b === hover);
      const dim = hover && !hot;
      ctx.strokeStyle = hot ? `rgba(${foreground.edgeHighlight},.75)` : `rgba(${st.rgb},${dim ? st.a * 0.35 : st.a})`;
      ctx.lineWidth = hot ? 1.6 : st.w;
      ctx.setLineDash(st.dash || []);
      const mx = (A.x + B.x) / 2 - (B.y - A.y) * st.curve;
      const my = (A.y + B.y) / 2 + (B.x - A.x) * st.curve;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(mx, my, B.x, B.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const n of nodes) {
      if (n.hidden) continue;
      const s = toScreen(n);
      if (s.x < -30 || s.y < -30 || s.x > w + 30 || s.y > h + 30) continue;
      const match = q && (n.label.toLowerCase().includes(q) || (n.folder || "").toLowerCase().includes(q));
      const dim = (q && !match) || (activeNode && !neighbors.has(n));
      const r = n.r * cam.z * (n === activeNode ? 1.35 : 1);
      ctx.globalAlpha = dim ? 0.13 : (n.type === "ghost" ? 0.38 : 1);
      const allowNodeShadow = effects.shadow && (renderProfile.shadowMode === "all" || n === activeNode || match);
      if (allowNodeShadow) {
        ctx.shadowColor = n.c;
        ctx.shadowBlur = mode === "parity" || dim ? 0 : (n === hover || match ? 26 : (n.degree ?? n.deg ?? 0) >= 8 ? 18 : 10);
      } else ctx.shadowBlur = 0;

      if (n.type === "folder") {
        ctx.strokeStyle = n.c; ctx.lineWidth = 1.4;
        ctx.fillStyle = n.c + "2E";
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(r, 2), 0, 7); ctx.fill(); ctx.stroke();
      } else if (n.type === "tag") {
        ctx.fillStyle = n.c;
        const d = Math.max(r, 2.2);
        ctx.beginPath(); ctx.moveTo(s.x, s.y - d); ctx.lineTo(s.x + d, s.y); ctx.lineTo(s.x, s.y + d); ctx.lineTo(s.x - d, s.y); ctx.closePath(); ctx.fill();
      } else if (n.unresolved) {
        ctx.strokeStyle = n.c; ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(r, 2.4), 0, 7); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = n.c;
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(r, 1.5), 0, 7); ctx.fill();
        if (renderProfile.drawNodeCores && !dim && n.type === "note") { // bright core = the "neuron soma" read
          ctx.shadowBlur = 0;
          ctx.fillStyle = foreground.core;
          ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(r * 0.38, 0.8), 0, 7); ctx.fill();
        }
      }
      ctx.shadowBlur = 0;

      if (!dim && (n === selected || n.changed)) {
        ctx.strokeStyle = n === selected ? foreground.hoverLabel : n.c;
        ctx.globalAlpha = n === selected ? 1 : .7;
        ctx.lineWidth = n === selected ? 1.8 : 1;
        ctx.setLineDash(n.changed && n !== selected ? [3, 3] : []);
        ctx.beginPath(); ctx.arc(s.x, s.y, r + (n === selected ? 6 : 4), 0, 7); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }

      const showLabel = n === hover || n === selected || match
        || (cam.z > .9 && (n.degree ?? n.deg ?? 0) >= renderProfile.labelMinDegree)
        || cam.z > renderProfile.labelZoom
        || (n.type === "folder" && cam.z > renderProfile.folderLabelZoom);
      if (showLabel && !dim) {
        ctx.font = `${n.type === "folder" ? "600 " : ""}${Math.max(10, 10.5 * Math.min(cam.z, 1.4))}px Cascadia Mono, monospace`;
        ctx.fillStyle = n === activeNode ? foreground.hoverLabel : n.type === "folder" ? foreground.folderLabel : foreground.label;
        ctx.textAlign = "center";
        const lbl = n.type === "folder" ? n.label.toUpperCase() : n.label;
        ctx.fillText(lbl.length > 26 ? lbl.slice(0, 25) + "…" : lbl, s.x, s.y + r + 12);
      }
      ctx.globalAlpha = 1;
    }
    if (hover) {
      ctx.font = "10px Cascadia Mono, monospace";
      ctx.fillStyle = foreground.meta; ctx.textAlign = "left";
      ctx.fillText(hover.id, 12, h - 28);
    }
  }
  function loop() {
    if (alpha > 0.005 && motion) tick();
    else if (alpha > 0.005) { for (let i = 0; i < 24; i++) tick(); }
    draw();
    const animate = !document.hidden && (alpha > 0.005 || dragNode || (motion && waves.length > 0));
    raf = animate ? requestAnimationFrame(loop) : null;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  /* ------- interaction ------- */
  function pick(mx, my) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].hidden) continue;
      const s = toScreen(nodes[i]);
      const r = Math.max(nodes[i].r * cam.z, 5) + 3;
      if ((mx - s.x) ** 2 + (my - s.y) ** 2 < r * r) return nodes[i];
    }
    return null;
  }
  function pos(e) { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }

  function selectNode(node, { shock = true } = {}) {
    selected = node || null;
    if (selected && shock && effects.glow && motion && mode === "cosmos") {
      waves = [{ n: selected, r: 0, max: 60 + (selected.degree ?? selected.deg ?? 0) * 4, born: performance.now() }];
    }
    opts.onSelect?.(selected);
    kick();
    return selected;
  }

  function moveSelection(delta) {
    const id = nextNodeId(nodes.filter(node => !node.hidden), selected?.id, delta);
    return selectNode(nodes.find(node => node.id === id) || null, { shock: false });
  }

  function onKeyDown(event) {
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const visible = nodes.filter(node => !node.hidden).sort((a, b) => a.id.localeCompare(b.id));
      if (event.key === "Home") selectNode(visible[0] || null, { shock: false });
      else if (event.key === "End") selectNode(visible.at(-1) || null, { shock: false });
      else moveSelection(event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "Enter" && selected?.type === "note") {
      event.preventDefault(); opts.onOpen?.(selected);
    } else if (event.key.toLowerCase() === "f" && selected) {
      event.preventDefault(); opts.onFocus?.(selected);
    } else if (event.key === "Escape") {
      event.preventDefault(); opts.onEscape?.();
    }
  }

  function onDown(e) {
    const p = pos(e); moved = 0; last = p;
    dragNode = pick(p.x, p.y);
    panning = !dragNode;
    canvas.classList.add("grabbing");
    canvas.setPointerCapture(e.pointerId);
    kick();
  }
  function onMove(e) {
    const p = pos(e);
    if (dragNode) {
      dragNode.x = (p.x - canvas.clientWidth / 2) / cam.z - cam.x;
      dragNode.y = (p.y - canvas.clientHeight / 2) / cam.z - cam.y;
      alpha = Math.max(alpha, 0.25); moved += 2; kick();
    } else if (panning) {
      cam.x += (p.x - last.x) / cam.z; cam.y += (p.y - last.y) / cam.z;
      moved += Math.abs(p.x - last.x) + Math.abs(p.y - last.y);
      last = p; kick();
    } else {
      const h = pick(p.x, p.y);
      if (h !== hover) { hover = h; canvas.style.cursor = h ? "pointer" : "grab"; kick(); }
    }
    if (panning) last = p;
  }
  function onUp(e) {
    canvas.classList.remove("grabbing");
    if (dragNode && moved < 5) {
      selectNode(dragNode);
    }
    dragNode = null; panning = false;
    kick();
  }
  function onWheel(e) {
    e.preventDefault();
    const p = pos(e);
    const f = e.deltaY < 0 ? 1.12 : 0.89;
    const nz = Math.min(4, Math.max(0.25, cam.z * f));
    cam.x += (p.x - canvas.clientWidth / 2) * (1 / nz - 1 / cam.z);
    cam.y += (p.y - canvas.clientHeight / 2) * (1 / nz - 1 / cam.z);
    cam.z = nz; kick();
  }
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKeyDown);
  const onDoubleClick = () => { if (selected?.type === "note") opts.onOpen?.(selected); };
  canvas.addEventListener("dblclick", onDoubleClick);
  const ro = new ResizeObserver(() => { kick(); });
  ro.observe(canvas);
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);
  const onMotionPreference = event => {
    motion = motionRequested && !event.matches;
    if (!motion) waves = [];
    applyLayers(); kick();
  };
  motionQuery.addEventListener?.("change", onMotionPreference);

  return {
    setData, legend, setLayers, select: id => selectNode(nodes.find(node => node.id === id) || null, { shock: false }), moveSelection,
    setMode(next) { mode = next === "parity" ? "parity" : "cosmos"; applyLayers(); kick(); },
    setMotion(next) {
      motionRequested = Boolean(next);
      motion = motionRequested && !motionQuery.matches;
      if (!motion) waves = [];
      applyLayers(); kick();
    },
    setQuery(q) { query = q || ""; kick(); },
    reheat() { refreshTheme(); kick(); },
    destroy() { ro.disconnect(); document.removeEventListener("visibilitychange", onVis); motionQuery.removeEventListener?.("change", onMotionPreference); if (raf) cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("wheel", onWheel); canvas.removeEventListener("keydown", onKeyDown); canvas.removeEventListener("dblclick", onDoubleClick); },
  };
}
