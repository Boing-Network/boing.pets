import { Action, CreatureStatus, DeathCause } from "@boing-pets/contract";
import { resolveRelocate } from "../ai/actions";
import type { StepResult, WorldEvent, WorldSnapshot } from "../types";
import { die, driftDeathCause, lifespanTicks } from "./death";
import { applyHealthDrift, applyNeedDrift, type TerritoryTick } from "./needs";
import { aggregateTerritories } from "./territories";

function indexById<T extends { id: number }>(
  rows: readonly T[],
): Map<number, T> {
  const map = new Map<number, T>();
  for (const row of rows) map.set(row.id, row);
  return map;
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
    if (cause) {
      events.push(die(snapshot, creature, tick, cause, territory.name));
      continue;
    }

    if (
      creature.currentAction === Action.RELOCATE &&
      creature.actionEndsTick === tick
    ) {
      events.push(...resolveRelocate(snapshot, creature, tick));
    }
  }
}

/**
 * Simulate the next tick in place.
 * A finished relocate arrives here. Influences, other actions, births, and
 * relationship decay land in later milestones.
 */
export function step(snapshot: WorldSnapshot): StepResult {
  const tick = snapshot.world.lastTick + 1;
  const events: WorldEvent[] = [];
  const territories = aggregateTerritories(snapshot, tick);
  stepCreatures(snapshot, tick, territories, events);
  snapshot.world.lastTick = tick;
  return { snapshot, events };
}
