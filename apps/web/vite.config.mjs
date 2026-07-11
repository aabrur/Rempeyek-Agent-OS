import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = p => fileURLToPath(new URL(`../../packages/${p}`, import.meta.url));

/* Dev:   vite (5173) proxies /api + /avatars to the Node server (4321).
   Build: emits ./dist, which server.js serves directly — one origin, no proxy.

   The @rempeyek/* aliases point at package SOURCE, not the node_modules symlinks
   workspaces create. Without them Vite treats the packages as prebundled deps and
   never runs the React plugin over their JSX (and HMR wouldn't see edits). */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@rempeyek/ui": pkg("ui/src/index.jsx"),
      "@rempeyek/neural-engine": pkg("neural-engine/src/NeuralGraph.js"),
      "@rempeyek/theme-engine/themes.css": pkg("theme-engine/src/themes.css"),
      "@rempeyek/theme-engine": pkg("theme-engine/src/themes.js"),
      "@rempeyek/design-system/index.css": pkg("design-system/src/index.css"),
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4321", changeOrigin: true },
      "/avatars": { target: "http://localhost:4321", changeOrigin: true },
    },
  },
});
