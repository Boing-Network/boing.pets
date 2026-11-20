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

/** Boing testnet chain id (0x1b01) that sign-in messages are bound to. */
export const MP_WALLET_CHAIN_ID = 6913;
/** Presence frames per second the server accepts from one socket. */
export const MP_PRESENCE_MAX_HZ = 5;
/** Most players listed in one `players` frame. */
export const MP_MAX_LISTED_PLAYERS = 64;

export type WalletProof = {
  /** Boing account id: `0x` + 64 hex (Ed25519 public key). */
  address: string;
  nonce: string;
  /** Ed25519 signature over BLAKE3(message), hex. */
  signature: string;
};

export type PlayerPresence = {
  /** Session id (matches `welcome.sessionId` for yourself). */
  id: string;
  name: string;
  role: SessionRole;
  /** True for wallet-signed sessions. */
  wallet: boolean;
  x: number;
  z: number;
};

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
      /** Signed answer to an `auth-challenge`: join as this Boing wallet. */
      wallet?: WalletProof;
    }
  /** Ask for a sign-in message for `address` (allowed before `hello`). */
  | { type: "auth-challenge"; address: string }
  /** Where this player is looking (camera focus, world units). */
  | { type: "presence"; x: number; z: number }
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
      /** Set when the session is signed in with a Boing wallet. */
      wallet?: string;
    }
  | {
      type: "auth-challenge";
      address: string;
      nonce: string;
      /** Exact text to sign with `boing_signMessage`. */
      message: string;
      expiresAt: number;
    }
  /** Everyone's presence; sent a few times a second while anything moves. */
  | { type: "players"; players: PlayerPresence[] }
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
