/**
 * In-process IPC for browser demo / unit tests.
 * Packaged Electron uses `electron-ipc.ts` via the preload bridge instead.
 * The renderer never opens Postgres or imports the simulation kernel.
 */
import type {
  ClientToHost,
  HostToClient,
  QueryResult,
} from "@boing-pets/contract";
import type { HostMessageHandler, IpcClient } from "./ipc";

export type MemoryIpcHost = {
  /** Push a host message into the renderer (snapshot, patch, clock, catchup). */
  emit(message: HostToClient): void;
  /** Optional query handler for request/response queries. */
  setQueryHandler(
    handler: (message: ClientToHost) => QueryResult | Promise<QueryResult>,
  ): void;
};

export type MemoryIpcPair = {
  client: IpcClient;
  host: MemoryIpcHost;
};

export function createMemoryIpc(): MemoryIpcPair {
  const hostHandlers = new Set<HostMessageHandler>();
  let queryHandler:
    ((message: ClientToHost) => QueryResult | Promise<QueryResult>) | null =
    null;
  let disposed = false;

  const client: IpcClient = {
    send(message) {
      if (disposed) return;
      if (!message.message.startsWith("query.")) {
        // Clock / influence commands are accepted and ignored until a live
        // host is wired. The renderer must still be able to send them.
        return;
      }
      void message;
    },
    onHostMessage(handler) {
      hostHandlers.add(handler);
      return () => {
        hostHandlers.delete(handler);
      };
    },
    async query(message) {
      if (disposed) {
        throw new Error("ipc disposed");
      }
      if (!queryHandler) {
        throw new Error(`no query handler for ${message.message}`);
      }
      const result = await queryHandler(message);
      if (result.message !== message.message) {
        throw new Error(
          `query mismatch: sent ${message.message}, got ${result.message}`,
        );
      }
      return result;
    },
    dispose() {
      disposed = true;
      hostHandlers.clear();
      queryHandler = null;
    },
  };

  const host: MemoryIpcHost = {
    emit(message) {
      if (disposed) return;
      for (const handler of hostHandlers) {
        handler(message);
      }
    },
    setQueryHandler(handler) {
      queryHandler = handler;
    },
  };

  return { client, host };
}
