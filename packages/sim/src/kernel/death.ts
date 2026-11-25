import {
  ActionTargetKind,
  CreatureStatus,
  DeathCause,
  MemoryKind,
  MemoryTag,
  type Ruleset,
} from "@boing-pets/contract";
import { deathEvent } from "../history/events";
import { divRound } from "../math";
import { initialMemoryStrength } from "../memories/strength";
import { isMemoryThrottled } from "../memories/throttle";
import type {
  CreatureRow,
  SpeciesRow,
  WorldEvent,
  WorldSnapshot,
} from "../types";

/** Creature-days lived at `tick`. The row stores `birthTick`. */
export function ageDays(
  birthTick: number,
  tick: number,
  ticksPerDay: number,
): number {
  if (ticksPerDay <= 0) throw new Error("ageDays");
  return Math.floor((tick - birthTick) / ticksPerDay);
}

/**
 * Gene strength 0 → 0.5×, 500 → 1.0×, 1000 → 1.5× the species base.
 * The caller compares `tick - birthTick` with this.
 */
export function lifespanTicks(
  species: SpeciesRow,
  geneStrength: number,
  rules: Ruleset,
): number {
  return divRound(
    species.baseLifespanDays * rules.ticksPerDay * (500 + geneStrength),
    1000,
  );
}

/** Hunger, then thirst, then illness. Old age is decided before drift. */
export function driftDeathCause(creature: CreatureRow): DeathCause | null {
  if (creature.hunger >= 1000) return DeathCause.STARVATION;
  if (creature.thirst >= 1000) return DeathCause.THIRST;
  if (creature.health <= 0) return DeathCause.ILLNESS;
  return null;
}

function take(
  snapshot: WorldSnapshot,
  key: "nextEventId" | "nextMemoryId",
): number {
  const id = snapshot.world[key];
  snapshot.world[key] = id + 1;
  return id;
}

function clearAction(creature: CreatureRow): void {
  creature.currentAction = null;
  creature.actionTargetKind = ActionTargetKind.NONE;
  creature.actionTargetId = null;
  creature.actionStartedTick = null;
  creature.actionEndsTick = null;
}

/** PARENT_DEATH is importance 50 and emotional value −900. Once per child. */
function rememberParentDeath(
  snapshot: WorldSnapshot,
  deceased: CreatureRow,
  tick: number,
): void {
  const children = snapshot.creatures
    .filter(
      (row) =>
        row.status === CreatureStatus.ALIVE &&
        (row.motherId === deceased.id || row.fatherId === deceased.id),
    )
    .sort((a, b) => a.id - b.id);
  const importance = 50;
  const emotionalValue = -900;
  for (const child of children) {
    if (
      isMemoryThrottled(snapshot, {
        creatureId: child.id,
        kind: MemoryKind.PARENT_DEATH,
        tick,
        subjectCreatureId: deceased.id,
      })
    ) {
      continue;
    }
    snapshot.memories.push({
      id: take(snapshot, "nextMemoryId"),
      worldId: snapshot.world.id,
      creatureId: child.id,
      tick,
      kind: MemoryKind.PARENT_DEATH,
      importance,
      emotionalValue,
      initialStrength: initialMemoryStrength(importance, snapshot.ruleset),
      subjectCreatureId: deceased.id,
      territoryId: null,
      payload: {
        tags: [MemoryTag.GRIEF],
        template: "parent_death.v1",
      },
      archived: false,
    });
  }
}

/**
 * Mark the creature dead and emit `DEATH`.
 * The row stays in the snapshot so the host can persist the flip.
 */
export function die(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  cause: DeathCause,
  territoryName: string,
  killer: CreatureRow | null = null,
): WorldEvent {
  const gestationLost = creature.gestationEndTick != null;
  creature.status = CreatureStatus.DEAD;
  creature.deathTick = tick;
  creature.deathCause = cause;
  clearAction(creature);
  if (gestationLost) creature.gestationEndTick = null;

  const event = deathEvent({
    id: take(snapshot, "nextEventId"),
    worldId: snapshot.world.id,
    tick,
    creatureId: creature.id,
    lineageId: creature.lineageId,
    territoryId: creature.territoryId,
    name: creature.name,
    cause,
    territoryName,
    ageDays: ageDays(creature.birthTick, tick, snapshot.ruleset.ticksPerDay),
    gestationLost,
    killer: killer ? { id: killer.id, name: killer.name } : null,
  });
  rememberParentDeath(snapshot, creature, tick);
  return event;
}
