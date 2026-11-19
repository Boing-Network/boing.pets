/**
 * Browser IPC client. Spawns the sim-host worker and speaks contract messages.
 * The renderer still never imports `step`, Prisma, or DurableTables.
 */
import type { ClientToHost, QueryResult } from "@boing-pets/contract";
import type { HostMessageHandler, IpcClient } from "./ipc";

type WorkerToClient =
  | { type: "ready" }
  | { type: "host"; message: import("@boing-pets/contract").HostToClient }
  | { type: "query-result"; id: number; result: QueryResult }
  | { type: "query-error"; id: number; error: string }
  | { type: "fatal"; error: string };

type ClientToWorker =
  | { type: "start"; seed?: number; scale?: 1 | 4 | 16 | 64 }
  | { type: "command"; message: ClientToHost }
  | { type: "query"; id: number; message: ClientToHost }
  | { type: "quit" };

type PendingQuery = {
  resolve: (result: QueryResult) => void;
  reject: (error: Error) => void;
};

export type BrowserHostIpcOptions = {
  seed?: number;
  /** Demo default is 64× so the living world moves during a short visit. */
  scale?: 1 | 4 | 16 | 64;
};

export function createBrowserHostIpc(
  options: BrowserHostIpcOptions = {},
): IpcClient {
  const hostHandlers = new Set<HostMessageHandler>();
  const pending = new Map<number, PendingQuery>();
  let nextQueryId = 1;
  let disposed = false;
  let ready = false;
  const readyWaiters: Array<() => void> = [];

  const worker = new Worker(new URL("../../host-worker.ts", import.meta.url), {
    type: "module",
  });

  function whenReady(): Promise<void> {
    if (ready) return Promise.resolve();
    return new Promise((resolve) => {
      readyWaiters.push(resolve);
    });
  }

  worker.onmessage = (event: MessageEvent<WorkerToClient>) => {
    const data = event.data;
    switch (data.type) {
      case "ready":
        ready = true;
        for (const waiter of readyWaiters.splice(0)) waiter();
        return;
      case "host":
        for (const handler of hostHandlers) handler(data.message);
        return;
      case "query-result": {
        const entry = pending.get(data.id);
        if (!entry) return;
        pending.delete(data.id);
        entry.resolve(data.result);
        return;
      }
      case "query-error": {
        const entry = pending.get(data.id);
        if (!entry) return;
        pending.delete(data.id);
        entry.reject(new Error(data.error));
        return;
      }
      case "fatal":
        console.error("browser host fatal:", data.error);
        return;
      default:
        return;
    }
  };

  worker.onerror = (event) => {
    console.error("browser host worker error", event.message);
  };

  const startMessage: ClientToWorker = {
    type: "start",
    seed: options.seed ?? 1,
    scale: options.scale ?? 64,
  };
  worker.postMessage(startMessage);

  const flushQuit = () => {
    if (disposed) return;
    const quitMessage: ClientToWorker = { type: "quit" };
    worker.postMessage(quitMessage);
  };

  // Best-effort flush. Catch-up still closes any remaining wall gap on reload.
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flushQuit);
    window.addEventListener("beforeunload", flushQuit);
  }

  return {
    send(message) {
      if (disposed) return;
      if (message.message.startsWith("query.")) return;
      const command: ClientToWorker = { type: "command", message };
      void whenReady().then(() => {
        if (!disposed) worker.postMessage(command);
      });
    },
    onHostMessage(handler) {
      hostHandlers.add(handler);
      return () => {
        hostHandlers.delete(handler);
      };
    },
    async query(message) {
      if (disposed) throw new Error("ipc disposed");
      await whenReady();
      const id = nextQueryId;
      nextQueryId += 1;
      const result = await new Promise<QueryResult>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const payload: ClientToWorker = { type: "query", id, message };
        worker.postMessage(payload);
      });
      if (result.message !== message.message) {
        throw new Error(
          `query mismatch: sent ${message.message}, got ${result.message}`,
        );
      }
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", flushQuit);
        window.removeEventListener("beforeunload", flushQuit);
      }
      flushQuit();
      for (const entry of pending.values()) {
        entry.reject(new Error("ipc disposed"));
      }
      pending.clear();
      hostHandlers.clear();
      worker.terminate();
    },
  };
}
