import { CreatureStatus, DeathCause, ModifierKind } from "@boing-pets/contract";
import { assertInteger, clamp } from "../math";
import type { StepResult, WorldEvent, WorldSnapshot } from "../types";
import { die, driftDeathCause, lifespanTicks } from "./death";
import { applyHealthDrift, applyNeedDrift, type TerritoryTick } from "./needs";

function indexById<T extends { id: number }>(
  rows: readonly T[],
): Map<number, T> {
  const map = new Map<number, T>();
  for (const row of rows) map.set(row.id, row);
  return map;
}

function addBonus(
  bonuses: Map<number, number>,
  territoryId: number,
  amount: number,
): void {
  bonuses.set(territoryId, (bonuses.get(territoryId) ?? 0) + amount);
}

/** Effective food, danger, and living population. Reused for the whole tick. */
function aggregateTerritories(
  snapshot: WorldSnapshot,
  tick: number,
): Map<number, TerritoryTick> {
  const population = new Map<number, number>();
  for (const creature of snapshot.creatures) {
    if (creature.status !== CreatureStatus.ALIVE) continue;
    addBonus(population, creature.territoryId, 1);
  }

  const foodBonus = new Map<number, number>();
  const dangerBonus = new Map<number, number>();
  for (const modifier of snapshot.modifiers) {
    if (modifier.startTick > tick || tick >= modifier.endTick) continue;
    switch (modifier.kind) {
      case ModifierKind.FOOD:
        addBonus(foodBonus, modifier.territoryId, modifier.amount);
        break;
      case ModifierKind.DANGER:
        addBonus(dangerBonus, modifier.territoryId, modifier.amount);
        break;
      default: {
        const never: never = modifier.kind;
        throw new Error(`modifier ${String(never)}`);
      }
    }
  }

  const stats = new Map<number, TerritoryTick>();
  for (const territory of snapshot.territories) {
    stats.set(territory.id, {
      name: territory.name,
      food: assertInteger(
        clamp(
          territory.foodAbundance + (foodBonus.get(territory.id) ?? 0),
          0,
          1000,
        ),
        "food",
      ),
      danger: assertInteger(
        clamp(territory.danger + (dangerBonus.get(territory.id) ?? 0), 0, 1000),
        "danger",
      ),
      population: assertInteger(
        population.get(territory.id) ?? 0,
        "population",
      ),
      capacity: territory.capacity,
    });
  }
  return stats;
}

function stepCreatures(
  snapshot: WorldSnapshot,
  tick: number,
  territories: ReadonlyMap<number, TerritoryTick>,
  events: WorldEvent[],
): void {
  const rules = snapshot.ruleset;
  const speciesById = indexById(snapshot.species);
  const creaturesById = indexById(snapshot.creatures);
  const ordered = [...snapshot.creatures].sort((a, b) => a.id - b.id);

  for (const creature of ordered) {
    if (creature.status !== CreatureStatus.ALIVE) continue;
    const species = speciesById.get(creature.speciesId);
    if (!species) throw new Error("species");
    const territory = territories.get(creature.territoryId);
    if (!territory) throw new Error("territory");

    const lived = tick - creature.birthTick;
    if (lived >= lifespanTicks(species, creature.geneStrength, rules)) {
      events.push(
        die(snapshot, creature, tick, DeathCause.OLD_AGE, territory.name),
      );
      continue;
    }

    applyNeedDrift(creature, creaturesById, rules, territory);
    applyHealthDrift(creature, rules);
    const cause = driftDeathCause(creature);
    if (!cause) continue;
    events.push(die(snapshot, creature, tick, cause, territory.name));
  }
}

/**
 * Simulate the next tick in place.
 * Influences, action resolution, births, and relationship decay land in
 * later milestones. This tick drifts needs, applies health, and records deaths.
 */
export function step(snapshot: WorldSnapshot): StepResult {
  const tick = snapshot.world.lastTick + 1;
  const events: WorldEvent[] = [];
  const territories = aggregateTerritories(snapshot, tick);
  stepCreatures(snapshot, tick, territories, events);
  snapshot.world.lastTick = tick;
  return { snapshot, events };
}
