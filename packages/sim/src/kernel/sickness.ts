/**
 * Sickness: now and then an outbreak starts in a crowded territory. For two
 * days the susceptible creatures there lose health and do not mend, so a
 * creature that was already hurt may die unless it is helped or moves on.
 *
 * An outbreak is a `SICKNESS` territory modifier, so it needs no per-creature
 * state: a creature is sick while it stands in a territory with an active
 * outbreak and its roll for that outbreak says so. Leaving the territory ends
 * it. The numbers live in code, like `HAZARD_RULES`.
 */
import { Action, CreatureStatus, ModifierKind } from "@boing-pets/contract";
import { outbreakEvent } from "../history/events";
import { clamp } from "../math";
import { rngInt } from "../rng";
import type { CreatureRow, WorldEvent, WorldSnapshot } from "../types";
import { HAZARD_RULES } from "./hazards";

export const SICKNESS_RULES = {
  /** A territory this empty (population per mille of capacity) is never struck. */
  fillFloor: 500,
  /** Chance per day, per mille, for each `fillPerChance` of fill above the floor. */
  fillPerChance: 8,
  chanceMaxPerMille: 80,
  /** Fewer creatures than this cannot sustain an outbreak. */
  minPopulation: 6,
  durationDays: 2,
  /** Health lost per tick by a sick creature; halved (rounded up) at rest. */
  drainPerTick: 2,
  /** Share of a territory's creatures that catch it, per mille. */
  susceptiblePerMille: 400,
} as const;

/** The active outbreak in one territory. */
export type Sickness = {
  /** The modifier row's id: salts each creature's susceptibility roll. */
  id: number;
  startTick: number;
  endTick: number;
  drain: number;
};

/** Active outbreaks by territory id. The earliest-started one wins. */
export function activeSickness(
  snapshot: WorldSnapshot,
  tick: number,
): Map<number, Sickness> {
  const out = new Map<number, Sickness>();
  for (const modifier of snapshot.modifiers) {
    if (modifier.kind !== ModifierKind.SICKNESS) continue;
    if (modifier.startTick > tick || tick >= modifier.endTick) continue;
    const held = out.get(modifier.territoryId);
    if (
      held &&
      (held.startTick < modifier.startTick ||
        (held.startTick === modifier.startTick && held.id < modifier.id))
    ) {
      continue;
    }
    out.set(modifier.territoryId, {
      id: modifier.id,
      startTick: modifier.startTick,
      endTick: modifier.endTick,
      drain: modifier.amount,
    });
  }
  return out;
}

/** Chance per day, per mille, that an outbreak starts here. */
export function outbreakChance(population: number, capacity: number): number {
  if (capacity <= 0 || population < SICKNESS_RULES.minPopulation) return 0;
  const fill = Math.floor((population * 1000) / capacity);
  return clamp(
    Math.floor(
      (fill - SICKNESS_RULES.fillFloor) / SICKNESS_RULES.fillPerChance,
    ),
    0,
    SICKNESS_RULES.chanceMaxPerMille,
  );
}

/**
 * Once a day, roll for a new outbreak in each territory that has none.
 * Runs before the tick's territory aggregates, so it starts this tick.
 */
export function startOutbreaks(
  snapshot: WorldSnapshot,
  tick: number,
  events: WorldEvent[],
): void {
  const ticksPerDay = snapshot.ruleset.ticksPerDay;
  if (tick % ticksPerDay !== 0) return;
  const active = activeSickness(snapshot, tick);
  const population = new Map<number, number>();
  for (const creature of snapshot.creatures) {
    if (creature.status !== CreatureStatus.ALIVE) continue;
    population.set(
      creature.territoryId,
      (population.get(creature.territoryId) ?? 0) + 1,
    );
  }
  const territories = [...snapshot.territories].sort((a, b) => a.id - b.id);
  for (const territory of territories) {
    if (active.has(territory.id)) continue;
    const chance = outbreakChance(
      population.get(territory.id) ?? 0,
      territory.capacity,
    );
    if (chance <= 0) continue;
    const roll = rngInt(
      snapshot.world.seed,
      tick,
      "sickness",
      territory.id,
      0,
      0,
      999,
    );
    if (roll >= chance) continue;
    const id = snapshot.world.nextModifierId;
    snapshot.world.nextModifierId = id + 1;
    const endTick = tick + SICKNESS_RULES.durationDays * ticksPerDay;
    snapshot.modifiers.push({
      id,
      worldId: snapshot.world.id,
      territoryId: territory.id,
      kind: ModifierKind.SICKNESS,
      amount: SICKNESS_RULES.drainPerTick,
      startTick: tick,
      endTick,
      sourceInfluenceId: null,
    });
    const eventId = snapshot.world.nextEventId;
    snapshot.world.nextEventId = eventId + 1;
    events.push(
      outbreakEvent({
        id: eventId,
        worldId: snapshot.world.id,
        tick,
        territoryId: territory.id,
        territoryName: territory.name,
        endTick,
      }),
    );
  }
}

/**
 * Whether this creature has caught the outbreak in its territory. The roll is
 * fixed per (outbreak, creature), so it does not flicker from tick to tick.
 * Nursing young are sheltered by the mother.
 */
export function isSick(
  creature: Pick<CreatureRow, "id" | "status" | "currentAction">,
  sickness: Sickness | undefined,
  seed: number,
): boolean {
  if (sickness == null) return false;
  if (creature.status !== CreatureStatus.ALIVE) return false;
  if (creature.currentAction === Action.NURSE) return false;
  return (
    rngInt(
      seed,
      sickness.startTick,
      "sickness",
      creature.id,
      sickness.id,
      0,
      999,
    ) < SICKNESS_RULES.susceptiblePerMille
  );
}

/**
 * One tick of a sick creature's drain. Like a hazard, sickness alone never
 * takes the last few of a species below `spareHealth`.
 */
export function applySickness(
  creature: CreatureRow,
  sickness: Sickness,
  speciesLiving: number,
): void {
  const resting = creature.currentAction === Action.REST;
  const drain = resting ? Math.ceil(sickness.drain / 2) : sickness.drain;
  const endangered = speciesLiving <= HAZARD_RULES.endangeredAtMost;
  const floor = endangered
    ? Math.min(creature.health, HAZARD_RULES.spareHealth)
    : 0;
  creature.health = clamp(creature.health - drain, floor, 1000);
}
