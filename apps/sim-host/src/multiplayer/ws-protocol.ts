/**
 * WebSocket framing for the shared-world host (protocol v2). Envelope types
 * live in the contract so the browser client speaks the same shapes.
 * Payloads inside `command` / `query` are validated separately (validate.ts).
 */
import type {
  WalletProof,
  WsClientToServer,
  WsServerToClient,
} from "@boing-pets/contract";

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
      let wallet: WalletProof | undefined;
      if (record.wallet !== undefined) {
        const w = record.wallet as Record<string, unknown> | null;
        if (w == null || typeof w !== "object") return null;
        const address = optionalString(w.address, 80);
        const nonce = optionalString(w.nonce, 64);
        const signature = optionalString(w.signature, 160);
        if (!address || !nonce || !signature) return null;
        wallet = { address, nonce, signature };
      }
      return {
        type: "hello",
        v: record.v,
        ...(token !== undefined ? { token } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(ownerKey !== undefined ? { ownerKey } : {}),
        ...(wallet !== undefined ? { wallet } : {}),
      };
    }
    case "auth-challenge": {
      const address = optionalString(record.address, 80);
      return address ? { type: "auth-challenge", address } : null;
    }
    case "presence": {
      const { x, z } = record;
      if (typeof x !== "number" || typeof z !== "number") return null;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      if (Math.abs(x) > 100_000 || Math.abs(z) > 100_000) return null;
      return { type: "presence", x, z };
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
