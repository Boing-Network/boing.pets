/**
 * Move source maps out of dist/ after `vite build` (sourcemap: "hidden"), so
 * the deployed site does not serve them. They stay in apps/client/sourcemaps/
 * (git-ignored) for local debugging or an error-tracker upload.
 */
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const out = path.join(root, "sourcemaps");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

await rm(out, { recursive: true, force: true });
let moved = 0;
for (const file of await walk(dist)) {
  if (!file.endsWith(".map")) continue;
  const target = path.join(out, path.relative(dist, file));
  await mkdir(path.dirname(target), { recursive: true });
  await rename(file, target);
  moved += 1;
}
console.log(
  `moved ${moved} source maps to ${path.relative(process.cwd(), out)}`,
);
