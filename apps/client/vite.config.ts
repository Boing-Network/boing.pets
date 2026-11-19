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
    sourcemap: true,
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
