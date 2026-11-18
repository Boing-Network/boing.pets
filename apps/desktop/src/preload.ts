/**
 * Renderer bridge. Exposes only the contract IPC surface — no Node, no Prisma.
 */
import { contextBridge, ipcRenderer } from "electron";
import type {
  ClientToHost,
  HostToClient,
  QueryResult,
} from "@boing-pets/contract";
import { IPC_FROM_HOST, IPC_QUERY, IPC_TO_HOST } from "./ipc-channels";

export type LivingPetsPreload = {
  send(message: ClientToHost): void;
  onHostMessage(handler: (message: HostToClient) => void): () => void;
  query(
    message: Extract<ClientToHost, { message: `query.${string}` }>,
  ): Promise<QueryResult>;
};

const api: LivingPetsPreload = {
  send(message) {
    ipcRenderer.send(IPC_TO_HOST, message);
  },
  onHostMessage(handler) {
    const listener = (_event: unknown, message: HostToClient) => {
      handler(message);
    };
    ipcRenderer.on(IPC_FROM_HOST, listener);
    return () => {
      ipcRenderer.removeListener(IPC_FROM_HOST, listener);
    };
  },
  query(message) {
    return ipcRenderer.invoke(IPC_QUERY, message) as Promise<QueryResult>;
  },
};

contextBridge.exposeInMainWorld("livingPets", api);
