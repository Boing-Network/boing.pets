/**
 * Phase 1: apply pending player influences for this tick.
 * Host rate limits live outside the kernel; step applies whatever is queued.
 */
import {
  InfluenceKind,
  ModifierKind,
  type CalmTerritoryPayload,
  type EnrichTerritoryPayload,
  type FavorBloodlinePayload,
  type NameCreaturePayload,
  type NameLineagePayload,
} from "@boing-pets/contract";
import { assertInteger, clamp } from "../math";
import type {
  PlayerInfluenceRow,
  TerritoryModifierRow,
  WorldSnapshot,
} from "../types";

function indexById<T extends { id: number }>(
  rows: readonly T[],
): Map<number, T> {
  const map = new Map<number, T>();
  for (const row of rows) map.set(row.id, row);
  return map;
}

function modifierDurationTicks(snapshot: WorldSnapshot): number {
  const rules = snapshot.ruleset;
  return assertInteger(
    rules.influenceModifierDays * rules.ticksPerDay,
    "influenceModifierDays",
  );
}

function applyNameCreature(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
): void {
  const payload = influence.payload as NameCreaturePayload;
  const creature = indexById(snapshot.creatures).get(payload.creatureId);
  if (!creature) throw new Error(`influence creature ${payload.creatureId}`);
  creature.name = payload.name;
  creature.nameGivenByPlayer = true;
}

function applyNameLineage(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
): void {
  const payload = influence.payload as NameLineagePayload;
  const lineage = indexById(snapshot.lineages).get(payload.lineageId);
  if (!lineage) throw new Error(`influence lineage ${payload.lineageId}`);
  lineage.name = payload.name;
}

function applyFavorBloodline(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
): void {
  const payload = influence.payload as FavorBloodlinePayload;
  const lineage = indexById(snapshot.lineages).get(payload.lineageId);
  if (!lineage) throw new Error(`influence lineage ${payload.lineageId}`);
  lineage.playerFavor = assertInteger(
    clamp(lineage.playerFavor + snapshot.ruleset.influenceFavorAmount, 0, 1000),
    "playerFavor",
  );
}

function appendModifier(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
  territoryId: number,
  kind: typeof ModifierKind.FOOD | typeof ModifierKind.DANGER,
  amount: number,
  tick: number,
): void {
  if (!indexById(snapshot.territories).has(territoryId)) {
    throw new Error(`influence territory ${territoryId}`);
  }
  const id = snapshot.world.nextModifierId;
  snapshot.world.nextModifierId = id + 1;
  const row: TerritoryModifierRow = {
    id,
    worldId: snapshot.world.id,
    territoryId,
    kind,
    amount: assertInteger(amount, "modifierAmount"),
    startTick: tick,
    endTick: tick + modifierDurationTicks(snapshot),
    sourceInfluenceId: influence.id,
  };
  snapshot.modifiers.push(row);
}

function applyEnrichTerritory(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
  tick: number,
): void {
  const payload = influence.payload as EnrichTerritoryPayload;
  appendModifier(
    snapshot,
    influence,
    payload.territoryId,
    ModifierKind.FOOD,
    snapshot.ruleset.influenceFoodAmount,
    tick,
  );
}

function applyCalmTerritory(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
  tick: number,
): void {
  const payload = influence.payload as CalmTerritoryPayload;
  appendModifier(
    snapshot,
    influence,
    payload.territoryId,
    ModifierKind.DANGER,
    snapshot.ruleset.influenceDangerAmount,
    tick,
  );
}

function applyOne(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
  tick: number,
): void {
  switch (influence.kind) {
    case InfluenceKind.NAME_CREATURE:
      applyNameCreature(snapshot, influence);
      break;
    case InfluenceKind.NAME_LINEAGE:
      applyNameLineage(snapshot, influence);
      break;
    case InfluenceKind.FAVOR_BLOODLINE:
      applyFavorBloodline(snapshot, influence);
      break;
    case InfluenceKind.ENRICH_TERRITORY:
      applyEnrichTerritory(snapshot, influence, tick);
      break;
    case InfluenceKind.CALM_TERRITORY:
      applyCalmTerritory(snapshot, influence, tick);
      break;
    default: {
      const never: never = influence.kind;
      throw new Error(`influence ${String(never)}`);
    }
  }
  influence.applied = true;
}

/**
 * Apply pending influences with `issuedAtTick == tick`, ascending id.
 * Enrich/calm append modifiers; they never write territory base abundance/danger.
 * Favor only touches lineage.playerFavor — never health, genes, or needs.
 */
export function applyInfluences(snapshot: WorldSnapshot, tick: number): void {
  const pending = [...snapshot.pendingInfluences]
    .filter((row) => !row.applied && row.issuedAtTick === tick)
    .sort((a, b) => a.id - b.id);
  for (const influence of pending) {
    applyOne(snapshot, influence, tick);
  }
}
