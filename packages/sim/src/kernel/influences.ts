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
  type GatherResourcePayload,
  type NameCreaturePayload,
  type NameLineagePayload,
  type UseItemPayload,
} from "@boing-pets/contract";
import { harvestModifierSpec, itemDef, resourceStock } from "./items";
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

function addFavor(
  snapshot: WorldSnapshot,
  lineageId: number,
  amount: number,
): void {
  const lineage = indexById(snapshot.lineages).get(lineageId);
  if (!lineage) throw new Error(`influence lineage ${lineageId}`);
  lineage.playerFavor = assertInteger(
    clamp(lineage.playerFavor + amount, 0, 1000),
    "playerFavor",
  );
}

function applyFavorBloodline(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
): void {
  const payload = influence.payload as FavorBloodlinePayload;
  addFavor(snapshot, payload.lineageId, snapshot.ruleset.influenceFavorAmount);
}

function appendModifier(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
  territoryId: number,
  kind: ModifierKind,
  amount: number,
  tick: number,
  durationTicks: number = modifierDurationTicks(snapshot),
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
    endTick: tick + assertInteger(durationTicks, "durationTicks"),
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

/**
 * GATHER_RESOURCE: the host granted `units` at acceptance with the same pure
 * `gatherYield`; the kernel re-clamps to free stock so a bad row can never
 * overdraw the territory. Zero units appends nothing.
 */
function applyGatherResource(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
  tick: number,
): void {
  const payload = influence.payload as GatherResourcePayload;
  const stock = resourceStock(snapshot, payload.territoryId, tick, 0);
  if (!stock) throw new Error(`gather territory ${payload.territoryId}`);
  const units = Math.min(Math.max(0, payload.units), stock.free);
  if (units <= 0) return;
  const spec = harvestModifierSpec(snapshot, units);
  appendModifier(
    snapshot,
    influence,
    payload.territoryId,
    ModifierKind.HARVEST,
    spec.amount,
    tick,
    spec.durationTicks,
  );
}

/** USE_ITEM: inventory was debited by the host; apply the catalog effect. */
function applyUseItem(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
  tick: number,
): void {
  const payload = influence.payload as UseItemPayload;
  const def = itemDef(payload.item);
  if (!def || !def.effect) throw new Error(`use item ${payload.item}`);
  const effect = def.effect;
  if (effect.kind === "FAVOR") {
    if (payload.lineageId == null) throw new Error("use item lineage");
    addFavor(snapshot, payload.lineageId, effect.amount);
    return;
  }
  if (payload.territoryId == null) throw new Error("use item territory");
  appendModifier(
    snapshot,
    influence,
    payload.territoryId,
    ModifierKind[effect.kind],
    effect.amount,
    tick,
    effect.days * snapshot.ruleset.ticksPerDay,
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
    case InfluenceKind.GATHER_RESOURCE:
      applyGatherResource(snapshot, influence, tick);
      break;
    case InfluenceKind.USE_ITEM:
      applyUseItem(snapshot, influence, tick);
      break;
    default: {
      const never: never = influence.kind;
      throw new Error(`influence ${String(never)}`);
    }
  }
  influence.applied = true;
}

/**
 * At each day boundary every lineage's favor fades by `favorDecayPerDay`
 * (floor 0), so a blessing lasts about ten days unless renewed. Returns the
 * lineages that changed.
 */
export function decayLineageFavor(
  snapshot: WorldSnapshot,
  tick: number,
): number[] {
  const rules = snapshot.ruleset;
  const perDay = rules.favorDecayPerDay;
  if (!(perDay > 0) || tick % rules.ticksPerDay !== 0) return [];
  const changed: number[] = [];
  for (const lineage of snapshot.lineages) {
    if (lineage.playerFavor <= 0) continue;
    lineage.playerFavor = Math.max(0, lineage.playerFavor - perDay);
    changed.push(lineage.id);
  }
  return changed;
}

/**
 * Apply pending influences with `issuedAtTick == tick`, ascending id.
 * Enrich/calm append modifiers; they never write territory base abundance/danger.
 * Favor only touches lineage.playerFavor — never health, genes, or needs;
 * its effect is the forage bonus in `resolveForage` (see favorForageBonus).
 */
export function applyInfluences(snapshot: WorldSnapshot, tick: number): void {
  const pending = [...snapshot.pendingInfluences]
    .filter((row) => !row.applied && row.issuedAtTick === tick)
    .sort((a, b) => a.id - b.id);
  for (const influence of pending) {
    applyOne(snapshot, influence, tick);
  }
}
