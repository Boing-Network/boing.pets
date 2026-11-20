import { Action, CreatureStatus, DeathCause } from "@boing-pets/contract";
import {
  chooseAndStartAction,
  resolveFinishedAction,
  resolveRelocate,
} from "../ai/actions";
import { decayQuietRelationships } from "../relationships/decay";
import type { StepResult, WorldEvent, WorldSnapshot } from "../types";
import { resolveBirths } from "./birth";
import { die, driftDeathCause, lifespanTicks } from "./death";
import { applyInfluences, decayLineageFavor } from "./influences";
import { applyHealthDrift, applyNeedDrift, type TerritoryTick } from "./needs";
import { aggregateTerritories } from "./territories";
import { biologyFor } from "./biology";

function indexById<T extends { id: number }>(
  rows: readonly T[],
): Map<number, T> {
  const map = new Map<number, T>();
  for (const row of rows) map.set(row.id, row);
  return map;
}

function actionSlotEmpty(creature: { currentAction: Action | null }): boolean {
  return creature.currentAction == null;
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

    applyNeedDrift(
      creature,
      creaturesById,
      rules,
      territory,
      biologyFor(creature.speciesId),
    );
    applyHealthDrift(creature, rules);
    const cause = driftDeathCause(creature);
    if (cause) {
      events.push(die(snapshot, creature, tick, cause, territory.name));
      continue;
    }

    if (creature.actionEndsTick === tick) {
      if (creature.currentAction === Action.RELOCATE) {
        events.push(...resolveRelocate(snapshot, creature, tick));
      } else {
        events.push(
          ...resolveFinishedAction(snapshot, creature, tick, territories),
        );
      }
    }

    if (creature.status === CreatureStatus.ALIVE && actionSlotEmpty(creature)) {
      chooseAndStartAction(snapshot, creature, tick, territories);
    }
  }
}

/**
 * Simulate the next tick in place.
 * Influences apply first, then aggregates, creatures, births, and decay.
 */
export function step(snapshot: WorldSnapshot): StepResult {
  const tick = snapshot.world.lastTick + 1;
  const events: WorldEvent[] = [];
  applyInfluences(snapshot, tick);
  const territories = aggregateTerritories(snapshot, tick);
  stepCreatures(snapshot, tick, territories, events);
  resolveBirths(snapshot, tick, events);
  decayQuietRelationships(snapshot, tick);
  decayLineageFavor(snapshot, tick);
  snapshot.world.lastTick = tick;
  return { snapshot, events };
}
