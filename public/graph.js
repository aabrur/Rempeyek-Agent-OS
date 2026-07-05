/* NeuralGraph — force-directed graph ala Obsidian, canvas 2D murni.
   API: const g = NeuralGraph(canvas, {onOpen}); g.setData({nodes,edges}); g.setQuery(q); g.destroy() */
function NeuralGraph(canvas, opts = {}) {
  const ctx = canvas.getContext("2d");
  const PALETTE = ["#00E5FF", "#FF3DD8", "#A6FF3C", "#FFB01F", "#8C5BFF", "#FF4D6A", "#3CFFC8", "#FF8A3C", "#4C9BFF", "#F2FF3C"];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let nodes = [], edges = [], folderColor = new Map();
  let cam = { x: 0, y: 0, z: 1 };          // pan/zoom
  let alpha = 0;                            // "panas" simulasi; 0 = diam
  let hover = null, dragNode = null, panning = false, query = "";
  let raf = null, last = { x: 0, y: 0 }, moved = 0, dpr = 1;

  function colorOf(folder) {
    if (!folderColor.has(folder)) folderColor.set(folder, PALETTE[folderColor.size % PALETTE.length]);
    return folderColor.get(folder);
  }

  function setData(data) {
    folderColor = new Map();
    const old = new Map(nodes.map(n => [n.id, n]));
    const W = canvas.clientWidth || 800, H = canvas.clientHeight || 600;
    nodes = data.nodes.map(n => {
      const prev = old.get(n.id);
      return {
        ...n,
        x: prev ? prev.x : (Math.random() - 0.5) * W * 0.8,
        y: prev ? prev.y : (Math.random() - 0.5) * H * 0.8,
        vx: 0, vy: 0,
        r: 3.5 + Math.min(n.deg, 12) * 1.1,
        c: colorOf(n.folder),
      };
    });
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    edges = data.edges
      .filter(e => idx.has(e.s) && idx.has(e.t))
      .map(e => ({ a: nodes[idx.get(e.s)], b: nodes[idx.get(e.t)] }));
    alpha = 1;
    kick();
  }

  function legend() {
    return [...folderColor.entries()].map(([name, color]) => ({ name, color }));
  }

  /* ------- simulasi ------- */
  function tick() {
    const N = nodes.length;
    // tolak-menolak O(n²) — vault ratusan node masih ringan
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { d2 = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
        if (d2 > 250000) continue;
        const f = 1400 / d2;
        const d = Math.sqrt(d2);
        dx = dx / d * f; dy = dy / d * f;
        a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
      }
    }
    // pegas edge
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 90) * 0.004;
      e.a.vx += dx / d * f * 2; e.a.vy += dy / d * f * 2;
      e.b.vx -= dx / d * f * 2; e.b.vy -= dy / d * f * 2;
    }
    // gravitasi pusat + integrasi
    for (const n of nodes) {
      n.vx -= n.x * 0.0015; n.vy -= n.y * 0.0015;
      if (n !== dragNode) {
        n.x += n.vx * alpha; n.y += n.vy * alpha;
      }
      n.vx *= 0.86; n.vy *= 0.86;
    }
    alpha = Math.max(0, alpha - 0.0035);
  }

  /* ------- render ------- */
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
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
    const q = query.toLowerCase();
    const neighbors = new Set();
    if (hover) { neighbors.add(hover); for (const e of edges) { if (e.a === hover) neighbors.add(e.b); if (e.b === hover) neighbors.add(e.a); } }

    for (const e of edges) {
      const A = toScreen(e.a), B = toScreen(e.b);
      const hot = hover && (e.a === hover || e.b === hover);
      ctx.strokeStyle = hot ? "rgba(0,229,255,.55)" : "rgba(140,120,220,.16)";
      ctx.lineWidth = hot ? 1.4 : 0.7;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
    for (const n of nodes) {
      const s = toScreen(n);
      if (s.x < -30 || s.y < -30 || s.x > w + 30 || s.y > h + 30) continue;
      const match = q && (n.label.toLowerCase().includes(q) || n.folder.toLowerCase().includes(q));
      const dim = (q && !match) || (hover && !neighbors.has(n));
      const r = n.r * cam.z * (n === hover ? 1.35 : 1);
      ctx.globalAlpha = dim ? 0.16 : 1;
      ctx.shadowColor = n.c; ctx.shadowBlur = dim ? 0 : (n === hover || match ? 22 : 9);
      ctx.fillStyle = n.c;
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(r, 1.5), 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      const showLabel = n === hover || match || (cam.z > 0.9 && n.deg >= 2) || cam.z > 1.6;
      if (showLabel && !dim) {
        ctx.font = `${Math.max(10, 10.5 * Math.min(cam.z, 1.4))}px Cascadia Mono, monospace`;
        ctx.fillStyle = n === hover ? "#EEEBFF" : "rgba(220,214,255,.75)";
        ctx.textAlign = "center";
        ctx.fillText(n.label.length > 26 ? n.label.slice(0, 25) + "…" : n.label, s.x, s.y + r + 12);
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
    else if (alpha > 0.005) { for (let i = 0; i < 24; i++) tick(); } // reduced-motion: selesaikan cepat lalu diam
    draw();
    raf = (alpha > 0.005 || hover || dragNode) ? requestAnimationFrame(loop) : null;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  /* ------- interaksi ------- */
  function pick(mx, my) {
    for (let i = nodes.length - 1; i >= 0; i--) {
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
    if (dragNode && moved < 5 && opts.onOpen) opts.onOpen(dragNode);
    dragNode = null; panning = false;
    kick();
  }
  function onWheel(e) {
    e.preventDefault();
    const p = pos(e);
    const f = e.deltaY < 0 ? 1.12 : 0.89;
    const nz = Math.min(4, Math.max(0.25, cam.z * f));
    // zoom ke arah kursor
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

  return {
    setData, legend,
    setQuery(q) { query = q || ""; kick(); },
    reheat() { alpha = Math.max(alpha, 0.5); kick(); },
    destroy() { ro.disconnect(); if (raf) cancelAnimationFrame(raf); },
  };
}
