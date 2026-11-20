/**
 * Connected client sessions for a shared-world host.
 * Clients are view + influence only; they never own the writer role.
 */
import type { HostToClient, SessionRole } from "@boing-pets/contract";

/** Ordering info for transports: broadcast sequence, or a base (resync) point. */
export type EmitMeta = { seq: number; base?: boolean };

export type ClientEmit = (message: HostToClient, meta?: EmitMeta) => void;

export type ClientConnection = {
  sessionId: string;
  accountId: string;
  emit: ClientEmit;
  joinedAtMs: number;
  /** Shared-world role; only owners may pause or rescale. */
  role: SessionRole;
  displayName: string;
};

export type ClientRegistry = {
  size(): number;
  list(): ClientConnection[];
  get(sessionId: string): ClientConnection | undefined;
  findByAccount(accountId: string): ClientConnection[];
  register(connection: ClientConnection): void;
  unregister(sessionId: string): ClientConnection | undefined;
  broadcast(message: HostToClient, meta?: EmitMeta): void;
  send(sessionId: string, message: HostToClient, meta?: EmitMeta): void;
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
    broadcast(message, meta) {
      for (const client of bySession.values()) {
        client.emit(message, meta);
      }
    },
    send(sessionId, message, meta) {
      const client = bySession.get(sessionId);
      if (client == null) return;
      client.emit(message, meta);
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
