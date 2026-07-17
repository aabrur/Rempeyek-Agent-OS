/** Structural visual modes. Keep IDs in sync with themes.css. */
export const THEMES = Object.freeze([
  { id: "minimalist", name: "Minimalist", description: "Calm, quiet, and content-first", sw: "#805B3E", bg: "#F4EFE6" },
  { id: "brutalist", name: "Brutalist", description: "Direct, high-contrast, and utilitarian", sw: "#FF4D00", bg: "#F2EBDD" },
  { id: "glassmorph", name: "Glassmorph", description: "Translucent depth with restrained light", sw: "#7DD3FC", bg: "#07111F" },
  { id: "cyberpunk", name: "Cyberpunk", description: "Neural Cosmos with meaningful energy", sw: "#00D4FF", bg: "#030918" },
]);

export const DEFAULT_THEME = "cyberpunk";
export const STORAGE_KEY = "aos-theme";
const THEME_IDS = new Set(THEMES.map(({ id }) => id));

export const LEGACY_THEME_MAP = Object.freeze({
  rempeyek: "cyberpunk", cosmos: "cyberpunk", ember: "brutalist",
  "ghost-protocol": "minimalist", "quantum-glass": "glassmorph",
  "dark-matter": "minimalist", nebula: "cyberpunk", aurora: "glassmorph",
  midnight: "minimalist", solaris: "brutalist", "crimson-rift": "cyberpunk",
  monochrome: "minimalist", "nothing-os": "brutalist",
});

export function normalizeTheme(id) {
  if (typeof id !== "string") return DEFAULT_THEME;
  const candidate = id.trim().toLowerCase();
  return THEME_IDS.has(candidate) ? candidate : LEGACY_THEME_MAP[candidate] || DEFAULT_THEME;
}

export function readTheme(storage = globalThis.localStorage) {
  try { return normalizeTheme(storage?.getItem(STORAGE_KEY)); } catch { return DEFAULT_THEME; }
}

export function applyTheme(id, root = globalThis.document?.documentElement, storage = globalThis.localStorage) {
  const normalized = normalizeTheme(id);
  if (root) root.dataset.theme = normalized;
  try { storage?.setItem(STORAGE_KEY, normalized); } catch {}
  return normalized;
}

export function accent(root = globalThis.document?.documentElement) {
  if (!root || typeof globalThis.getComputedStyle !== "function") return "#C85CFF";
  return (globalThis.getComputedStyle(root).getPropertyValue("--acc") || "#C85CFF").trim();
}

/** Apply first, then read computed presentation. This ordering is the contract
 * Canvas/SVG consumers rely on during a live theme switch. */
export function activateTheme(id, root = globalThis.document?.documentElement, storage = globalThis.localStorage, readAccent = accent) {
  const theme = applyTheme(id, root, storage);
  return { theme, accent: readAccent(root) };
}

/** Resolve radiogroup navigation without coupling keyboard behavior to React. */
export function themeSelectionFromKey(currentId, key) {
  const ids = THEMES.map(({ id }) => id);
  const current = ids.indexOf(normalizeTheme(currentId));
  if (key === "Home") return ids[0];
  if (key === "End") return ids.at(-1);
  const delta = key === "ArrowRight" || key === "ArrowDown" ? 1
    : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;
  if (!delta) return null;
  return ids[(current + delta + ids.length) % ids.length];
}
