/**
 * Electron IPC client. Uses the preload `window.livingPets` bridge.
 * The renderer never opens Postgres or imports the simulation kernel.
 */
import type { ClientToHost, QueryResult } from "@boing-pets/contract";
import type { HostMessageHandler, IpcClient } from "./ipc";

type LivingPetsBridge = {
  send(message: ClientToHost): void;
  onHostMessage(handler: HostMessageHandler): () => void;
  query(
    message: Extract<ClientToHost, { message: `query.${string}` }>,
  ): Promise<QueryResult>;
};

declare global {
  interface Window {
    livingPets?: LivingPetsBridge;
  }
}

export function isElectronBridgeAvailable(): boolean {
  return typeof window !== "undefined" && window.livingPets != null;
}

export function createElectronIpc(): IpcClient {
  const bridge = window.livingPets;
  if (bridge == null) {
    throw new Error("livingPets preload bridge missing");
  }

  let disposed = false;

  return {
    send(message) {
      if (disposed) return;
      bridge.send(message);
    },
    onHostMessage(handler) {
      if (disposed) return () => undefined;
      return bridge.onHostMessage(handler);
    },
    async query(message) {
      if (disposed) throw new Error("ipc disposed");
      const result = await bridge.query(message);
      if (result.message !== message.message) {
        throw new Error(
          `query mismatch: sent ${message.message}, got ${result.message}`,
        );
      }
      return result;
    },
    dispose() {
      disposed = true;
    },
  };
}
