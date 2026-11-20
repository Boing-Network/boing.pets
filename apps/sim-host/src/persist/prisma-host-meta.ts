/**
 * Host-meta sidecar stored in Postgres (`host_meta`, one row) instead of a
 * file. The shared-world server on Fly.io uses it because a machine's root
 * disk is replaced on every deploy; the desktop keeps the file next to its
 * embedded Postgres data dir.
 */
import type { DbClient } from "@boing-pets/db";
import {
  normalizeHostMeta,
  type HostMeta,
  type HostMetaStore,
} from "./host-meta";

const ROW_ID = 1;

/** The slice of the Prisma client this store needs (keeps tests honest). */
export type HostMetaTableClient = {
  hostMeta: {
    findUnique(args: {
      where: { id: number };
    }): Promise<{ data: unknown } | null>;
    upsert(args: {
      where: { id: number };
      create: { id: number; data: object };
      update: { data: object };
    }): Promise<unknown>;
  };
};

export function createPrismaHostMetaStore(
  client: DbClient | HostMetaTableClient,
): HostMetaStore {
  const table = (client as HostMetaTableClient).hostMeta;
  return {
    async read(): Promise<HostMeta> {
      const row = await table.findUnique({ where: { id: ROW_ID } });
      return normalizeHostMeta(row?.data ?? { influenceAcceptedAtMs: [] });
    },
    async write(meta: HostMeta): Promise<void> {
      const data = normalizeHostMeta(meta) as unknown as object;
      await table.upsert({
        where: { id: ROW_ID },
        create: { id: ROW_ID, data },
        update: { data },
      });
    },
  };
}
