/**
 * Shared-world client transport (protocol v2 over WebSocket).
 *
 * - Sends `hello` with the stored session token (and an owner key / name when
 *   given), keeps the token the server returns, so reloads and reconnects
 *   stay the same account.
 * - Tracks the broadcast `seq`; on a gap it drops live messages and asks for
 *   `resync` until a base snapshot arrives.
 * - Reconnects with capped exponential backoff and reports its status to
 *   the view store for the HUD.
 */
import {
  MP_PRESENCE_MAX_HZ,
  MP_PROTOCOL_VERSION,
  type ClientToHost,
  type PlayerPresence,
  type WalletProof,
  type HostToClient,
  type QueryResult,
  type WsClientToServer,
  type WsServerToClient,
} from "@boing-pets/contract";
import type { SharedWorldControls } from "../state/sharedWorldStore";
import type { ConnectionStatus } from "../state/worldViewStore";
import type { HostMessageHandler, IpcClient } from "./ipc";

type SocketLike = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
};

export type WsHostIpcOptions = {
  url: string;
  ownerKey?: string;
  name?: string;
  /** Token persistence; default `localStorage` when available. */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  createSocket?: (url: string) => SocketLike;
  onStatus?: (status: ConnectionStatus) => void;
  /** Called once with the welcome (e.g. to scrub an owner key from the URL). */
  onWelcome?: (welcome: Extract<WsServerToClient, { type: "welcome" }>) => void;
  /** Everyone's presence (including you; filter by session id). */
  onPlayers?: (players: PlayerPresence[]) => void;
  /** Server `error` frames (e.g. `wallet_rejected`). */
  onError?: (code: string, message: string) => void;
  /** Clock for presence throttling (tests). */
  nowMs?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  queryTimeoutMs?: number;
};

const OPEN = 1;
/** Close code the client uses to rejoin with a different identity. */
export const REJOIN_CLOSE_CODE = 4000;
const CHALLENGE_TIMEOUT_MS = 15_000;

export type WsHostIpc = IpcClient & SharedWorldControls;

export function tokenStorageKey(url: string): string {
  return `boing-pets:mp-token:${url}`;
}

/** Reconnect delay for attempt n (0-based): 0.5 s doubling, capped at 8 s. */
export function backoffMs(attempt: number, jitter = 0): number {
  return Math.min(8_000, 500 * 2 ** Math.min(attempt, 5)) + jitter;
}

type Pending = {
  resolve: (result: QueryResult) => void;
  reject: (error: Error) => void;
  timer: unknown;
};

export function createWsHostIpc(options: WsHostIpcOptions): WsHostIpc {
  const storage =
    options.storage !== undefined
      ? options.storage
      : typeof localStorage !== "undefined"
        ? localStorage
        : null;
  const createSocket =
    options.createSocket ??
    ((url: string) => new WebSocket(url) as unknown as SocketLike);
  const setTimer =
    options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ??
    ((handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>));
  const tokenKey = tokenStorageKey(options.url);

  const handlers = new Set<HostMessageHandler>();
  const pending = new Map<number, Pending>();
  let nextQueryId = 1;
  let socket: SocketLike | null = null;
  let attempt = 0;
  let retryTimer: unknown = null;
  let disposed = false;
  let live = false;
  let lastSeq: number | null = null;
  let awaitingBase = true;
  let ownerKey = options.ownerKey;
  let everLive = false;
  let walletProof: WalletProof | undefined;
  let challengeWaiter: {
    address: string;
    resolve: (value: { nonce: string; message: string }) => void;
    reject: (error: Error) => void;
    timer: unknown;
  } | null = null;
  const nowMs = options.nowMs ?? (() => Date.now());
  const presenceGapMs = 1000 / MP_PRESENCE_MAX_HZ;
  let presenceSentAt = Number.NEGATIVE_INFINITY;
  let presenceSent: { x: number; z: number } | null = null;
  // Older servers answer presence with invalid_message. A server that
  // supports it sends a players frame right after every join, so wait for one.
  let presenceSupported = false;

  function status(next: ConnectionStatus): void {
    options.onStatus?.(next);
  }

  function raw(frame: WsClientToServer): boolean {
    if (socket == null || socket.readyState !== OPEN) return false;
    socket.send(JSON.stringify(frame));
    return true;
  }

  function deliver(message: HostToClient): void {
    for (const handler of handlers) handler(message);
  }

  function onHost(frame: Extract<WsServerToClient, { type: "host" }>): void {
    if (frame.base) {
      awaitingBase = false;
      lastSeq = frame.seq;
      deliver(frame.message);
      return;
    }
    if (awaitingBase) return;
    if (lastSeq != null && frame.seq > lastSeq + 1) {
      // Missed broadcasts: ask for a fresh base instead of applying patches
      // on top of a stale view.
      awaitingBase = true;
      raw({ type: "resync" });
      return;
    }
    lastSeq = lastSeq == null ? frame.seq : Math.max(lastSeq, frame.seq);
    deliver(frame.message);
  }

  function failPending(reason: string): void {
    for (const [id, entry] of pending) {
      clearTimer(entry.timer);
      entry.reject(new Error(reason));
      pending.delete(id);
    }
  }

  function scheduleReconnect(): void {
    if (disposed || retryTimer != null) return;
    status(everLive ? "reconnecting" : "connecting");
    const delay = backoffMs(attempt, Math.floor(Math.random() * 250));
    attempt += 1;
    retryTimer = setTimer(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  function connect(): void {
    if (disposed) return;
    live = false;
    lastSeq = null;
    awaitingBase = true;
    let ws: SocketLike;
    try {
      ws = createSocket(options.url);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = ws;
    status(everLive ? "reconnecting" : "connecting");

    ws.onopen = () => {
      const token = storage?.getItem(tokenKey) ?? undefined;
      raw({
        type: "hello",
        v: MP_PROTOCOL_VERSION,
        ...(token ? { token } : {}),
        ...(options.name ? { name: options.name } : {}),
        ...(ownerKey ? { ownerKey } : {}),
        ...(walletProof ? { wallet: walletProof } : {}),
      });
    };
    ws.onmessage = (event) => {
      let frame: WsServerToClient;
      try {
        frame = JSON.parse(String(event.data)) as WsServerToClient;
      } catch {
        return;
      }
      switch (frame.type) {
        case "welcome":
          storage?.setItem(tokenKey, frame.token);
          // The owner role (and any wallet) now lives in the signed token.
          ownerKey = undefined;
          walletProof = undefined;
          presenceSent = null;
          presenceSupported = false;
          live = true;
          everLive = true;
          attempt = 0;
          status("live");
          options.onWelcome?.(frame);
          return;
        case "host":
          onHost(frame);
          return;
        case "query-result":
        case "query-error": {
          const entry = pending.get(frame.id);
          if (!entry) return;
          pending.delete(frame.id);
          clearTimer(entry.timer);
          if (frame.type === "query-result") entry.resolve(frame.result);
          else entry.reject(new Error(frame.error));
          return;
        }
        case "error":
          if (frame.code === "invalid_token") storage?.removeItem(tokenKey);
          if (frame.code === "wallet_rejected") walletProof = undefined;
          console.warn(`shared world: ${frame.code}: ${frame.error}`);
          options.onError?.(frame.code, frame.error);
          return;
        case "auth-challenge": {
          const waiter = challengeWaiter;
          if (waiter == null || waiter.address !== frame.address) return;
          challengeWaiter = null;
          clearTimer(waiter.timer);
          waiter.resolve({ nonce: frame.nonce, message: frame.message });
          return;
        }
        case "players":
          presenceSupported = true;
          options.onPlayers?.(frame.players);
          return;
        case "fatal":
          console.error(`shared world: ${frame.error}`);
          return;
        case "pong":
          return;
        default:
          return;
      }
    };
    ws.onerror = () => {
      // onclose follows; reconnect happens there.
    };
    ws.onclose = (event) => {
      const code = (event as { code?: number } | null)?.code;
      console.info(`shared world: connection closed (${code ?? "?"})`);
      if (socket === ws) socket = null;
      live = false;
      failPending("connection lost");
      if (!disposed) scheduleReconnect();
      else status("offline");
    };
  }

  function rejoin(): void {
    // Drop the current identity; onclose reconnects with the new hello.
    storage?.removeItem(tokenKey);
    if (socket != null) socket.close(REJOIN_CLOSE_CODE, "rejoin");
    else if (retryTimer == null) connect();
  }

  connect();

  return {
    requestChallenge(address) {
      if (challengeWaiter != null) {
        clearTimer(challengeWaiter.timer);
        challengeWaiter.reject(new Error("superseded"));
        challengeWaiter = null;
      }
      const want = address.toLowerCase();
      return new Promise((resolve, reject) => {
        const timer = setTimer(() => {
          challengeWaiter = null;
          reject(new Error("sign-in timed out; try again"));
        }, CHALLENGE_TIMEOUT_MS);
        challengeWaiter = { address: want, resolve, reject, timer };
        if (!raw({ type: "auth-challenge", address: want })) {
          clearTimer(timer);
          challengeWaiter = null;
          reject(new Error("shared world offline"));
        }
      });
    },
    signIn(proof) {
      walletProof = proof;
      rejoin();
    },
    signOut() {
      walletProof = undefined;
      rejoin();
    },
    sendPresence(x, z) {
      if (!live || !presenceSupported) return;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const now = nowMs();
      if (now - presenceSentAt < presenceGapMs) return;
      if (
        presenceSent != null &&
        Math.abs(presenceSent.x - x) < 0.05 &&
        Math.abs(presenceSent.z - z) < 0.05
      ) {
        return;
      }
      if (raw({ type: "presence", x, z })) {
        presenceSentAt = now;
        presenceSent = { x, z };
      }
    },
    send(message: ClientToHost) {
      if (disposed) return;
      if (!live || !raw({ type: "command", message })) {
        console.warn(`shared world offline; dropped ${message.message}`);
      }
    },
    onHostMessage(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    query(message) {
      if (disposed) return Promise.reject(new Error("ipc disposed"));
      const id = nextQueryId;
      nextQueryId += 1;
      return new Promise<QueryResult>((resolve, reject) => {
        const timer = setTimer(() => {
          pending.delete(id);
          reject(new Error(`${message.message} timed out`));
        }, options.queryTimeoutMs ?? 10_000);
        pending.set(id, { resolve, reject, timer });
        if (!raw({ type: "query", id, message })) {
          pending.delete(id);
          clearTimer(timer);
          reject(new Error("shared world offline"));
        }
      });
    },
    dispose() {
      disposed = true;
      if (retryTimer != null) clearTimer(retryTimer);
      if (challengeWaiter != null) {
        clearTimer(challengeWaiter.timer);
        challengeWaiter.reject(new Error("ipc disposed"));
        challengeWaiter = null;
      }
      failPending("ipc disposed");
      handlers.clear();
      socket?.close(1000, "bye");
      socket = null;
      status("offline");
    },
  };
}

/** `?mp=` values that force the single-player (browser-hosted) world. */
export const SINGLE_PLAYER_MP_VALUES = ["off", "local", "none", "0", "false"];

/**
 * Pick the world to join. `?mp=ws(s)://…` wins; `?mp=off` (or `local`,
 * `none`, `0`, `false`) forces single-player even when the build has a
 * default; otherwise VITE_LIVING_PETS_MP_URL (the production default) is used.
 */
export function sharedWorldFromLocation(
  search: string,
  envUrl?: string,
): { url: string; ownerKey?: string; name?: string } | null {
  const params = new URLSearchParams(search);
  const explicit = params.get("mp")?.trim();
  if (
    explicit != null &&
    SINGLE_PLAYER_MP_VALUES.includes(explicit.toLowerCase())
  ) {
    return null;
  }
  const url = explicit || envUrl?.trim() || "";
  if (!/^wss?:\/\/[^\s]+$/.test(url)) return null;
  const ownerKey = params.get("owner") ?? undefined;
  const name = params.get("name") ?? undefined;
  return { url, ...(ownerKey ? { ownerKey } : {}), ...(name ? { name } : {}) };
}
