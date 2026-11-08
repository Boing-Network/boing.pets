import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        ws: true,
      },
    },
  },
  test: {
    alias: {
      "cloudflare:workers": resolve(root, "tests/stubs/cloudflare-workers.ts"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        world: resolve(root, "world.html"),
        friends: resolve(root, "friends.html"),
        fishing: resolve(root, "fishing.html"),
        treasure: resolve(root, "treasure.html"),
        garden: resolve(root, "garden.html"),
        kitchen: resolve(root, "kitchen.html"),
        mining: resolve(root, "mining.html"),
        home: resolve(root, "home.html"),
        quests: resolve(root, "quests.html"),
        collections: resolve(root, "collections.html"),
        market: resolve(root, "market.html"),
        how: resolve(root, "how.html"),
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@react-three")) return "r3f";
          if (id.includes("/three/")) return "three";
          if (id.includes("react-dom")) return "react-dom";
          if (id.includes("/react/")) return "react";
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
});
