/**
 * Host-only durable sidecar for the influence rate-limit accept log.
 * Not a sim rule and not read by `step()`. Lives next to the Postgres data dir.
 *
 * M22 adds per-account accepts. Legacy files with only a flat array hydrate as
 * the `"local"` account.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_ACCOUNT_ID } from "../multiplayer/account";

export type HostMeta = {
  influenceAcceptedAtMs: number[];
  influenceAcceptedByAccount: Record<string, number[]>;
};

const EMPTY: HostMeta = {
  influenceAcceptedAtMs: [],
  influenceAcceptedByAccount: { [LOCAL_ACCOUNT_ID]: [] },
};

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
          return {
            influenceAcceptedAtMs: [],
            influenceAcceptedByAccount: { [LOCAL_ACCOUNT_ID]: [] },
          };
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

function readNumberArray(raw: unknown, label: string): number[] {
  if (!Array.isArray(raw)) {
    throw new Error(label);
  }
  const out: number[] = [];
  for (const entry of raw) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new Error(`${label} entry`);
    }
    out.push(entry);
  }
  return out;
}

function normalize(value: unknown): HostMeta {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("host meta");
  }
  const record = value as {
    influenceAcceptedAtMs?: unknown;
    influenceAcceptedByAccount?: unknown;
  };
  const influenceAcceptedAtMs = readNumberArray(
    record.influenceAcceptedAtMs,
    "influenceAcceptedAtMs",
  );

  const byAccount: Record<string, number[]> = {};
  if (record.influenceAcceptedByAccount != null) {
    if (
      typeof record.influenceAcceptedByAccount !== "object" ||
      Array.isArray(record.influenceAcceptedByAccount)
    ) {
      throw new Error("influenceAcceptedByAccount");
    }
    for (const [accountId, times] of Object.entries(
      record.influenceAcceptedByAccount as Record<string, unknown>,
    )) {
      byAccount[accountId] = readNumberArray(
        times,
        `influenceAcceptedByAccount.${accountId}`,
      );
    }
  }
  if (byAccount[LOCAL_ACCOUNT_ID] == null) {
    byAccount[LOCAL_ACCOUNT_ID] = [...influenceAcceptedAtMs];
  }

  return {
    influenceAcceptedAtMs: [...byAccount[LOCAL_ACCOUNT_ID]],
    influenceAcceptedByAccount: byAccount,
  };
}

export { EMPTY as EMPTY_HOST_META };
