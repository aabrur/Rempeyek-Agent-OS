import { useEffect, useRef, useState } from "react";

/* Vortex cosmos backdrop — a flow-field particle canvas behind the shell.
   Ported from the Aceternity Vortex concept, but dependency-free: a small
   Perlin noise field replaces simplex-noise, theme tokens replace hardcoded
   hues, and it renders nothing when the active theme zeroes
   --graph-effect-glow (minimalist/brutalist) or the user prefers reduced
   motion. DPR is capped and the loop pauses on a hidden tab. */

const COUNT = 240;
const PROPS = 9; // x, y, vx, vy, life, ttl, speed, radius, hue
const NOISE_STEPS = 3;
const X_OFF = 0.00125, Y_OFF = 0.00125, Z_OFF = 0.0005;
const TAU = Math.PI * 2;

function makeNoise3D() {
  const perm = new Uint8Array(512);
  const p = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  perm.set(p); perm.set(p, 256);
  const grad = (h, x, y, z) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x + z; case 5: return -x + z; case 6: return y - z; default: return -y - z;
    }
  };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const mix = (a, b, t) => a + (b - a) * t;
  return (x, y, z) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return mix(
      mix(mix(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
          mix(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
      mix(mix(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
          mix(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  };
}

/* Base hue from the theme accent so the vortex re-tints on theme switch. */
function accentHue(root) {
  const raw = getComputedStyle(root).getPropertyValue("--acc").trim();
  const hex = /^#[0-9a-f]{6}$/i.test(raw) ? raw : "#c85cff";
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 260;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60);
  return (h + 360) % 360;
}

function useThemeGate() {
  const [gate, setGate] = useState({ on: true, hue: 260 });
  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const glow = getComputedStyle(root).getPropertyValue("--graph-effect-glow").trim();
      setGate({ on: glow !== "0", hue: accentHue(root) });
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return gate;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export function VortexBackdrop() {
  const canvasRef = useRef(null);
  const { on, hue } = useThemeGate();
  const reduced = useReducedMotion();
  const active = on && !reduced;

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const noise = makeNoise3D();
    const props = new Float32Array(COUNT * PROPS);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = 0, height = 0, tick = 0, raf = 0;

    const fadeInOut = (t, m) => { const hm = 0.5 * m; return Math.abs(((t + hm) % m) - hm) / hm; };

    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = width * dpr; canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const seed = i => {
      props[i] = Math.random() * width;
      props[i + 1] = height * 0.5 + (Math.random() - 0.5) * height * 0.9;
      props[i + 2] = 0; props[i + 3] = 0; props[i + 4] = 0;
      props[i + 5] = 60 + Math.random() * 150;               // ttl
      props[i + 6] = 0.25 + Math.random() * 1.1;             // speed
      props[i + 7] = 0.6 + Math.random() * 1.6;              // radius
      props[i + 8] = hue - 30 + Math.random() * 90;          // hue span around accent
    };

    resize();
    for (let i = 0; i < props.length; i += PROPS) seed(i);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      tick++;
      // trail fade: erode the previous frame instead of clearing it
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,.10)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (let i = 0; i < props.length; i += PROPS) {
        const x = props[i], y = props[i + 1];
        const n = noise(x * X_OFF, y * Y_OFF, tick * Z_OFF) * NOISE_STEPS * TAU;
        const vx = props[i + 2] * 0.5 + Math.cos(n) * 0.5;
        const vy = props[i + 3] * 0.5 + Math.sin(n) * 0.5;
        const x2 = x + vx * props[i + 6], y2 = y + vy * props[i + 6];
        const life = props[i + 4], ttl = props[i + 5];
        ctx.strokeStyle = `hsla(${props[i + 8]},95%,62%,${(fadeInOut(life, ttl) * 0.55).toFixed(3)})`;
        ctx.lineWidth = props[i + 7];
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
        props[i] = x2; props[i + 1] = y2; props[i + 2] = vx; props[i + 3] = vy; props[i + 4] = life + 1;
        if (life > ttl || x2 < 0 || x2 > width || y2 < 0 || y2 > height) seed(i);
      }
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [active, hue]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="bg-vortex" aria-hidden="true" />;
}
