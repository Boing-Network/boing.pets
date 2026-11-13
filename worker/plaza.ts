import { DurableObject } from "cloudflare:workers";
import { shortWallet } from "../src/social";
import {
  canSendChat,
  chatWindowOk,
  sanitizePastureChat,
} from "../src/content/pastureChat";
import type { EquippedCosmetics } from "../src/content/cosmetics";
import { loadEquipped } from "./cosmetics";
import {
  parseClientPresenceMessage,
  presencePlayerPayload,
  PRESENCE_MAX_PLAYERS,
  PRESENCE_MOVE_MIN_MS,
  WALLET_ID_RE,
  type PresencePlayer,
  type ServerPresenceMessage,
} from "../src/world/lib/presenceProtocol";
import { canSendEmote } from "../src/world/lib/emotes";
import { clampPresencePosition } from "../src/pasture3d/pathing";

type Attachment = PresencePlayer & {
  lastMoveAt: number;
  lastChatAt: number;
  lastEmoteAt: number;
  chatSentAt: number[];
};

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

async function cosmeticsForWallet(
  env: Env,
  id: string,
  looksWallet: boolean,
): Promise<EquippedCosmetics | undefined> {
  if (!looksWallet) return undefined;
  try {
    const equipped = await loadEquipped(env, id);
    return Object.keys(equipped).length ? equipped : undefined;
  } catch {
    return undefined;
  }
}

export class PlazaRoom extends DurableObject<Env> {
  private zoneId = "starter-town";

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
    try {
      const zone = new URL(request.url).searchParams.get("zone");
      if (zone) this.zoneId = zone;
    } catch {
      /* keep the last known zone for this named stub */
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
      let boundWallet = false;

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
          send(ws, {
            type: "error",
            message: "Presence token invalid or expired",
          });
          ws.close(1008, "Bad presence token");
          return;
        }
        id = row.owner;
        boundWallet = true;
        const profile = await this.env.DB.prepare(
          "SELECT display_name FROM profiles WHERE owner=?",
        )
          .bind(id)
          .first<{ display_name: string }>();
        name = profile?.display_name || shortWallet(id);
      } else if (parsed.session) {
        const now = Date.now();
        await this.env.DB.prepare(
          "DELETE FROM social_session_tokens WHERE expires_at<?",
        )
          .bind(now)
          .run();
        const row = await this.env.DB.prepare(
          "SELECT owner,expires_at FROM social_session_tokens WHERE token=?",
        )
          .bind(parsed.session)
          .first<{ owner: string; expires_at: number }>();
        if (!row || row.expires_at < now) {
          send(ws, {
            type: "error",
            message: "Social session invalid or expired",
          });
          ws.close(1008, "Bad social session");
          return;
        }
        if (looksWallet && row.owner !== id) {
          send(ws, {
            type: "error",
            message: "Social session does not match this wallet",
          });
          ws.close(1008, "Session mismatch");
          return;
        }
        id = row.owner;
        boundWallet = true;
        const profile = await this.env.DB.prepare(
          "SELECT display_name FROM profiles WHERE owner=?",
        )
          .bind(id)
          .first<{ display_name: string }>();
        name = profile?.display_name || shortWallet(id);
      } else if (looksWallet) {
        // Guests cannot claim wallet-shaped ids without a signed token or session.
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
      const cosmetics = boundWallet
        ? await cosmeticsForWallet(this.env, id, true)
        : undefined;
      const pos = clampPresencePosition(
        this.zoneId,
        parsed.x,
        parsed.y,
        parsed.z,
      );
      const player: PresencePlayer = presencePlayerPayload({
        id,
        name,
        color,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        ...(cosmetics ? { cosmetics } : {}),
      });
      ws.serializeAttachment({
        ...player,
        lastMoveAt: Date.now(),
        lastChatAt: 0,
        lastEmoteAt: 0,
        chatSentAt: [],
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

    if (parsed.type === "chat") {
      if (!WALLET_ID_RE.test(self.id)) {
        send(ws, {
          type: "error",
          message: "Chat requires a signed-in wallet",
        });
        return;
      }
      const now = Date.now();
      if (
        !canSendChat(self.lastChatAt, now) ||
        !chatWindowOk(self.chatSentAt, now)
      ) {
        send(ws, {
          type: "error",
          message: "Chat is cooling down. Please wait.",
        });
        return;
      }
      let text = "";
      try {
        text = sanitizePastureChat(parsed.text);
      } catch (error) {
        send(ws, {
          type: "error",
          message: error instanceof Error ? error.message : "Invalid chat",
        });
        return;
      }
      self.lastChatAt = now;
      self.chatSentAt = [...self.chatSentAt, now].slice(-8);
      ws.serializeAttachment(self);
      const payload: ServerPresenceMessage = {
        type: "chat",
        id: self.id,
        name: self.name,
        text,
        at: now,
      };
      send(ws, payload);
      this.broadcast(ws, payload);
      return;
    }

    if (parsed.type === "emote") {
      if (!WALLET_ID_RE.test(self.id)) {
        send(ws, {
          type: "error",
          message: "Emotes require a signed-in wallet",
        });
        return;
      }
      const now = Date.now();
      if (!canSendEmote(self.lastEmoteAt || 0, now)) {
        send(ws, {
          type: "error",
          message: "Emote is cooling down. Please wait.",
        });
        return;
      }
      self.lastEmoteAt = now;
      ws.serializeAttachment(self);
      const payload: ServerPresenceMessage = {
        type: "emote",
        id: self.id,
        emote: parsed.emote,
        at: now,
      };
      send(ws, payload);
      this.broadcast(ws, payload);
      return;
    }

    if (parsed.type === "cosmetics") {
      if (!WALLET_ID_RE.test(self.id)) return;
      const cosmetics = await cosmeticsForWallet(this.env, self.id, true);
      self.cosmetics = cosmetics;
      ws.serializeAttachment(self);
      const payload: ServerPresenceMessage = {
        type: "cosmetics",
        id: self.id,
        ...(cosmetics ? { cosmetics } : {}),
      };
      send(ws, payload);
      this.broadcast(ws, payload);
      return;
    }

    if (parsed.type !== "move") return;
    const now = Date.now();
    if (now - self.lastMoveAt < PRESENCE_MOVE_MIN_MS) return;
    const pos = clampPresencePosition(
      this.zoneId,
      parsed.x,
      parsed.y,
      parsed.z,
    );
    self.x = pos.x;
    self.y = pos.y;
    self.z = pos.z;
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
      if (att) players.push(presencePlayerPayload(att));
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
