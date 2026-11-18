import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Relative base so Electron can load the built index over file://.
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@boing-pets/contract": path.resolve(
        root,
        "../../packages/contract/src/index.ts",
      ),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
});
