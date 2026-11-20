/**
 * Shared-world WebSocket envelope (protocol v2). Both the Node server and the
 * browser client speak these shapes; the sim never sees them.
 *
 * Flow: client `hello` → server `welcome` + `host` snapshot (base) + clock,
 * then numbered `host` broadcasts. A client that sees a gap in `seq` sends
 * `resync` and gets a fresh base snapshot.
 */
import type {
  ClientToHost,
  HostToClient,
  QueryResult,
  SessionRole,
} from "./ipc";

export const MP_PROTOCOL_VERSION = 2;
/** Largest frame either side accepts (bytes). Snapshots go server → client. */
export const MP_MAX_CLIENT_MESSAGE_BYTES = 64 * 1024;
/** Default shared-world port for `npm run mp:serve`. */
export const MP_DEFAULT_PORT = 8787;

export type WsClientToServer =
  | {
      type: "hello";
      v: number;
      /** Session token from a previous welcome (reconnect / reload). */
      token?: string;
      /** Requested display name for a new guest. */
      name?: string;
      /** Owner key printed by the server; grants the owner role. */
      ownerKey?: string;
    }
  | { type: "command"; message: ClientToHost }
  | { type: "query"; id: number; message: ClientToHost }
  | { type: "resync" }
  | { type: "ping"; t: number }
  | { type: "leave" };

export type WsServerToClient =
  | {
      type: "welcome";
      v: number;
      token: string;
      sessionId: string;
      accountId: string;
      displayName: string;
      role: SessionRole;
      worldId: number;
    }
  | {
      type: "host";
      /** Broadcast sequence. `base` messages reset it (snapshot on join/resync). */
      seq: number;
      base?: boolean;
      message: HostToClient;
    }
  | { type: "query-result"; id: number; result: QueryResult }
  | { type: "query-error"; id: number; error: string }
  | { type: "pong"; t: number }
  | { type: "error"; code: string; error: string }
  | { type: "fatal"; error: string };
