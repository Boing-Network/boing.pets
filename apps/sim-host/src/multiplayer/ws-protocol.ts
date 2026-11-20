/**
 * WebSocket framing for the shared-world host (protocol v2). Envelope types
 * live in the contract so the browser client speaks the same shapes.
 * Payloads inside `command` / `query` are validated separately (validate.ts).
 */
import type { WsClientToServer, WsServerToClient } from "@boing-pets/contract";

export type { WsClientToServer, WsServerToClient };

function optionalString(
  value: unknown,
  max: number,
): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > max) return null;
  return value;
}

/** Parse one client frame. Returns null for anything malformed. */
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
  const record = parsed as Record<string, unknown>;
  switch (record.type) {
    case "hello": {
      if (typeof record.v !== "number") return null;
      const token = optionalString(record.token, 1024);
      const name = optionalString(record.name, 64);
      const ownerKey = optionalString(record.ownerKey, 256);
      if (token === null || name === null || ownerKey === null) return null;
      return {
        type: "hello",
        v: record.v,
        ...(token !== undefined ? { token } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(ownerKey !== undefined ? { ownerKey } : {}),
      };
    }
    case "command": {
      const message = record.message;
      if (message == null || typeof message !== "object") return null;
      return { type: "command", message: message as never };
    }
    case "query": {
      const id = record.id;
      const message = record.message;
      if (typeof id !== "number" || !Number.isSafeInteger(id)) return null;
      if (message == null || typeof message !== "object") return null;
      return { type: "query", id, message: message as never };
    }
    case "resync":
      return { type: "resync" };
    case "ping":
      return typeof record.t === "number" && Number.isFinite(record.t)
        ? { type: "ping", t: record.t }
        : null;
    case "leave":
      return { type: "leave" };
    default:
      return null;
  }
}

export function encodeWsServerMessage(message: WsServerToClient): string {
  return JSON.stringify(message);
}
