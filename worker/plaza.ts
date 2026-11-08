import { DurableObject } from "cloudflare:workers";
import { shortWallet } from "../src/social";
import {
  parseClientPresenceMessage,
  PRESENCE_MAX_PLAYERS,
  PRESENCE_MOVE_MIN_MS,
  WALLET_ID_RE,
  type PresencePlayer,
  type ServerPresenceMessage,
} from "../src/world/lib/presenceProtocol";

type Attachment = PresencePlayer & { lastMoveAt: number };

function send(ws: WebSocket, message: ServerPresenceMessage) {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    /* socket already closing */
  }
}

function readAttachment(ws: WebSocket): Attachment | null {
  return (ws.deserializeAttachment() as Attachment | null) ?? null;
}

export class PlazaRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    if (this.ctx.getWebSockets().length >= PRESENCE_MAX_PLAYERS) {
      return new Response("Plaza is full. Try again soon.", { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") {
      send(ws, { type: "error", message: "Text frames only" });
      return;
    }
    const parsed = parseClientPresenceMessage(message);
    if (!parsed) {
      send(ws, { type: "error", message: "Invalid presence message" });
      return;
    }
    if (parsed.type === "hello") {
      if (readAttachment(ws)) {
        send(ws, { type: "error", message: "Already joined" });
        return;
      }

      let id = parsed.id;
      let name = parsed.name;
      const color = parsed.color;
      const looksWallet = WALLET_ID_RE.test(id);

      if (parsed.token) {
        const now = Date.now();
        await this.env.DB.prepare(
          "DELETE FROM presence_tokens WHERE expires_at<?",
        )
          .bind(now)
          .run();
        const row = await this.env.DB.prepare(
          "SELECT owner,zone,expires_at FROM presence_tokens WHERE token=?",
        )
          .bind(parsed.token)
          .first<{ owner: string; zone: string; expires_at: number }>();
        if (!row || row.expires_at < now) {
          send(ws, { type: "error", message: "Presence token invalid or expired" });
          ws.close(1008, "Bad presence token");
          return;
        }
        id = row.owner;
        const profile = await this.env.DB.prepare(
          "SELECT display_name FROM profiles WHERE owner=?",
        )
          .bind(id)
          .first<{ display_name: string }>();
        name = profile?.display_name || shortWallet(id);
      } else if (looksWallet) {
        // Guests cannot claim wallet-shaped ids without a signed token.
        send(ws, {
          type: "error",
          message: "Wallet presence requires a signed token",
        });
        ws.close(1008, "Wallet token required");
        return;
      }

      // Reconnect / StrictMode remount / multi-tab: newest hello wins.
      for (const other of this.ctx.getWebSockets()) {
        if (other === ws) continue;
        const att = readAttachment(other);
        if (att?.id === id) {
          send(other, {
            type: "error",
            message: "Replaced by a newer plaza session",
          });
          try {
            other.close(1000, "replaced");
          } catch {
            /* already closing */
          }
          this.broadcast(other, { type: "leave", id });
        }
      }
      const player: PresencePlayer = {
        id,
        name,
        color,
        x: parsed.x,
        y: parsed.y,
        z: parsed.z,
      };
      ws.serializeAttachment({
        ...player,
        lastMoveAt: Date.now(),
      } satisfies Attachment);
      const players = this.listPlayers();
      send(ws, { type: "welcome", you: player.id, players });
      this.broadcast(ws, { type: "join", player });
      return;
    }

    const self = readAttachment(ws);
    if (!self) {
      send(ws, { type: "error", message: "Send hello first" });
      return;
    }
    const now = Date.now();
    if (now - self.lastMoveAt < PRESENCE_MOVE_MIN_MS) return;
    self.x = parsed.x;
    self.y = parsed.y;
    self.z = parsed.z;
    self.lastMoveAt = now;
    ws.serializeAttachment(self);
    this.broadcast(ws, {
      type: "move",
      id: self.id,
      x: self.x,
      y: self.y,
      z: self.z,
    });
  }

  async webSocketClose(ws: WebSocket) {
    const self = readAttachment(ws);
    if (self) this.broadcast(ws, { type: "leave", id: self.id });
  }

  async webSocketError(ws: WebSocket) {
    const self = readAttachment(ws);
    if (self) this.broadcast(ws, { type: "leave", id: self.id });
  }

  private listPlayers(): PresencePlayer[] {
    const players: PresencePlayer[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = readAttachment(ws);
      if (att)
        players.push({
          id: att.id,
          name: att.name,
          color: att.color,
          x: att.x,
          y: att.y,
          z: att.z,
        });
    }
    return players;
  }

  private broadcast(except: WebSocket, message: ServerPresenceMessage) {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(payload);
      } catch {
        /* ignore */
      }
    }
  }
}
