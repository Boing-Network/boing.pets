/**
 * Connected client sessions for a shared-world host.
 * Clients are view + influence only; they never own the writer role.
 */
import type { HostToClient } from "@boing-pets/contract";

export type ClientEmit = (message: HostToClient) => void;

export type ClientConnection = {
  sessionId: string;
  accountId: string;
  emit: ClientEmit;
  joinedAtMs: number;
};

export type ClientRegistry = {
  size(): number;
  list(): ClientConnection[];
  get(sessionId: string): ClientConnection | undefined;
  findByAccount(accountId: string): ClientConnection[];
  register(connection: ClientConnection): void;
  unregister(sessionId: string): ClientConnection | undefined;
  broadcast(message: HostToClient): void;
  send(sessionId: string, message: HostToClient): void;
  clear(): void;
};

export function createClientRegistry(): ClientRegistry {
  const bySession = new Map<string, ClientConnection>();

  return {
    size() {
      return bySession.size;
    },
    list() {
      return [...bySession.values()].sort((a, b) =>
        a.sessionId.localeCompare(b.sessionId),
      );
    },
    get(sessionId) {
      return bySession.get(sessionId);
    },
    findByAccount(accountId) {
      return [...bySession.values()]
        .filter((client) => client.accountId === accountId)
        .sort((a, b) => a.sessionId.localeCompare(b.sessionId));
    },
    register(connection) {
      if (bySession.has(connection.sessionId)) {
        throw new Error(`session ${connection.sessionId} already registered`);
      }
      bySession.set(connection.sessionId, connection);
    },
    unregister(sessionId) {
      const existing = bySession.get(sessionId);
      if (existing == null) return undefined;
      bySession.delete(sessionId);
      return existing;
    },
    broadcast(message) {
      for (const client of bySession.values()) {
        client.emit(message);
      }
    },
    send(sessionId, message) {
      const client = bySession.get(sessionId);
      if (client == null) return;
      client.emit(message);
    },
    clear() {
      bySession.clear();
    },
  };
}

let nextSessionSerial = 1;

/** Allocate a host-local session id (not a sim id). */
export function allocateSessionId(nowMs: number = Date.now()): string {
  const serial = nextSessionSerial;
  nextSessionSerial += 1;
  return `sess_${nowMs.toString(36)}_${serial.toString(36)}`;
}
