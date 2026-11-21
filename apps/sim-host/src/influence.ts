/**
 * Player influence submit path and wall-clock rate limit.
 * The kernel applies queued influences; this module never calls step().
 *
 * Players never write needs, genes, or territoryId directly — only the
 * influence verbs (five, plus M22 gather and use-item), which become
 * PlayerInfluence rows.
 */
import {
  InfluenceKind,
  itemDef,
  type InfluenceSubmit,
} from "@boing-pets/contract";
import type { PlayerInfluenceRow } from "@boing-pets/sim";
import { LOCAL_ACCOUNT_ID } from "./multiplayer/account";
import type { WorldRepository } from "./persist/repository";
import type { HostSession } from "./session";

/** Accepted influences per wall-clock window. */
export const INFLUENCE_RATE_LIMIT = 3;

/** Wall-clock window for the rate limit (24 hours). */
export const INFLUENCE_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type InfluenceSubmitOk = {
  ok: true;
  id: number;
  issuedAtTick: number;
};

export type InfluenceSubmitRejected = {
  ok: false;
  reason: "rate_limit" | "catching_up";
};

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

function assertValidSubmit(
  session: HostSession,
  submit: InfluenceSubmit,
): void {
  switch (submit.kind) {
    case InfluenceKind.NAME_CREATURE: {
      const creature = session.snapshot.creatures.find(
        (row) => row.id === submit.payload.creatureId,
      );
      if (!creature) throw new Error("creature");
      if (
        typeof submit.payload.name !== "string" ||
        submit.payload.name === ""
      ) {
        throw new Error("name");
      }
      break;
    }
    case InfluenceKind.NAME_LINEAGE: {
      const lineage = session.snapshot.lineages.find(
        (row) => row.id === submit.payload.lineageId,
      );
      if (!lineage) throw new Error("lineage");
      if (
        typeof submit.payload.name !== "string" ||
        submit.payload.name === ""
      ) {
        throw new Error("name");
      }
      break;
    }
    case InfluenceKind.FAVOR_BLOODLINE: {
      const lineage = session.snapshot.lineages.find(
        (row) => row.id === submit.payload.lineageId,
      );
      if (!lineage) throw new Error("lineage");
      break;
    }
    case InfluenceKind.ENRICH_TERRITORY:
    case InfluenceKind.CALM_TERRITORY: {
      const territory = session.snapshot.territories.find(
        (row) => row.id === submit.payload.territoryId,
      );
      if (!territory) throw new Error("territory");
      break;
    }
    case InfluenceKind.GATHER_RESOURCE: {
      // Units are granted by the item service (items/service.ts) before this.
      const territory = session.snapshot.territories.find(
        (row) => row.id === submit.payload.territoryId,
      );
      if (!territory) throw new Error("territory");
      if (
        !Number.isSafeInteger(submit.payload.units) ||
        submit.payload.units < 1
      ) {
        throw new Error("units");
      }
      break;
    }
    case InfluenceKind.USE_ITEM: {
      // Ownership and balance are checked by the item service; here only shape.
      const def = itemDef(submit.payload.item);
      if (!def || !def.effect) throw new Error("item");
      break;
    }
    default: {
      const never: never = submit;
      throw new Error(`kind ${String(never)}`);
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
 * Rejects while catch-up is running (`session.catchingUp`).
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
  assertValidSubmit(session, submit);
  pruneInfluenceGate(gate, nowMs);
  if (gate.acceptedAtMs.length >= INFLUENCE_RATE_LIMIT) {
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
  gate.acceptedAtMs.push(nowMs);

  const byAccount = options.influenceAcceptedByAccount;
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
  return { ok: true, id, issuedAtTick };
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
