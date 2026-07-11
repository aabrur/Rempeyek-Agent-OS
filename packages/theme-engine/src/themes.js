/* @rempeyek/theme-engine — the theme registry.
   MUST stay in sync with themes.css: every id here needs a matching
   :root[data-theme="<id>"] block (except "cosmos", which IS the base :root).
     sw = accent swatch shown in the picker
     bg = swatch backdrop (the theme's --bg) */
export const THEMES = [
  { id: "rempeyek",       name: "Rempeyek",       sw: "#A78BFA", bg: "#07060E" },
  { id: "cosmos",         name: "Neural Cosmos",  sw: "#00E5FF", bg: "#050310" },
  { id: "ember",          name: "Ember",          sw: "#FFB01F", bg: "#0C0705" },
  { id: "ghost-protocol", name: "Ghost Protocol", sw: "#8CFFE0", bg: "#060A09" },
  { id: "quantum-glass",  name: "Quantum Glass",  sw: "#7DD3FC", bg: "#050810" },
  { id: "dark-matter",    name: "Dark Matter",    sw: "#9E8CFF", bg: "#030308" },
  { id: "nebula",         name: "Nebula",         sw: "#FF7EDB", bg: "#0A0416" },
  { id: "aurora",         name: "Aurora",         sw: "#55FFB8", bg: "#03100C" },
  { id: "midnight",       name: "Midnight",       sw: "#4C9BFF", bg: "#030614" },
  { id: "solaris",        name: "Solaris",        sw: "#FFC53D", bg: "#0D0900" },
  { id: "crimson-rift",   name: "Crimson Rift",   sw: "#FF3D5E", bg: "#0F0308" },
  { id: "monochrome",     name: "Monochrome",     sw: "#E6E6E6", bg: "#050505" },
  { id: "nothing-os",     name: "Nothing OS",     sw: "#D71921", bg: "#0A0A0A" },
];

export const DEFAULT_THEME = "rempeyek";
export const STORAGE_KEY = "aos-theme";

/** Read the persisted theme (falls back to the default). */
export function readTheme() {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME; } catch { return DEFAULT_THEME; }
}

/** Apply a theme to <html> and persist it. */
export function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  try { localStorage.setItem(STORAGE_KEY, id); } catch {}
}

/** The live accent (--acc) — for JS-drawn SVG/canvas that can't use var(). */
export function accent() {
  return (getComputedStyle(document.documentElement).getPropertyValue("--acc") || "#00E5FF").trim();
}
