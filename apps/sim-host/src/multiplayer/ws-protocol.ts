/**
 * WebSocket framing for the shared-world host.
 * Mirrors the browser worker envelope so clients speak one contract shape.
 */
import type {
  ClientToHost,
  HostToClient,
  QueryResult,
} from "@boing-pets/contract";

export type WsClientToServer =
  | { type: "join"; accountId: string }
  | { type: "command"; message: ClientToHost }
  | { type: "query"; id: number; message: ClientToHost }
  | { type: "leave" };

export type WsServerToClient =
  | { type: "host"; message: HostToClient }
  | { type: "query-result"; id: number; result: QueryResult }
  | { type: "query-error"; id: number; error: string }
  | { type: "fatal"; error: string };

export function parseWsClientMessage(raw: string): WsClientToServer | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as { type?: unknown };
  if (typeof record.type !== "string") return null;
  switch (record.type) {
    case "join": {
      const accountId = (parsed as { accountId?: unknown }).accountId;
      if (typeof accountId !== "string") return null;
      return { type: "join", accountId };
    }
    case "command": {
      const message = (parsed as { message?: unknown }).message;
      if (message == null || typeof message !== "object") return null;
      return { type: "command", message: message as ClientToHost };
    }
    case "query": {
      const id = (parsed as { id?: unknown }).id;
      const message = (parsed as { message?: unknown }).message;
      if (typeof id !== "number" || !Number.isSafeInteger(id)) return null;
      if (message == null || typeof message !== "object") return null;
      return { type: "query", id, message: message as ClientToHost };
    }
    case "leave":
      return { type: "leave" };
    default:
      return null;
  }
}

export function encodeWsServerMessage(message: WsServerToClient): string {
  return JSON.stringify(message);
}
