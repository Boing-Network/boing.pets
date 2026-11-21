/**
 * Strict input validation for shared-world clients. Anything a socket sends
 * is untrusted: rebuild clean objects, drop unknown fields, reject the rest.
 */
import {
  InfluenceKind,
  ItemSlug,
  isItemSlug,
  TIME_SCALES,
  type ClientToHost,
  type InfluenceSubmit,
} from "@boing-pets/contract";

export type Validated<T> =
  { ok: true; value: T } | { ok: false; reason: string };

const MAX_NAME = 40;
const MAX_EVENTS_LIMIT = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function id(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function tick(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function name(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME) return null;
  // No control characters (C0/C1) in names that every client will render.
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return null;
  }
  return trimmed;
}

function influence(body: unknown): InfluenceSubmit | null {
  if (!isRecord(body) || !isRecord(body.payload)) return null;
  const p = body.payload;
  switch (body.kind) {
    case InfluenceKind.NAME_CREATURE: {
      const creatureId = id(p.creatureId);
      const n = name(p.name);
      return creatureId && n
        ? { kind: body.kind, payload: { creatureId, name: n } }
        : null;
    }
    case InfluenceKind.NAME_LINEAGE: {
      const lineageId = id(p.lineageId);
      const n = name(p.name);
      return lineageId && n
        ? { kind: body.kind, payload: { lineageId, name: n } }
        : null;
    }
    case InfluenceKind.FAVOR_BLOODLINE: {
      const lineageId = id(p.lineageId);
      return lineageId ? { kind: body.kind, payload: { lineageId } } : null;
    }
    case InfluenceKind.ENRICH_TERRITORY:
    case InfluenceKind.CALM_TERRITORY: {
      const territoryId = id(p.territoryId);
      return territoryId ? { kind: body.kind, payload: { territoryId } } : null;
    }
    case InfluenceKind.GATHER_RESOURCE: {
      // The host grants resource and units; anything the client sends is ignored.
      const territoryId = id(p.territoryId);
      return territoryId
        ? {
            kind: body.kind,
            payload: { territoryId, resource: ItemSlug.CLOVER, units: 1 },
          }
        : null;
    }
    case InfluenceKind.USE_ITEM: {
      if (typeof p.item !== "string" || !isItemSlug(p.item)) return null;
      const territoryId = p.territoryId == null ? undefined : id(p.territoryId);
      const lineageId = p.lineageId == null ? undefined : id(p.lineageId);
      if (territoryId === null || lineageId === null) return null;
      if (territoryId == null && lineageId == null) return null;
      return {
        kind: body.kind,
        payload: {
          item: p.item,
          ...(territoryId != null ? { territoryId } : {}),
          ...(lineageId != null ? { lineageId } : {}),
        },
      };
    }
    default:
      return null;
  }
}

/** Commands a remote client may send (no session framing). */
export function validateCommand(raw: unknown): Validated<ClientToHost> {
  if (!isRecord(raw) || typeof raw.message !== "string") {
    return { ok: false, reason: "malformed command" };
  }
  const body = raw.body;
  switch (raw.message) {
    case "clock.pause":
    case "clock.resume":
      return { ok: true, value: { message: raw.message, body: {} } };
    case "clock.setScale": {
      const scale = isRecord(body) ? body.scale : undefined;
      if (!(TIME_SCALES as readonly unknown[]).includes(scale)) {
        return { ok: false, reason: "invalid scale" };
      }
      return {
        ok: true,
        value: {
          message: "clock.setScale",
          body: { scale: scale as (typeof TIME_SCALES)[number] },
        },
      };
    }
    case "item.craft": {
      const output = isRecord(body) ? body.output : undefined;
      return typeof output === "string" && isItemSlug(output)
        ? { ok: true, value: { message: "item.craft", body: { output } } }
        : { ok: false, reason: "invalid recipe" };
    }
    case "item.autonomy": {
      if (!isRecord(body)) return { ok: false, reason: "invalid settings" };
      const out: { autoCraft?: boolean; autoUse?: boolean } = {};
      for (const key of ["autoCraft", "autoUse"] as const) {
        const value = body[key];
        if (value === undefined) continue;
        if (typeof value !== "boolean") {
          return { ok: false, reason: "invalid settings" };
        }
        out[key] = value;
      }
      if (out.autoCraft === undefined && out.autoUse === undefined) {
        return { ok: false, reason: "invalid settings" };
      }
      return { ok: true, value: { message: "item.autonomy", body: out } };
    }
    case "influence.submit": {
      const clean = influence(body);
      return clean
        ? { ok: true, value: { message: "influence.submit", body: clean } }
        : { ok: false, reason: "invalid influence" };
    }
    default:
      return {
        ok: false,
        reason: `not a command: ${raw.message.slice(0, 32)}`,
      };
  }
}

/** Read-only queries a remote client may send. */
export function validateQuery(raw: unknown): Validated<ClientToHost> {
  if (
    !isRecord(raw) ||
    typeof raw.message !== "string" ||
    !isRecord(raw.body)
  ) {
    return { ok: false, reason: "malformed query" };
  }
  const b = raw.body;
  switch (raw.message) {
    case "query.family":
    case "query.creature": {
      const creatureId = id(b.creatureId);
      return creatureId
        ? { ok: true, value: { message: raw.message, body: { creatureId } } }
        : { ok: false, reason: "invalid creatureId" };
    }
    case "query.inventory":
      return { ok: true, value: { message: "query.inventory", body: {} } };
    case "query.lineage": {
      const lineageId = id(b.lineageId);
      return lineageId
        ? { ok: true, value: { message: "query.lineage", body: { lineageId } } }
        : { ok: false, reason: "invalid lineageId" };
    }
    case "query.events": {
      const worldId = id(b.worldId);
      const fromTick = tick(b.fromTick);
      const toTick = tick(b.toTick);
      const limit = id(b.limit);
      if (
        worldId == null ||
        fromTick == null ||
        toTick == null ||
        limit == null ||
        toTick < fromTick
      ) {
        return { ok: false, reason: "invalid events query" };
      }
      return {
        ok: true,
        value: {
          message: "query.events",
          body: {
            worldId,
            fromTick,
            toTick,
            limit: Math.min(limit, MAX_EVENTS_LIMIT),
          },
        },
      };
    }
    default:
      return { ok: false, reason: `not a query: ${raw.message.slice(0, 32)}` };
  }
}

/** Token bucket per socket: `rate` messages/second, bursts up to `burst`. */
export type FloodGate = { take(nowMs: number): boolean };

export function createFloodGate(rate = 20, burst = 40): FloodGate {
  let tokens = burst;
  let last = 0;
  return {
    take(nowMs) {
      if (last === 0) last = nowMs;
      tokens = Math.min(burst, tokens + ((nowMs - last) / 1000) * rate);
      last = nowMs;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}
