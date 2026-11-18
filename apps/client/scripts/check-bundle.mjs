import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);

const banned = [
  "DATABASE_URL",
  "@prisma/client",
  "@boing-pets/sim",
  "@boing-pets/db",
];

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
  if (!/\.(js|css|html|map)$/.test(file)) continue;
  const text = await readFile(file, "utf8");
  for (const needle of banned) {
    if (text.includes(needle)) {
      console.error(`banned "${needle}" in ${path.relative(dist, file)}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log(`client bundle clean (${files.length} files)`);
