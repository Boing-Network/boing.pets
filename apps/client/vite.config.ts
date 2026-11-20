import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, "../..");

export default defineConfig({
  // Relative base so Electron can load the built index over file://.
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@boing-pets/contract": path.resolve(
        repoRoot,
        "packages/contract/src/index.ts",
      ),
      // Browser host worker only — renderer code must not import these.
      "@boing-pets/sim": path.resolve(repoRoot, "packages/sim/src/index.ts"),
      "@boing-pets/db": path.resolve(repoRoot, "packages/db/src/index.ts"),
      "@boing-pets/sim-host": path.resolve(
        repoRoot,
        "apps/sim-host/src/index.ts",
      ),
      // Fail closed if Prisma leaks into the worker graph.
      "@prisma/client": path.resolve(root, "shims/empty-prisma.ts"),
    },
  },
  build: {
    outDir: "dist",
    // Maps are written without a sourceMappingURL comment and then moved out
    // of dist/ (scripts/stash-sourcemaps.mjs), so the site never serves them.
    sourcemap: "hidden",
    // three alone is ~720 kB minified; it is lazy-loaded with the 3D view.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: app changes do not bust the 3D stack.
        manualChunks(id) {
          // Shared by the HUD and the 3D chunk: keep it with the eager code
          // so the first paint does not pull three/r3f.
          if (id.includes("vite/preload-helper")) return "react";
          if (!id.includes("node_modules")) return undefined;
          if (
            /node_modules[\\/](zustand|use-sync-external-store)[\\/]/.test(id)
          ) {
            return "react";
          }
          if (/node_modules[\\/]three[\\/]/.test(id)) return "three";
          if (
            /node_modules[\\/](@react-three|three-stdlib|troika-|camera-controls|maath|@monogrid|stats-gl|suspend-react|its-fine)/.test(
              id,
            )
          ) {
            return "r3f";
          }
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return "react";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
    fs: {
      allow: [repoRoot],
    },
  },
  worker: {
    format: "es",
  },
});
