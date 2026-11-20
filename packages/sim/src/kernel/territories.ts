import { CreatureStatus, ModifierKind } from "@boing-pets/contract";
import { assertInteger, clamp } from "../math";
import type { WorldSnapshot } from "../types";
import type { TerritoryTick } from "./needs";

function addBonus(
  bonuses: Map<number, number>,
  territoryId: number,
  amount: number,
): void {
  bonuses.set(territoryId, (bonuses.get(territoryId) ?? 0) + amount);
}

/** Effective food, danger, and living population. Reused for the whole tick. */
export function aggregateTerritories(
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
      slug: territory.slug,
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

/** food * 2 - danger * 2 - crowding * 20. Used to break flee ties. */
export function settleScore(territory: TerritoryTick): number {
  const crowded = Math.max(0, territory.population - territory.capacity);
  return assertInteger(
    territory.food * 2 - territory.danger * 2 - crowded * 20,
    "settle",
  );
}
