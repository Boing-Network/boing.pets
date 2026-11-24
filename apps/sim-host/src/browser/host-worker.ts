/**
 * Browser sim-host worker. Runs the same HostRuntime as Electron main, with
 * IndexedDB durability instead of Postgres. The renderer never imports this
 * file — it only talks contract IPC over postMessage.
 */
import type {
  ClientToHost,
  HostToClient,
  QueryResult,
} from "@boing-pets/contract";
import { createMintEdgeFromEnv, createRepositoryNftLinkStore } from "../boing";
import {
  BrowserWorldRepository,
  createIndexedDbStringStore,
} from "../persist/browser-repository";
import { createHostRuntime, type HostRuntime } from "../runtime/host-runtime";

export type WorkerToClient =
  | { type: "ready" }
  | { type: "host"; message: HostToClient }
  | { type: "query-result"; id: number; result: QueryResult }
  | { type: "query-error"; id: number; error: string }
  | { type: "fatal"; error: string };

export type ClientToWorker =
  | { type: "start"; seed?: number; scale?: 1 | 4 | 16 | 64 }
  | { type: "command"; message: ClientToHost }
  | { type: "query"; id: number; message: ClientToHost }
  | { type: "quit" };

type WorkerScope = {
  postMessage(message: WorkerToClient): void;
  onmessage: ((event: { data: ClientToWorker }) => void) | null;
};

const workerScope = globalThis as unknown as WorkerScope;

const DEFAULT_SEED = 1;
/** Browser demo defaults to 64× so creatures act within a short watch. */
const DEFAULT_SCALE = 64;

let runtime: HostRuntime | null = null;
let starting = false;

function post(message: WorkerToClient): void {
  workerScope.postMessage(message);
}

function emit(message: HostToClient): void {
  post({ type: "host", message });
}

async function start(seed: number, scale: 1 | 4 | 16 | 64): Promise<void> {
  if (runtime != null || starting) return;
  starting = true;
  try {
    const repository = new BrowserWorldRepository({
      store: createIndexedDbStringStore(),
    });
    // Browser demo stays offline-safe unless LIVING_PETS_BOING_MINTING is set.
    runtime = createHostRuntime({
      repository,
      seed,
      emit,
      autoFrame: true,
      // Demo default speed applies only until the player picks a scale;
      // a saved scale survives reload.
      initialScale: scale,
      mintEdge: createMintEdgeFromEnv(
        typeof process !== "undefined" ? process.env : {},
        createRepositoryNftLinkStore(repository),
      ),
    });
    await runtime.start();
    post({ type: "ready" });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    post({ type: "fatal", error: text });
    throw error;
  } finally {
    starting = false;
  }
}

async function quit(): Promise<void> {
  if (runtime == null) return;
  const active = runtime;
  runtime = null;
  await active.quit();
}

workerScope.onmessage = (event) => {
  const data = event.data;
  void (async () => {
    try {
      switch (data.type) {
        case "start":
          await start(data.seed ?? DEFAULT_SEED, data.scale ?? DEFAULT_SCALE);
          return;
        case "command":
          if (runtime == null) return;
          {
            const outcome = await runtime.handleCommand(data.message);
            if (!outcome.ok) {
              emit({
                message: "session.notice",
                body: { code: outcome.code, detail: outcome.detail },
              });
            }
          }
          return;
        case "query": {
          if (runtime == null) {
            post({
              type: "query-error",
              id: data.id,
              error: "host not started",
            });
            return;
          }
          try {
            const result = await runtime.handleQuery(data.message);
            post({ type: "query-result", id: data.id, result });
          } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            post({ type: "query-error", id: data.id, error: text });
          }
          return;
        }
        case "quit":
          await quit();
          return;
        default:
          return;
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      post({ type: "fatal", error: text });
    }
  })();
};
