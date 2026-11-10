/** Shared presence wire protocol for Starter Town plaza and the public pasture. */

import {
  sanitizeEquipped,
  type EquippedCosmetics,
} from "../../content/cosmetics";

export const PRESENCE_MAX_PLAYERS = 32;
export const PRESENCE_MOVE_MIN_MS = 80;
/** Wallet ids are `0x` + 64 hex (=66); guests use UUIDs. */
export const PRESENCE_ID_MAX = 80;
export const WALLET_ID_RE = /^0x[a-f0-9]{64}$/i;
export const PRESENCE_SESSION_RE = /^[A-Za-z0-9_-]{8,128}$/;

export interface PresencePlayer {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  cosmetics?: EquippedCosmetics;
}

export type ClientPresenceMessage =
  | {
      type: "hello";
      id: string;
      name: string;
      color: string;
      x: number;
      y: number;
      z: number;
      /** Short-lived wallet presence token from /api/world/presence/confirm */
      token?: string;
      /** Social read session — pasture join/chat without a second wallet sign. */
      session?: string;
      cosmetics?: EquippedCosmetics;
    }
  | { type: "move"; x: number; y: number; z: number }
  | { type: "chat"; text: string }
  | { type: "cosmetics"; cosmetics?: EquippedCosmetics };

export type ServerPresenceMessage =
  | { type: "welcome"; you: string; players: PresencePlayer[] }
  | { type: "join"; player: PresencePlayer }
  | { type: "move"; id: string; x: number; y: number; z: number }
  | { type: "leave"; id: string }
  | {
      type: "chat";
      id: string;
      name: string;
      text: string;
      at: number;
    }
  | { type: "cosmetics"; id: string; cosmetics?: EquippedCosmetics }
  | { type: "error"; message: string };

export function isFinitePos(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 10_000;
}

export function presencePlayerPayload(player: PresencePlayer): PresencePlayer {
  const cosmetics = sanitizeEquipped(player.cosmetics);
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    x: player.x,
    y: player.y,
    z: player.z,
    ...(cosmetics ? { cosmetics } : {}),
  };
}

export function parseClientPresenceMessage(
  raw: string,
): ClientPresenceMessage | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (data.type === "hello") {
      if (
        typeof data.id !== "string" ||
        data.id.length < 8 ||
        data.id.length > PRESENCE_ID_MAX ||
        typeof data.name !== "string" ||
        data.name.length < 1 ||
        data.name.length > 24 ||
        typeof data.color !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(data.color) ||
        !isFinitePos(data.x) ||
        !isFinitePos(data.y) ||
        !isFinitePos(data.z)
      )
        return null;
      const token =
        typeof data.token === "string" && data.token.length <= 64
          ? data.token
          : undefined;
      const session =
        typeof data.session === "string" &&
        PRESENCE_SESSION_RE.test(data.session)
          ? data.session
          : undefined;
      const cosmetics = sanitizeEquipped(data.cosmetics);
      return {
        type: "hello",
        id: data.id,
        name: data.name.replace(/[<>]/g, "").slice(0, 24),
        color: data.color.toLowerCase(),
        x: data.x,
        y: data.y,
        z: data.z,
        ...(token ? { token } : {}),
        ...(session ? { session } : {}),
        ...(cosmetics ? { cosmetics } : {}),
      };
    }
    if (data.type === "move") {
      if (!isFinitePos(data.x) || !isFinitePos(data.y) || !isFinitePos(data.z))
        return null;
      return { type: "move", x: data.x, y: data.y, z: data.z };
    }
    if (data.type === "chat") {
      if (typeof data.text !== "string" || data.text.length > 200) return null;
      return { type: "chat", text: data.text };
    }
    if (data.type === "cosmetics") {
      return { type: "cosmetics", cosmetics: sanitizeEquipped(data.cosmetics) };
    }
    return null;
  } catch {
    return null;
  }
}

export function colorFromSeed(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return hslToHex(h % 360, 65, 62);
}

export function guestPresenceIdentity(): {
  id: string;
  name: string;
  color: string;
} {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, name: `Guest-${id.slice(0, 4)}`, color: colorFromSeed(id) };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
