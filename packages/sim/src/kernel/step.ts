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
import { biologyFor, perceivedDanger } from "./biology";
import { applyHazard } from "./hazards";

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
  // Living members per species as the tick starts (hazards spare the last few).
  const speciesLiving = new Map<number, number>();
  for (const creature of ordered) {
    if (creature.status !== CreatureStatus.ALIVE) continue;
    speciesLiving.set(
      creature.speciesId,
      (speciesLiving.get(creature.speciesId) ?? 0) + 1,
    );
  }

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

    const biology = biologyFor(creature.speciesId);
    applyNeedDrift(creature, creaturesById, rules, territory, biology);
    applyHealthDrift(creature, rules);
    const hazard = applyHazard(
      creature,
      snapshot.world.seed,
      tick,
      perceivedDanger(biology, territory),
      speciesLiving.get(creature.speciesId) ?? 0,
    );
    const cause =
      hazard === "killed" ? DeathCause.INJURY : driftDeathCause(creature);
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
 * Creature item uses and crafts (host-issued influences) apply with them;
 * creature loot happens when a FORAGE resolves.
 */
export function step(snapshot: WorldSnapshot): StepResult {
  const tick = snapshot.world.lastTick + 1;
  const events: WorldEvent[] = [];
  events.push(...applyInfluences(snapshot, tick));
  const territories = aggregateTerritories(snapshot, tick);
  stepCreatures(snapshot, tick, territories, events);
  resolveBirths(snapshot, tick, events);
  decayQuietRelationships(snapshot, tick);
  decayLineageFavor(snapshot, tick);
  snapshot.world.lastTick = tick;
  return { snapshot, events };
}
