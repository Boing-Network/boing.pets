import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);

/** Never allowed anywhere in the client dist (including the host worker). */
const bannedEverywhere = ["DATABASE_URL", "@prisma/client"];

/**
 * Kernel / db strings stay out of the renderer graph. The dedicated host
 * worker may include `@boing-pets/sim` / `@boing-pets/db` because it is the
 * browser single-writer process (IndexedDB-backed HostRuntime).
 */
const bannedInRenderer = ["@boing-pets/sim", "@boing-pets/db"];

function isHostWorkerAsset(relativePath) {
  const base = path.basename(relativePath);
  return (
    base.includes("host-worker") ||
    relativePath.includes(`${path.sep}host-worker`)
  );
}

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

const files = await walk(dist);
let failed = false;
for (const file of files) {
  // Scan shipped assets only. Source maps may retain original package
  // specifiers from aliased stubs without shipping those packages.
  if (!/\.(js|css|html)$/.test(file)) continue;
  const relative = path.relative(dist, file);
  const text = await readFile(file, "utf8");
  const worker = isHostWorkerAsset(relative);

  for (const needle of bannedEverywhere) {
    if (text.includes(needle)) {
      console.error(`banned "${needle}" in ${relative}`);
      failed = true;
    }
  }

  if (!worker) {
    for (const needle of bannedInRenderer) {
      if (text.includes(needle)) {
        console.error(`banned "${needle}" in renderer ${relative}`);
        failed = true;
      }
    }
  }
}
if (failed) process.exit(1);
console.log(`client bundle clean (${files.length} files)`);
