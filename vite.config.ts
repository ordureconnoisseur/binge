import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single-file build: the reel SPA is inlined into dist/index.html. The
// vanilla-JS entry script `binge.entry.js` lives in public/ so Vite copies
// it to dist/ untouched — it runs inside Stash's main SPA via PluginApi.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 10_000_000,
  },
});
