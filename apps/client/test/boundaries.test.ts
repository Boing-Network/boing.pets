import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const clientRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      files.push(...(await walk(full)));
    } else if (/\.(ts|tsx|js|jsx|css|html|json)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

test("client sources never mention DATABASE_URL, prisma, or step()", async () => {
  const files = await walk(path.join(clientRoot, "src"));
  assert.ok(files.length > 0);
  const banned = [
    /DATABASE_URL/,
    /@prisma\/client/,
    /from ["']prisma["']/,
    /from ["']@boing-pets\/sim["']/,
    /from ["']@boing-pets\/db["']/,
    /import\s*\{[^}]*\bstep\b[^}]*\}\s*from/,
  ];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const pattern of banned) {
      assert.equal(
        pattern.test(text),
        false,
        `${path.relative(clientRoot, file)} matched ${pattern}`,
      );
    }
  }
});
