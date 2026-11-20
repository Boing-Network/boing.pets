/**
 * Node file-backed BrowserStringStore: one JSON file per key, replaced
 * atomically (write temp, then rename) so a crash never leaves half a save.
 * Lets the shared-world server reuse BrowserWorldRepository without Postgres.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserStringStore } from "./browser-repository";

function fileFor(dir: string, key: string): string {
  return path.join(dir, `${key.replace(/[^a-zA-Z0-9_.-]/g, "_")}.json`);
}

export function createFileStringStore(dir: string): BrowserStringStore {
  let chain: Promise<unknown> = Promise.resolve();
  return {
    async get(key) {
      try {
        return await readFile(fileFor(dir, key), "utf8");
      } catch (error) {
        if ((error as { code?: unknown }).code === "ENOENT") return null;
        throw error;
      }
    },
    set(key, value) {
      // Serialise writes so an older commit never lands after a newer one.
      const write = chain.then(async () => {
        await mkdir(dir, { recursive: true });
        const target = fileFor(dir, key);
        const temp = `${target}.${process.pid}.tmp`;
        await writeFile(temp, value, "utf8");
        await rename(temp, target);
      });
      chain = write.catch(() => {});
      return write;
    },
  };
}
