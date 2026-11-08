/** Shared presence wire protocol for Starter Town plaza (Phase 3). */

export const PRESENCE_MAX_PLAYERS = 32;
export const PRESENCE_MOVE_MIN_MS = 80;

export interface PresencePlayer {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
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
    }
  | { type: "move"; x: number; y: number; z: number };

export type ServerPresenceMessage =
  | { type: "welcome"; you: string; players: PresencePlayer[] }
  | { type: "join"; player: PresencePlayer }
  | { type: "move"; id: string; x: number; y: number; z: number }
  | { type: "leave"; id: string }
  | { type: "error"; message: string };

export function isFinitePos(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 10_000;
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
        data.id.length > 64 ||
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
      return {
        type: "hello",
        id: data.id,
        name: data.name.replace(/[<>]/g, "").slice(0, 24),
        color: data.color.toLowerCase(),
        x: data.x,
        y: data.y,
        z: data.z,
      };
    }
    if (data.type === "move") {
      if (!isFinitePos(data.x) || !isFinitePos(data.y) || !isFinitePos(data.z))
        return null;
      return { type: "move", x: data.x, y: data.y, z: data.z };
    }
    return null;
  } catch {
    return null;
  }
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
  const hue = Math.floor(Math.random() * 360);
  const color = hslToHex(hue, 65, 62);
  return { id, name: `Guest-${id.slice(0, 4)}`, color };
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
