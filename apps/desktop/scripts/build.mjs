/**
 * Bundle Electron main (ESM) and preload (CJS) for packaging.
 */
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(root, "..");

const shared = {
  bundle: true,
  sourcemap: true,
  logLevel: "info",
  external: [
    "electron",
    "embedded-postgres",
    "@embedded-postgres/*",
    "@prisma/client",
    ".prisma/*",
  ],
};

await esbuild.build({
  ...shared,
  entryPoints: [path.join(desktopRoot, "src/main.ts")],
  platform: "node",
  format: "esm",
  outfile: path.join(desktopRoot, "dist/main.js"),
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});

await esbuild.build({
  ...shared,
  entryPoints: [path.join(desktopRoot, "src/preload.ts")],
  platform: "node",
  format: "cjs",
  outfile: path.join(desktopRoot, "dist/preload.cjs"),
});

console.log("desktop build ok");
