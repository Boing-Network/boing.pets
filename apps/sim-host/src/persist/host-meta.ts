/**
 * Host-only durable sidecar for the influence rate-limit accept log.
 * Not a sim rule and not read by `step()`. Lives next to the Postgres data dir.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type HostMeta = {
  influenceAcceptedAtMs: number[];
};

const EMPTY: HostMeta = { influenceAcceptedAtMs: [] };

export type HostMetaStore = {
  read(): Promise<HostMeta>;
  write(meta: HostMeta): Promise<void>;
};

export function createFileHostMetaStore(filePath: string): HostMetaStore {
  return {
    async read() {
      try {
        const text = await readFile(filePath, "utf8");
        const parsed = JSON.parse(text) as unknown;
        return normalize(parsed);
      } catch (error) {
        if (
          error != null &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code: unknown }).code === "ENOENT"
        ) {
          return { ...EMPTY, influenceAcceptedAtMs: [] };
        }
        throw error;
      }
    },
    async write(meta) {
      await mkdir(path.dirname(filePath), { recursive: true });
      const normalized = normalize(meta);
      await writeFile(
        filePath,
        `${JSON.stringify(normalized, null, 2)}\n`,
        "utf8",
      );
    },
  };
}

function normalize(value: unknown): HostMeta {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("host meta");
  }
  const raw = (value as { influenceAcceptedAtMs?: unknown })
    .influenceAcceptedAtMs;
  if (!Array.isArray(raw)) {
    throw new Error("influenceAcceptedAtMs");
  }
  const influenceAcceptedAtMs: number[] = [];
  for (const entry of raw) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new Error("influenceAcceptedAtMs entry");
    }
    influenceAcceptedAtMs.push(entry);
  }
  return { influenceAcceptedAtMs };
}
