/**
 * Bundle the shared-world server into one ESM file for the Docker image
 * (`apps/sim-host/dist/server.mjs`). Workspace TypeScript is inlined; the
 * Prisma client and `ws` stay external and are installed in the runtime
 * image, which keeps it small (no tsx, no client/desktop dependencies).
 */
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  entryPoints: [path.join(root, "src/multiplayer/serve.ts")],
  outfile: path.join(root, "dist/server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  logLevel: "info",
  external: [
    "@prisma/client",
    "@prisma/adapter-pg",
    ".prisma/*",
    "pg",
    "ws",
    "bufferutil",
    "utf-8-validate",
  ],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

console.log("shared-world server bundle ok");
