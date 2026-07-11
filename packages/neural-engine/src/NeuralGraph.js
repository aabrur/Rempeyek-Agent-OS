/* NeuralGraph — cosmos-neural force-directed graph, pure 2D canvas.
   Renders the 4-layer vault graph from /api/graph: link | ghost | tag | folder.
   API: const g = NeuralGraph(canvas, {onOpen});
        g.setData({nodes,edges,stats}); g.setQuery(q);
        g.setLayers({link,ghost,tag,folder}); g.reheat(); g.destroy() */
export function NeuralGraph(canvas, opts = {}) {
  const ctx = canvas.getContext("2d");
  const PALETTE = ["#8C5BFF", "#4C9BFF", "#00E5FF", "#FFB01F", "#FF3DD8", "#3CFFC8", "#A78BFA", "#FF8A3C", "#F2E34C", "#FF4D6A"];
  const TAG_COLOR = "#FF3DD8", GHOST_COLOR = "#8E88BE", FOLDER_COLOR = "#7C5CFF";
  // per-layer physics + stroke: folders form the short stiff skeleton, links the mid web,
  // tags/ghosts long loose threads — that spread is what makes it read as tissue, not a blob
  const EDGE = {
    link:   { rgb: "90,160,255",  w: 1.15, a: .34, curve: .16, len: 95,  k: .0045 },
    ghost:  { rgb: "160,140,255", w: .8,   a: .15, curve: .10, len: 120, k: .0018, dash: [3, 5] },
    tag:    { rgb: "255,61,216",  w: .8,   a: .18, curve: .24, len: 140, k: .0016 },
    folder: { rgb: "124,92,255",  w: .9,   a: .13, curve: .06, len: 62,  k: .006 },
  };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let nodes = [], allEdges = [], edges = [], folderColor = new Map();
  let layers = { link: true, ghost: true, tag: true, folder: true };
  let particles = [];
  let waves = [], lastAuto = 0;   // shockwaves: neural firing rings, auto + on click
  let cam = { x: 0, y: 0, z: 1 };
  let alpha = 0;
  let hover = null, dragNode = null, panning = false, query = "";
  let raf = null, last = { x: 0, y: 0 }, moved = 0, dpr = 1;
  let stars = null; // offscreen starfield, rebuilt on resize

  function colorOf(folder) {
    const top = (folder || "").split("/")[0];
    if (!folderColor.has(top)) folderColor.set(top, PALETTE[folderColor.size % PALETTE.length]);
    return folderColor.get(top);
  }
  function nodeColor(n) {
    if (n.type === "tag") return TAG_COLOR;
    if (n.type === "ghost") return GHOST_COLOR;
    if (n.type === "folder") return FOLDER_COLOR;
    return colorOf(n.folder);
  }
  function nodeRadius(n) {
    if (n.type === "folder") return 5.5 + Math.min(n.deg, 30) * 0.35;
    if (n.type === "tag") return 3.5 + Math.min(n.deg, 16) * 0.5;
    if (n.type === "ghost") return 2.6;
    return 3.2 + Math.min(n.deg, 14) * 1.05;
  }

  function setData(data) {
    folderColor = new Map();
    const old = new Map(nodes.map(n => [n.id, n]));
    const W = canvas.clientWidth || 800, H = canvas.clientHeight || 600;
    nodes = data.nodes.map(n => {
      const prev = old.get(n.id);
      return {
        ...n,
        x: prev ? prev.x : (Math.random() - 0.5) * W * 0.9,
        y: prev ? prev.y : (Math.random() - 0.5) * H * 0.9,
        vx: 0, vy: 0,
        r: nodeRadius(n),
        c: null, // assigned after folder colors settle (notes first for stable palette order)
      };
    });
    // color notes first so folder palette order is driven by real content folders
    for (const n of nodes) if (n.type === "note") n.c = nodeColor(n);
    for (const n of nodes) if (!n.c) n.c = nodeColor(n);
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    allEdges = (data.edges || [])
      .filter(e => idx.has(e.s) && idx.has(e.t))
      .map(e => ({ a: nodes[idx.get(e.s)], b: nodes[idx.get(e.t)], type: e.type || "link" }));
    applyLayers();
    alpha = 1;
    kick();
  }

  function applyLayers() {
    edges = allEdges.filter(e => layers[e.type]);
    // a node hides when its own layer is off (notes always show)
    for (const n of nodes) n.hidden = (n.type === "ghost" && !layers.ghost) ||
      (n.type === "tag" && !layers.tag) || (n.type === "folder" && !layers.folder);
    const linkEdges = edges.filter(e => e.type === "link" && !e.a.hidden && !e.b.hidden);
    const want = reduce ? 0 : Math.min(80, linkEdges.length);
    particles = Array.from({ length: want }, () => ({
      e: linkEdges[(Math.random() * linkEdges.length) | 0],
      t: Math.random(), sp: 0.002 + Math.random() * 0.004,
    }));
  }
  function setLayers(on) {
    layers = { ...layers, ...on };
    applyLayers();
    alpha = Math.max(alpha, 0.4);
    kick();
  }

  function legend() {
    return [...folderColor.entries()].map(([name, color]) => ({ name, color }));
  }

  /* ------- simulation ------- */
  function tick() {
    const N = nodes.length;
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      if (a.hidden) continue;
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j];
        if (b.hidden) continue;
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { d2 = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
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
    }
    alpha = Math.max(0, alpha - 0.0035);
  }

  /* ------- render ------- */
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
      stars = buildStars(w, h);
    }
  }
  function buildStars(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    const n = Math.round((w * h) / 6500);
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      x.fillStyle = r > 0.94 ? "rgba(140,180,255,.8)" : r > 0.85 ? "rgba(200,180,255,.55)" : "rgba(220,220,255,.28)";
      x.beginPath(); x.arc(Math.random() * w, Math.random() * h, r > 0.9 ? 1.2 : 0.6, 0, 7); x.fill();
    }
    return c;
  }
  function toScreen(n) {
    return {
      x: canvas.clientWidth / 2 + (n.x + cam.x) * cam.z,
      y: canvas.clientHeight / 2 + (n.y + cam.y) * cam.z,
    };
  }
  function bez(A, B, curve, t) {
    const mx = (A.x + B.x) / 2 - (B.y - A.y) * curve;
    const my = (A.y + B.y) / 2 + (B.x - A.x) * curve;
    const u = 1 - t;
    return { x: u * u * A.x + 2 * u * t * mx + t * t * B.x, y: u * u * A.y + 2 * u * t * my + t * t * B.y };
  }
  function draw() {
    resize();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (stars) ctx.drawImage(stars, 0, 0);

    const q = query.toLowerCase();
    const neighbors = new Set();
    if (hover) { neighbors.add(hover); for (const e of edges) { if (e.a === hover) neighbors.add(e.b); if (e.b === hover) neighbors.add(e.a); } }

    const now = performance.now();

    // plasma halos under the strongest hubs — breathing glow that follows real degree
    for (const n of nodes) {
      if (n.hidden || n.deg < 8 || n.type === "ghost") continue;
      const s = toScreen(n);
      const breathe = reduce ? 1 : 1 + 0.10 * Math.sin(now / 1100 + n.deg * 1.7);
      const R = (30 + n.deg * 3.2) * cam.z * breathe;
      if (s.x < -R || s.y < -R || s.x > w + R || s.y > h + R) continue;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, R);
      g.addColorStop(0, n.c + "2C");
      g.addColorStop(1, n.c + "00");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, 7); ctx.fill();
    }

    // neural firing: a random hub emits a shockwave every few seconds; clicks fire one too
    if (!reduce && now - lastAuto > 3400) {
      const hubs = nodes.filter(n => !n.hidden && n.deg >= 8 && n.type !== "ghost");
      if (hubs.length) {
        const n = hubs[(Math.random() * hubs.length) | 0];
        waves.push({ n, r: 0, max: 70 + n.deg * 4, born: now });
      }
      lastAuto = now;
    }
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
      ctx.shadowColor = wv.n.c; ctx.shadowBlur = 12 * (1 - t);
      ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, 7); ctx.stroke();
      ctx.globalAlpha = fade * 0.7;
      ctx.strokeStyle = "rgba(255,255,255,.8)";
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
      ctx.strokeStyle = hot ? "rgba(0,229,255,.75)" : `rgba(${st.rgb},${dim ? st.a * 0.35 : st.a})`;
      ctx.lineWidth = hot ? 1.6 : st.w;
      ctx.setLineDash(st.dash || []);
      const mx = (A.x + B.x) / 2 - (B.y - A.y) * st.curve;
      const my = (A.y + B.y) / 2 + (B.x - A.x) * st.curve;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(mx, my, B.x, B.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // signal particles drifting along real wikilink edges
    if (particles.length && !hover) {
      for (const p of particles) {
        p.t += p.sp;
        if (p.t > 1) { p.t = 0; }
        const A = toScreen(p.e.a), B = toScreen(p.e.b);
        const pt = bez(A, B, EDGE.link.curve, p.t);
        if (pt.x < 0 || pt.y < 0 || pt.x > w || pt.y > h) continue;
        ctx.fillStyle = "rgba(140,200,255,.9)";
        ctx.shadowColor = "#4C9BFF"; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 1.3, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    for (const n of nodes) {
      if (n.hidden) continue;
      const s = toScreen(n);
      if (s.x < -30 || s.y < -30 || s.x > w + 30 || s.y > h + 30) continue;
      const match = q && (n.label.toLowerCase().includes(q) || (n.folder || "").toLowerCase().includes(q));
      const dim = (q && !match) || (hover && !neighbors.has(n));
      const r = n.r * cam.z * (n === hover ? 1.35 : 1);
      ctx.globalAlpha = dim ? 0.13 : (n.type === "ghost" ? 0.55 : 1);
      ctx.shadowColor = n.c;
      ctx.shadowBlur = dim ? 0 : (n === hover || match ? 26 : n.deg >= 8 ? 18 : 10);

      if (n.type === "folder") {
        ctx.strokeStyle = n.c; ctx.lineWidth = 1.4;
        ctx.fillStyle = n.c + "2E";
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(r, 2), 0, 7); ctx.fill(); ctx.stroke();
      } else if (n.type === "tag") {
        ctx.fillStyle = n.c;
        const d = Math.max(r, 2.2);
        ctx.beginPath(); ctx.moveTo(s.x, s.y - d); ctx.lineTo(s.x + d, s.y); ctx.lineTo(s.x, s.y + d); ctx.lineTo(s.x - d, s.y); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = n.c;
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(r, 1.5), 0, 7); ctx.fill();
        if (!dim && n.type === "note") { // bright core = the "neuron soma" read
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(255,255,255,.85)";
          ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(r * 0.38, 0.8), 0, 7); ctx.fill();
        }
      }
      ctx.shadowBlur = 0;

      const showLabel = n === hover || match || (cam.z > 0.9 && n.deg >= 3) || cam.z > 1.6 || (n.type === "folder" && cam.z > 0.55);
      if (showLabel && !dim) {
        ctx.font = `${n.type === "folder" ? "600 " : ""}${Math.max(10, 10.5 * Math.min(cam.z, 1.4))}px Cascadia Mono, monospace`;
        ctx.fillStyle = n === hover ? "#EEEBFF" : n.type === "folder" ? "rgba(190,175,255,.9)" : "rgba(220,214,255,.75)";
        ctx.textAlign = "center";
        const lbl = n.type === "folder" ? n.label.toUpperCase() : n.label;
        ctx.fillText(lbl.length > 26 ? lbl.slice(0, 25) + "…" : lbl, s.x, s.y + r + 12);
      }
      ctx.globalAlpha = 1;
    }
    if (hover) {
      ctx.font = "10px Cascadia Mono, monospace";
      ctx.fillStyle = "#8E88BE"; ctx.textAlign = "left";
      ctx.fillText(hover.id, 12, h - 28);
    }
  }
  function loop() {
    if (alpha > 0.005 && !reduce) tick();
    else if (alpha > 0.005) { for (let i = 0; i < 24; i++) tick(); }
    draw();
    // particles + waves keep the cosmos alive; stop only when the canvas is hidden (other view active)
    const animate = alpha > 0.005 || hover || dragNode || waves.length > 0 ||
      (particles.length && canvas.clientWidth > 0 && !document.hidden);
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
      waves.push({ n: dragNode, r: 0, max: 60 + dragNode.deg * 4, born: performance.now() });
      // only real notes open in Obsidian — ghost/tag/folder nodes have no file behind them
      if (opts.onOpen && dragNode.type === "note") opts.onOpen(dragNode);
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
  const ro = new ResizeObserver(() => { kick(); });
  ro.observe(canvas);
  const onVis = () => kick();
  document.addEventListener("visibilitychange", onVis);

  return {
    setData, legend, setLayers,
    setQuery(q) { query = q || ""; kick(); },
    reheat() { alpha = Math.max(alpha, 0.5); kick(); },
    destroy() { ro.disconnect(); document.removeEventListener("visibilitychange", onVis); if (raf) cancelAnimationFrame(raf); },
  };
}
