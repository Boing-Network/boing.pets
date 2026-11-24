/**
 * Player influence submit path and wall-clock rate limit.
 * The kernel applies queued influences; this module never calls step().
 *
 * Players never write needs, genes, or territoryId directly — only the
 * influence verbs (five, plus M22 gather and use-item), which become
 * PlayerInfluence rows.
 */
import {
  CreatureStatus,
  InfluenceKind,
  creatureUseRule,
  itemDef,
  recipeFor,
  type InfluenceSubmit,
  type SystemInfluence,
} from "@boing-pets/contract";
import type { PlayerInfluenceRow } from "@boing-pets/sim";
import { LOCAL_ACCOUNT_ID } from "./multiplayer/account";
import type { WorldRepository } from "./persist/repository";
import type { HostSession } from "./session";

/**
 * Accepts per gate per wall-clock window. A rename is gated per target (one
 * gate per creature, one per lineage: see `renameGateKey`), so a name can
 * change once a month. Item actions are not counted: see
 * `countsAgainstLimit`.
 */
export const INFLUENCE_RATE_LIMIT = 1;

/**
 * Gathering by hand and using an item are limited by what they consume (a
 * territory's stock, the item itself), not by the daily nudge limit, so a
 * player can gather, craft and give freely.
 */
export function countsAgainstLimit(kind: InfluenceSubmit["kind"]): boolean {
  return (
    kind !== InfluenceKind.GATHER_RESOURCE && kind !== InfluenceKind.USE_ITEM
  );
}

/** Wall-clock window for the rate limit (30 days). */
export const INFLUENCE_RATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The gate a rename is counted on: the thing being renamed, not the account,
 * so the once-a-month rule follows the creature or lineage (a new owner does
 * not get a fresh rename by buying it). Null for every other kind.
 */
export function renameGateKey(submit: InfluenceSubmit): string | null {
  if (submit.kind === InfluenceKind.NAME_CREATURE) {
    return `rename:creature:${submit.payload.creatureId}`;
  }
  if (submit.kind === InfluenceKind.NAME_LINEAGE) {
    return `rename:lineage:${submit.payload.lineageId}`;
  }
  return null;
}

/**
 * Why `accountId` may not rename this target, or null when it may (and for
 * every kind that is not a rename). A creature is renamed by its owner; a
 * lineage by anyone who owns a living creature of it.
 */
export function renameDeniedReason(
  session: HostSession,
  submit: InfluenceSubmit,
  accountId: string,
  ownerOf: (creatureId: number) => string | null,
): string | null {
  if (submit.kind === InfluenceKind.NAME_CREATURE) {
    return ownerOf(submit.payload.creatureId) === accountId
      ? null
      : "only this creature's owner can rename it";
  }
  if (submit.kind === InfluenceKind.NAME_LINEAGE) {
    const lineageId = submit.payload.lineageId;
    const ownsOne = session.snapshot.creatures.some(
      (row) =>
        row.lineageId === lineageId &&
        row.status === CreatureStatus.ALIVE &&
        ownerOf(row.id) === accountId,
    );
    return ownsOne
      ? null
      : "only someone who owns a creature of this lineage can rename it";
  }
  return null;
}

/** Whole days until the gate accepts again (at least 1 while it is full). */
export function daysUntilAccept(gate: InfluenceGate, nowMs: number): number {
  const oldest = Math.min(...gate.acceptedAtMs);
  const leftMs = oldest + INFLUENCE_RATE_WINDOW_MS - nowMs;
  return Math.max(1, Math.ceil(leftMs / (24 * 60 * 60 * 1000)));
}

export type InfluenceSubmitOk = {
  ok: true;
  id: number;
  issuedAtTick: number;
};

export type InfluenceSubmitRejected =
  | { ok: false; reason: "rate_limit" | "catching_up" }
  /** The request itself is wrong (unknown or dead target, empty name). */
  | { ok: false; reason: "invalid"; detail: string };

export type InfluenceSubmitResult = InfluenceSubmitOk | InfluenceSubmitRejected;

export type InfluenceGate = {
  /** Wall ms of each accepted submit, oldest first after prune. */
  acceptedAtMs: number[];
};

export function createInfluenceGate(
  acceptedAtMs: readonly number[] = [],
): InfluenceGate {
  return { acceptedAtMs: [...acceptedAtMs] };
}

/** Drop accepts outside the rolling 24h window relative to `nowMs`. */
export function pruneInfluenceGate(gate: InfluenceGate, nowMs: number): void {
  gate.acceptedAtMs = gate.acceptedAtMs.filter(
    (acceptedAt) => nowMs - acceptedAt < INFLUENCE_RATE_WINDOW_MS,
  );
}

/**
 * True when another influence can be accepted at `nowMs`.
 * Does not mutate the gate.
 */
export function canAcceptInfluence(
  gate: InfluenceGate,
  nowMs: number,
): boolean {
  const recent = gate.acceptedAtMs.filter(
    (acceptedAt) => nowMs - acceptedAt < INFLUENCE_RATE_WINDOW_MS,
  );
  return recent.length < INFLUENCE_RATE_LIMIT;
}

/**
 * Why a submit cannot be queued, or null when it can. A bad request is the
 * sender's problem, never a save failure: it must not throw into the commit
 * error path (which pauses influences for everyone).
 */
export function invalidSubmitReason(
  session: HostSession,
  submit: InfluenceSubmit,
): string | null {
  const hasName = (name: unknown) => typeof name === "string" && name !== "";
  switch (submit.kind) {
    case InfluenceKind.NAME_CREATURE: {
      const creature = session.snapshot.creatures.find(
        (row) => row.id === submit.payload.creatureId,
      );
      // A dead creature leaves the hot snapshot at the next commit; a rename
      // queued for it would have no target when the kernel applies it.
      if (!creature || creature.status !== CreatureStatus.ALIVE) {
        return "that creature is no longer alive";
      }
      return hasName(submit.payload.name) ? null : "a name is required";
    }
    case InfluenceKind.NAME_LINEAGE: {
      const lineage = session.snapshot.lineages.find(
        (row) => row.id === submit.payload.lineageId,
      );
      if (!lineage) return "unknown lineage";
      return hasName(submit.payload.name) ? null : "a name is required";
    }
    case InfluenceKind.FAVOR_BLOODLINE: {
      const lineage = session.snapshot.lineages.find(
        (row) => row.id === submit.payload.lineageId,
      );
      return lineage ? null : "unknown lineage";
    }
    case InfluenceKind.ENRICH_TERRITORY:
    case InfluenceKind.CALM_TERRITORY: {
      const territory = session.snapshot.territories.find(
        (row) => row.id === submit.payload.territoryId,
      );
      return territory ? null : "unknown territory";
    }
    case InfluenceKind.GATHER_RESOURCE: {
      // Units are granted by the item service (items/service.ts) before this.
      const territory = session.snapshot.territories.find(
        (row) => row.id === submit.payload.territoryId,
      );
      if (!territory) return "unknown territory";
      return Number.isSafeInteger(submit.payload.units) &&
        submit.payload.units >= 1
        ? null
        : "nothing to gather";
    }
    case InfluenceKind.USE_ITEM: {
      // Ownership and balance are checked by the item service; here only shape.
      const def = itemDef(submit.payload.item);
      return def && def.effect ? null : "that item cannot be used";
    }
    default: {
      const never: never = submit;
      return `unknown influence ${String((never as { kind?: unknown }).kind)}`;
    }
  }
}

export type SubmitInfluenceOptions = {
  /**
   * Durable accept log for every account (M22). When set, replaces the
   * single-gate persist so per-session rate limits survive reload.
   */
  influenceAcceptedByAccount?: Record<string, readonly number[]>;
};

/**
 * Queue one influence for `lastTick + 1` if the rate limit allows.
 * Persists the row and the accept-time log in their own commit between ticks.
 * Rejects while catch-up is running (`session.catchingUp`) and when the
 * request names a target that does not exist; throws only when the save fails.
 *
 * Rate limiting is per gate. Multiplayer passes a per-account gate; local
 * single-player keeps one shared gate (the `"local"` account).
 */
export async function submitInfluence(
  session: HostSession,
  gate: InfluenceGate,
  submit: InfluenceSubmit,
  nowMs: number,
  options: SubmitInfluenceOptions = {},
): Promise<InfluenceSubmitResult> {
  if (session.catchingUp) {
    return { ok: false, reason: "catching_up" };
  }
  const invalid = invalidSubmitReason(session, submit);
  if (invalid != null) return { ok: false, reason: "invalid", detail: invalid };
  pruneInfluenceGate(gate, nowMs);
  const counted = countsAgainstLimit(submit.kind);
  if (counted && gate.acceptedAtMs.length >= INFLUENCE_RATE_LIMIT) {
    return { ok: false, reason: "rate_limit" };
  }

  const id = session.snapshot.world.nextInfluenceId;
  session.snapshot.world.nextInfluenceId = id + 1;
  const issuedAtTick = session.snapshot.world.lastTick + 1;
  const row: PlayerInfluenceRow = {
    id,
    worldId: session.snapshot.world.id,
    kind: submit.kind,
    issuedAtTick,
    payload: submit.payload,
    applied: false,
  };
  session.snapshot.pendingInfluences.push(row);
  if (counted) gate.acceptedAtMs.push(nowMs);

  const byAccount = options.influenceAcceptedByAccount;
  try {
    await persistInfluenceSubmit(
      session,
      row,
      byAccount == null
        ? [...gate.acceptedAtMs]
        : [...(byAccount[LOCAL_ACCOUNT_ID] ?? gate.acceptedAtMs)],
      byAccount == null
        ? null
        : Object.fromEntries(
            Object.entries(byAccount).map(([accountId, times]) => [
              accountId,
              [...times],
            ]),
          ),
    );
  } catch (error) {
    // Not saved: un-accept it so it never applies from memory alone. The id
    // stays consumed (a gap is harmless; reusing it could collide with a
    // commit that landed after reporting an error).
    dropPending(session, [row.id]);
    const at = counted ? gate.acceptedAtMs.lastIndexOf(nowMs) : -1;
    if (at >= 0) gate.acceptedAtMs.splice(at, 1);
    throw error;
  }
  return { ok: true, id, issuedAtTick };
}

/**
 * Queue host-issued creature influences (creature autonomy: a creature crafts
 * or uses an item) for `lastTick + 1`, in one commit. They are not player
 * actions: no rate-limit gate, and the accept-time logs are left untouched.
 * Returns nothing while catch-up runs. Clients can never submit these kinds
 * (see multiplayer/validate.ts and assertValidSubmit).
 */
export async function submitSystemInfluences(
  session: HostSession,
  records: readonly SystemInfluence[],
): Promise<InfluenceSubmitOk[]> {
  if (session.catchingUp || records.length === 0) return [];
  const issuedAtTick = session.snapshot.world.lastTick + 1;
  const rows: PlayerInfluenceRow[] = [];
  for (const record of records) {
    const creature = session.snapshot.creatures.find(
      (row) => row.id === record.payload.creatureId,
    );
    if (creature == null || creature.status !== CreatureStatus.ALIVE) {
      throw new Error("creature");
    }
    if (record.kind === InfluenceKind.CREATURE_USE_ITEM) {
      if (creatureUseRule(record.payload.item) == null) throw new Error("item");
    } else if (record.kind === InfluenceKind.CREATURE_CRAFT) {
      if (recipeFor(record.payload.output) == null) throw new Error("recipe");
    } else {
      const never: never = record;
      throw new Error(`kind ${String(never)}`);
    }
    const id = session.snapshot.world.nextInfluenceId + rows.length;
    rows.push({
      id,
      worldId: session.snapshot.world.id,
      kind: record.kind,
      issuedAtTick,
      payload: record.payload,
      applied: false,
    });
  }
  session.snapshot.world.nextInfluenceId += rows.length;
  session.snapshot.pendingInfluences.push(...rows);
  try {
    await commitInfluenceRows(session, rows);
  } catch (error) {
    dropPending(
      session,
      rows.map((row) => row.id),
    );
    throw error;
  }
  return rows.map((row) => ({ ok: true, id: row.id, issuedAtTick }));
}

function dropPending(session: HostSession, ids: readonly number[]): void {
  const drop = new Set(ids);
  session.snapshot.pendingInfluences =
    session.snapshot.pendingInfluences.filter((row) => !drop.has(row.id));
}

async function commitInfluenceRows(
  session: HostSession,
  rows: readonly PlayerInfluenceRow[],
): Promise<void> {
  await session.repository.commit({
    world: clone(session.snapshot.world),
    ruleset: clone(session.snapshot.ruleset),
    insertCreatures: [],
    updateCreatures: [],
    insertRelationships: [],
    updateRelationships: [],
    insertMemories: [],
    archiveMemoryIds: [],
    insertModifiers: [],
    upsertLineages: [],
    insertEvents: [],
    insertInfluences: rows.map(clone),
    appliedInfluenceIds: [],
    influenceAcceptedAtMs: null,
    influenceAcceptedByAccount: null,
    insertCatchup: null,
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function persistInfluenceSubmit(
  session: HostSession,
  row: PlayerInfluenceRow,
  influenceAcceptedAtMs: readonly number[],
  influenceAcceptedByAccount: Record<string, number[]> | null,
): Promise<void> {
  await session.repository.commit({
    world: clone(session.snapshot.world),
    ruleset: clone(session.snapshot.ruleset),
    insertCreatures: [],
    updateCreatures: [],
    insertRelationships: [],
    updateRelationships: [],
    insertMemories: [],
    archiveMemoryIds: [],
    insertModifiers: [],
    upsertLineages: [],
    insertEvents: [],
    insertInfluences: [clone(row)],
    appliedInfluenceIds: [],
    influenceAcceptedAtMs: [...influenceAcceptedAtMs],
    influenceAcceptedByAccount,
    insertCatchup: null,
  });
}

/** Load the durable accept-time log after boot (empty when the store is new). */
export async function loadInfluenceGate(
  repository: WorldRepository,
): Promise<InfluenceGate> {
  const tables = await repository.readTables();
  if (tables == null) return createInfluenceGate();
  // Prefer the local account entry when the M22 map is present.
  const local =
    tables.influenceAcceptedByAccount?.[LOCAL_ACCOUNT_ID] ??
    tables.influenceAcceptedAtMs;
  return createInfluenceGate(local);
}

/** Mark catch-up in progress so submits wait until the gap is closed. */
export function beginCatchupGuard(session: HostSession): void {
  session.catchingUp = true;
}

export function endCatchupGuard(session: HostSession): void {
  session.catchingUp = false;
}

/** Count accepts still inside the window. */
export function acceptedInWindow(gate: InfluenceGate, nowMs: number): number {
  return gate.acceptedAtMs.filter(
    (acceptedAt) => nowMs - acceptedAt < INFLUENCE_RATE_WINDOW_MS,
  ).length;
}
