/**
 * WebSocket shared-world server (protocol v2).
 *
 * - Identity: `hello` carries a signed session token (or none for a new
 *   guest); the server answers `welcome` with a fresh token. An owner key
 *   upgrades the session to the owner role (pause / rescale).
 * - Ordering: every broadcast carries `seq`; join/resync snapshots are `base`.
 *   Slow sockets skip messages instead of buffering without bound, which the
 *   client sees as a seq gap and answers with `resync`.
 * - Limits: frames over `MP_MAX_CLIENT_MESSAGE_BYTES` are refused by `ws`,
 *   every command/query is validated, and each socket is rate limited.
 *   Influence limits are per account inside the host.
 *
 * Binds 127.0.0.1 unless told otherwise.
 */
import { randomBytes } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  MP_MAX_CLIENT_MESSAGE_BYTES,
  MP_PROTOCOL_VERSION,
  type HostToClient,
  type SessionRole,
} from "@boing-pets/contract";
import type { ClientConnection, EmitMeta } from "./client-registry";
import type { SharedWorldHost } from "./shared-world-host";
import {
  SESSION_TOKEN_TTL_MS,
  newGuestAccountId,
  ownerKeyMatches,
  sanitizeDisplayName,
  signSessionToken,
  verifySessionToken,
} from "./tokens";
import { createFloodGate, validateCommand, validateQuery } from "./validate";
import {
  encodeWsServerMessage,
  parseWsClientMessage,
  type WsServerToClient,
} from "./ws-protocol";

export type SharedWorldWsServerOptions = {
  host: SharedWorldHost;
  /** Bind address. Default 127.0.0.1. */
  hostname?: string;
  /** Port. Default 0 (ephemeral). */
  port?: number;
  /** HMAC key for session tokens. Default: random per process. */
  tokenSecret?: Buffer;
  /** Owner key; a hello presenting it gets the owner role. Empty = nobody. */
  ownerKey?: string;
  nowMs?: () => number;
  /** Drop broadcasts to a socket with more than this many bytes queued. */
  maxBufferedBytes?: number;
  /** Server → client heartbeat interval (ms). 0 disables. */
  heartbeatMs?: number;
  /**
   * Consecutive unanswered heartbeats before a socket is dropped. Browsers
   * stop reading a socket while their main thread is busy (big GC, slow
   * software rendering, a backgrounded tab), so one missed pong is not death.
   */
  heartbeatMisses?: number;
  /** Connection log (joins, leaves, close codes). Never logs tokens. */
  log?: (line: string) => void;
};

export type SharedWorldWsServer = {
  /** Bound port after listen. */
  port: number;
  /** Base ws URL, e.g. ws://127.0.0.1:12345 */
  url: string;
  close(): Promise<void>;
};

type SocketState = {
  connection: ClientConnection | null;
  joining: boolean;
  /** A broadcast was skipped; the client will ask to resync. */
  skipped: boolean;
  missed: number;
  strikes: number;
};

function send(socket: WebSocket, message: WsServerToClient): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(encodeWsServerMessage(message));
}

function frameText(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data))
    return Buffer.concat(data as Buffer[]).toString("utf8");
  return Buffer.from(data as ArrayBuffer).toString("utf8");
}

/** Messages a slow client can lose and recover by resync. */
function droppable(message: HostToClient): boolean {
  return (
    message.message === "world.patch" ||
    message.message === "world.clock" ||
    message.message === "world.snapshot"
  );
}

/**
 * Backpressure for droppable live frames. Over the limit: skip. While
 * skipping, wait until the backlog halves, then rebase the client.
 */
export function slowClientDecision(
  skipped: boolean,
  bufferedBytes: number,
  maxBufferedBytes: number,
): "send" | "skip" | "rebase" {
  if (skipped) return bufferedBytes > maxBufferedBytes / 2 ? "skip" : "rebase";
  return bufferedBytes > maxBufferedBytes ? "skip" : "send";
}

export async function listenSharedWorldWs(
  options: SharedWorldWsServerOptions,
): Promise<SharedWorldWsServer> {
  const hostname = options.hostname ?? "127.0.0.1";
  const nowMs = options.nowMs ?? (() => Date.now());
  const secret = options.tokenSecret ?? randomBytes(32);
  const ownerKey = options.ownerKey ?? "";
  const maxBuffered = options.maxBufferedBytes ?? 4 * 1024 * 1024;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const heartbeatMisses = Math.max(1, options.heartbeatMisses ?? 4);
  const log = options.log ?? (() => {});

  const httpServer: HttpServer = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("boing.pets shared-world host\n");
  });

  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: MP_MAX_CLIENT_MESSAGE_BYTES,
  });
  const states = new Map<WebSocket, SocketState>();

  function deliver(
    socket: WebSocket,
    state: SocketState,
    message: HostToClient,
    meta?: EmitMeta,
  ): void {
    const seq = meta?.seq ?? options.host.seq;
    if (!meta?.base && droppable(message)) {
      const decision = slowClientDecision(
        state.skipped,
        socket.bufferedAmount,
        maxBuffered,
      );
      if (decision === "skip") {
        if (!state.skipped) {
          log(
            `slow client ${state.connection?.sessionId ?? "?"}: skipping live frames`,
          );
        }
        state.skipped = true;
        return;
      }
      if (decision === "rebase") {
        // Every live frame was dropped, so the client never sees a seq gap
        // and would never ask: push a fresh base once the backlog drains.
        state.skipped = false;
        if (state.connection != null) {
          log(`slow client ${state.connection.sessionId}: caught up, rebasing`);
          options.host.resync(state.connection.sessionId);
        }
        return;
      }
    }
    if (meta?.base) state.skipped = false;
    send(socket, {
      type: "host",
      seq,
      ...(meta?.base ? { base: true } : {}),
      message,
    });
  }

  function notice(
    socket: WebSocket,
    state: SocketState,
    code:
      "not_owner" | "rate_limited" | "influence_rejected" | "invalid_message",
    detail: string,
  ): void {
    deliver(socket, state, {
      message: "session.notice",
      body: { code, detail },
    });
  }

  async function hello(
    socket: WebSocket,
    state: SocketState,
    message: { token?: string; name?: string; ownerKey?: string },
  ): Promise<void> {
    const now = nowMs();
    let accountId: string;
    let displayName: string;
    let role: SessionRole = "player";
    if (message.token !== undefined) {
      const claims = verifySessionToken(secret, message.token, now);
      if (claims == null) {
        // Expired / foreign tokens are not fatal: start a fresh guest.
        send(socket, {
          type: "error",
          code: "invalid_token",
          error: "session token rejected; starting a new guest session",
        });
        accountId = newGuestAccountId();
        displayName = sanitizeDisplayName(
          message.name,
          `Guest ${accountId.slice(-4)}`,
        );
      } else {
        accountId = claims.sub;
        displayName = claims.name;
        role = claims.role;
      }
    } else {
      accountId = newGuestAccountId();
      displayName = sanitizeDisplayName(
        message.name,
        `Guest ${accountId.slice(-4)}`,
      );
    }
    if (ownerKeyMatches(ownerKey, message.ownerKey)) role = "owner";

    const token = signSessionToken(secret, {
      v: 1,
      sub: accountId,
      name: displayName,
      role,
      iat: now,
      exp: now + SESSION_TOKEN_TTL_MS,
    });
    const welcome: WsServerToClient = {
      type: "welcome",
      v: MP_PROTOCOL_VERSION,
      token,
      sessionId: "",
      accountId,
      displayName,
      role,
      worldId: options.host.runtime.session.snapshot.world.id,
    };
    let welcomed = false;
    const connection = await options.host.join({
      accountId,
      role,
      displayName,
      emit: (hostMessage, meta) => {
        if (!welcomed && hostMessage.message === "session.welcome") {
          welcomed = true;
          send(socket, { ...welcome, sessionId: hostMessage.body.sessionId });
        }
        deliver(socket, state, hostMessage, meta);
      },
    });
    state.connection = connection;
    if (connection != null) {
      log(
        `join ${connection.sessionId} ${accountId} (${role}) "${displayName}"`,
      );
    }
  }

  wss.on("connection", (socket) => {
    const state: SocketState = {
      connection: null,
      joining: false,
      skipped: false,
      missed: 0,
      strikes: 0,
    };
    states.set(socket, state);
    const flood = createFloodGate();

    socket.on("pong", () => {
      state.missed = 0;
    });

    socket.on("message", (data) => {
      // Any inbound frame proves the peer is alive.
      state.missed = 0;
      void (async () => {
        try {
          if (!flood.take(nowMs())) {
            state.strikes += 1;
            if (state.strikes > 50) {
              send(socket, { type: "fatal", error: "too many messages" });
              socket.close(1008, "rate limit");
              return;
            }
            send(socket, {
              type: "error",
              code: "rate_limited",
              error: "slow down",
            });
            return;
          }
          const message = parseWsClientMessage(frameText(data));
          if (message == null) {
            send(socket, {
              type: "error",
              code: "invalid_message",
              error: "invalid message",
            });
            return;
          }

          switch (message.type) {
            case "hello": {
              if (state.connection != null || state.joining) {
                send(socket, {
                  type: "error",
                  code: "already_joined",
                  error: "already joined",
                });
                return;
              }
              if (message.v !== MP_PROTOCOL_VERSION) {
                send(socket, {
                  type: "fatal",
                  error: `protocol v${message.v} unsupported; server speaks v${MP_PROTOCOL_VERSION}`,
                });
                socket.close(1002, "protocol");
                return;
              }
              state.joining = true;
              try {
                await hello(socket, state, message);
              } finally {
                state.joining = false;
              }
              return;
            }
            case "ping":
              send(socket, { type: "pong", t: message.t });
              return;
            case "leave": {
              if (state.connection != null) {
                options.host.leave(state.connection.sessionId);
                state.connection = null;
              }
              socket.close();
              return;
            }
            case "resync": {
              if (state.connection != null) {
                options.host.resync(state.connection.sessionId);
              }
              return;
            }
            case "command": {
              if (state.connection == null) {
                send(socket, {
                  type: "error",
                  code: "not_joined",
                  error: "not joined",
                });
                return;
              }
              const valid = validateCommand(message.message);
              if (!valid.ok) {
                notice(socket, state, "invalid_message", valid.reason);
                return;
              }
              const outcome = await options.host.handleCommand(
                state.connection.sessionId,
                valid.value,
              );
              if (!outcome.ok)
                notice(socket, state, outcome.code, outcome.detail);
              return;
            }
            case "query": {
              if (state.connection == null) {
                send(socket, {
                  type: "query-error",
                  id: message.id,
                  error: "not joined",
                });
                return;
              }
              const valid = validateQuery(message.message);
              if (!valid.ok) {
                send(socket, {
                  type: "query-error",
                  id: message.id,
                  error: valid.reason,
                });
                return;
              }
              try {
                const result = await options.host.handleQuery(
                  state.connection.sessionId,
                  valid.value,
                );
                send(socket, { type: "query-result", id: message.id, result });
              } catch (error) {
                const text =
                  error instanceof Error ? error.message : String(error);
                send(socket, {
                  type: "query-error",
                  id: message.id,
                  error: text,
                });
              }
              return;
            }
            default:
              return;
          }
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          send(socket, { type: "error", code: "server_error", error: text });
        }
      })();
    });

    socket.on("close", (code, reason) => {
      log(
        `close ${state.connection?.sessionId ?? "(not joined)"} code ${code}${
          reason.length > 0 ? ` ${reason.toString("utf8").slice(0, 60)}` : ""
        }`,
      );
      if (state.connection != null) {
        options.host.leave(state.connection.sessionId);
        state.connection = null;
      }
      states.delete(socket);
    });
    socket.on("error", () => {
      // Oversized frames and protocol errors close the socket; nothing else to do.
    });
  });

  const heartbeat =
    heartbeatMs > 0
      ? setInterval(() => {
          for (const [socket, state] of states) {
            if (state.missed >= heartbeatMisses) {
              log(`heartbeat timeout ${state.connection?.sessionId ?? "?"}`);
              socket.terminate();
              continue;
            }
            state.missed += 1;
            socket.ping();
          }
        }, heartbeatMs)
      : null;
  heartbeat?.unref?.();

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(options.port ?? 0, hostname, () => resolve());
  });

  const address = httpServer.address();
  if (address == null || typeof address === "string") {
    throw new Error("shared-world ws bind failed");
  }

  return {
    port: address.port,
    url: `ws://${hostname}:${address.port}`,
    async close() {
      if (heartbeat != null) clearInterval(heartbeat);
      for (const socket of states.keys()) socket.terminate();
      await new Promise<void>((resolve, reject) => {
        wss.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
