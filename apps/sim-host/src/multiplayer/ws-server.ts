/**
 * WebSocket shared-world server (M22).
 * Opt-in transport: local Electron / browser-worker paths stay unchanged.
 */
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { SharedWorldHost } from "./shared-world-host";
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
};

export type SharedWorldWsServer = {
  /** Bound port after listen. */
  port: number;
  /** Base ws URL, e.g. ws://127.0.0.1:12345 */
  url: string;
  close(): Promise<void>;
};

type SocketState = {
  sessionId: string | null;
};

function send(socket: WebSocket, message: WsServerToClient): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(encodeWsServerMessage(message));
}

/**
 * Listen for multiplayer clients. Each socket must `join` before commands.
 * The SharedWorldHost remains the single writer.
 */
export async function listenSharedWorldWs(
  options: SharedWorldWsServerOptions,
): Promise<SharedWorldWsServer> {
  const hostname = options.hostname ?? "127.0.0.1";
  const httpServer: HttpServer = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("boing.pets shared-world host\n");
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (socket) => {
    const state: SocketState = { sessionId: null };

    socket.on("message", (data) => {
      void (async () => {
        try {
          const text =
            typeof data === "string"
              ? data
              : Buffer.isBuffer(data)
                ? data.toString("utf8")
                : Array.isArray(data)
                  ? Buffer.concat(data).toString("utf8")
                  : Buffer.from(data as ArrayBuffer).toString("utf8");
          const message = parseWsClientMessage(text);
          if (message == null) {
            send(socket, {
              type: "fatal",
              error: "invalid message",
            });
            return;
          }

          switch (message.type) {
            case "join": {
              if (state.sessionId != null) {
                send(socket, {
                  type: "host",
                  message: {
                    message: "session.rejected",
                    body: { reason: "already_joined" },
                  },
                });
                return;
              }
              const connection = await options.host.join({
                accountId: message.accountId,
                emit: (hostMessage) => {
                  send(socket, { type: "host", message: hostMessage });
                },
              });
              if (connection == null) return;
              state.sessionId = connection.sessionId;
              return;
            }
            case "leave": {
              if (state.sessionId != null) {
                options.host.leave(state.sessionId);
                state.sessionId = null;
              }
              socket.close();
              return;
            }
            case "command": {
              if (state.sessionId == null) {
                send(socket, {
                  type: "fatal",
                  error: "not joined",
                });
                return;
              }
              await options.host.handleCommand(
                state.sessionId,
                message.message,
              );
              return;
            }
            case "query": {
              if (state.sessionId == null) {
                send(socket, {
                  type: "query-error",
                  id: message.id,
                  error: "not joined",
                });
                return;
              }
              try {
                const result = await options.host.handleQuery(
                  state.sessionId,
                  message.message,
                );
                send(socket, {
                  type: "query-result",
                  id: message.id,
                  result,
                });
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
          send(socket, { type: "fatal", error: text });
        }
      })();
    });

    socket.on("close", () => {
      if (state.sessionId != null) {
        options.host.leave(state.sessionId);
        state.sessionId = null;
      }
    });
  });

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
