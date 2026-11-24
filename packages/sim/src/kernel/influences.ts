/**
 * Phase 1: apply pending player influences for this tick.
 * Host rate limits live outside the kernel; step applies whatever is queued.
 */
import {
  CreatureStatus,
  EventKind,
  EventTemplate,
  InfluenceKind,
  ModifierKind,
  TONIC_GENE_CEILING,
  type CalmTerritoryPayload,
  type CreatureCraftPayload,
  type CreatureUseItemPayload,
  type EnrichTerritoryPayload,
  type FavorBloodlinePayload,
  type GatherResourcePayload,
  type NameCreaturePayload,
  type NameLineagePayload,
  type UseItemPayload,
} from "@boing-pets/contract";
import { harvestModifierSpec, itemDef, resourceStock } from "./items";
import { applyCreatureCraft, applyCreatureUse } from "./autonomy";
import { assertInteger, clamp } from "../math";
import type {
  PlayerInfluenceRow,
  TerritoryModifierRow,
  WorldEvent,
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
  // The host only queues renames for living creatures, but the target can
  // die and leave the snapshot before this tick. Throwing here would stop
  // every later tick (the influence stays pending), so it lapses instead.
  if (!creature) return;
  creature.name = payload.name;
  creature.nameGivenByPlayer = true;
}

function applyNameLineage(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
): void {
  const payload = influence.payload as NameLineagePayload;
  const lineage = indexById(snapshot.lineages).get(payload.lineageId);
  if (!lineage) return;
  lineage.name = payload.name;
}

function addFavor(
  snapshot: WorldSnapshot,
  lineageId: number,
  amount: number,
): void {
  const lineage = indexById(snapshot.lineages).get(lineageId);
  if (!lineage) return;
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
  if (!indexById(snapshot.territories).has(territoryId)) return;
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
  if (!stock) return;
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

const TONIC_GENE_FIELD = {
  strength: "geneStrength",
  speed: "geneSpeed",
  intelligence: "geneIntelligence",
} as const;

/**
 * A potion or tonic a player gives to one creature. A creature that died
 * before it lands gets nothing (and no event), like any lapsed influence.
 */
function applyGivenItem(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
  tick: number,
): WorldEvent[] {
  const payload = influence.payload as UseItemPayload;
  const def = itemDef(payload.item);
  const effect = def?.effect;
  if (!def || !effect) return [];
  const creature = snapshot.creatures.find(
    (row) => row.id === payload.creatureId,
  );
  if (!creature || creature.status !== CreatureStatus.ALIVE) return [];

  let outcome = "";
  if (effect.kind === "RELIEF") {
    const r = effect.relief;
    const eased = (value: number, relief = 0) =>
      assertInteger(clamp(value - relief, 0, 1000), "need");
    creature.hunger = eased(creature.hunger, r.hunger);
    creature.thirst = eased(creature.thirst, r.thirst);
    creature.fatigue = eased(creature.fatigue, r.fatigue);
    creature.discomfort = eased(creature.discomfort, r.discomfort);
    creature.unsafety = eased(creature.unsafety, r.unsafety);
    creature.loneliness = eased(creature.loneliness, r.loneliness);
    creature.health = assertInteger(
      clamp(creature.health + (r.health ?? 0), 0, 1000),
      "health",
    );
  } else if (effect.kind === "GENE") {
    const field = TONIC_GENE_FIELD[effect.gene];
    const before = creature[field];
    // Never lowers a gene that is already above the ceiling.
    const after = Math.max(
      before,
      Math.min(TONIC_GENE_CEILING, before + effect.amount),
    );
    creature[field] = assertInteger(after, "gene");
    outcome =
      after > before
        ? ` (${effect.gene} +${after - before})`
        : " (it had no more to give)";
  } else {
    return [];
  }

  const id = snapshot.world.nextEventId;
  snapshot.world.nextEventId = id + 1;
  const article = /^[aeiou]/i.test(def.displayName) ? "an" : "a";
  return [
    {
      id,
      worldId: snapshot.world.id,
      tick,
      kind: EventKind.ITEM,
      actorId: creature.id,
      subjectId: null,
      territoryId: creature.territoryId,
      lineageId: creature.lineageId,
      summary: `${creature.name} was given ${article} ${def.displayName}${outcome}.`,
      payload: {
        template: EventTemplate.ITEM_USE,
        creatureId: creature.id,
        item: def.slug,
        territoryId: creature.territoryId,
        influenceId: influence.id,
      },
    },
  ];
}

/** USE_ITEM: inventory was debited by the host; apply the catalog effect. */
function applyUseItem(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
  tick: number,
): WorldEvent[] {
  const payload = influence.payload as UseItemPayload;
  const def = itemDef(payload.item);
  if (!def || !def.effect) throw new Error(`use item ${payload.item}`);
  const effect = def.effect;
  if (effect.kind === "RELIEF" || effect.kind === "GENE") {
    return applyGivenItem(snapshot, influence, tick);
  }
  if (effect.kind === "FAVOR") {
    if (payload.lineageId == null) throw new Error("use item lineage");
    addFavor(snapshot, payload.lineageId, effect.amount);
    return [];
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
  return [];
}

function applyOne(
  snapshot: WorldSnapshot,
  influence: PlayerInfluenceRow,
  tick: number,
): WorldEvent[] {
  const events: WorldEvent[] = [];
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
      events.push(...applyUseItem(snapshot, influence, tick));
      break;
    case InfluenceKind.CREATURE_USE_ITEM: {
      const payload = influence.payload as CreatureUseItemPayload;
      events.push(
        ...applyCreatureUse(
          snapshot,
          {
            creatureId: payload.creatureId,
            item: payload.item,
            influenceId: influence.id,
          },
          tick,
          (territoryId, kind, amount, durationTicks) =>
            appendModifier(
              snapshot,
              influence,
              territoryId,
              kind,
              amount,
              tick,
              durationTicks,
            ),
        ),
      );
      break;
    }
    case InfluenceKind.CREATURE_CRAFT: {
      const payload = influence.payload as CreatureCraftPayload;
      events.push(
        ...applyCreatureCraft(
          snapshot,
          {
            creatureId: payload.creatureId,
            output: payload.output,
            influenceId: influence.id,
          },
          tick,
        ),
      );
      break;
    }
    default: {
      const never: never = influence.kind;
      throw new Error(`influence ${String(never)}`);
    }
  }
  influence.applied = true;
  return events;
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
 * An influence whose target no longer exists lapses (it is marked applied and
 * changes nothing): a queued row must never be able to stop the world.
 * Enrich/calm append modifiers; they never write territory base abundance/danger.
 * Favor only touches lineage.playerFavor — never health, genes, or needs;
 * its effect is the forage bonus in `resolveForage` (see favorForageBonus).
 */
export function applyInfluences(
  snapshot: WorldSnapshot,
  tick: number,
): WorldEvent[] {
  const pending = [...snapshot.pendingInfluences]
    .filter((row) => !row.applied && row.issuedAtTick === tick)
    .sort((a, b) => a.id - b.id);
  const events: WorldEvent[] = [];
  for (const influence of pending) {
    events.push(...applyOne(snapshot, influence, tick));
  }
  return events;
}
