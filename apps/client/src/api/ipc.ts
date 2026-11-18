/**
 * IPC client for the renderer. Transport is Electron later (M18).
 * Message names and bodies come from `@boing-pets/contract`.
 */
import type {
  ClientToHost,
  HostToClient,
  QueryCreature,
  QueryEvents,
  QueryFamily,
  QueryLineage,
  QueryResult,
} from "@boing-pets/contract";

export type HostMessageHandler = (message: HostToClient) => void;

type QueryRequest =
  | { message: "query.family"; body: QueryFamily }
  | { message: "query.creature"; body: QueryCreature }
  | { message: "query.lineage"; body: QueryLineage }
  | { message: "query.events"; body: QueryEvents };

export type IpcClient = {
  /** Send a command or query to the host. */
  send(message: ClientToHost): void;
  /** Subscribe to host → client pushes. Returns unsubscribe. */
  onHostMessage(handler: HostMessageHandler): () => void;
  /**
   * Request/response helper for query.* messages.
   * Memory transport resolves immediately; Electron will use invoke.
   */
  query(message: QueryRequest): Promise<QueryResult>;
  dispose(): void;
};
