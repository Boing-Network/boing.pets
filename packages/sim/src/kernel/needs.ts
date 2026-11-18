import { Action, CreatureStatus, type Ruleset } from "@boing-pets/contract";
import { assertInteger, clamp } from "../math";
import type { CreatureRow } from "../types";

/** Effective territory stats for one tick. Population includes creatures in transit. */
export type TerritoryTick = {
  name: string;
  food: number;
  danger: number;
  population: number;
  capacity: number;
};

function score(value: number, label: string): number {
  return assertInteger(clamp(value, 0, 1000), label);
}

function motherBeside(
  creature: CreatureRow,
  byId: ReadonlyMap<number, CreatureRow>,
): boolean {
  if (creature.motherId == null) return false;
  const mother = byId.get(creature.motherId);
  return (
    mother !== undefined &&
    mother.status === CreatureStatus.ALIVE &&
    mother.territoryId === creature.territoryId
  );
}

/** One tick of need drift. Action resolution is a later milestone. */
export function applyNeedDrift(
  creature: CreatureRow,
  byId: ReadonlyMap<number, CreatureRow>,
  rules: Ruleset,
  territory: TerritoryTick,
): void {
  const action = creature.currentAction;
  const resting = action === Action.REST;
  const nursing = action === Action.NURSE;

  let hunger = creature.hunger;
  let thirst = creature.thirst;
  let fatigue = creature.fatigue;
  let discomfort = creature.discomfort;
  let unsafety = creature.unsafety;
  let loneliness = creature.loneliness;

  hunger += nursing ? rules.nurseHungerPerTick : rules.hungerPerTick;
  thirst += nursing ? rules.nurseThirstPerTick : rules.thirstPerTick;
  if (resting) fatigue -= rules.fatigueRestPerTick;
  else if (nursing) fatigue += rules.fatigueNursePerTick;
  else fatigue += rules.fatigueAwakePerTick;

  const crowded = Math.max(0, territory.population - territory.capacity);
  discomfort +=
    rules.discomfortBasePerTick + crowded * rules.discomfortOvercrowdPerHead;
  if (territory.danger > rules.discomfortDangerThreshold) {
    discomfort += rules.discomfortDangerPerTick;
  }
  if (resting) discomfort -= rules.discomfortRestPerTick;

  const targetDanger = resting
    ? Math.floor(territory.danger / 2)
    : territory.danger;
  if (unsafety < targetDanger) unsafety += rules.unsafetyApproachPerTick;
  else {
    unsafety -= resting
      ? rules.unsafetyRestPerTick
      : rules.unsafetyRetreatPerTick;
  }

  if (nursing && motherBeside(creature, byId)) {
    loneliness -= rules.lonelinessNurseNearMother;
  } else if (action !== Action.APPROACH) {
    loneliness += rules.lonelinessPerTick;
  }

  creature.hunger = score(hunger, "hunger");
  creature.thirst = score(thirst, "thirst");
  creature.fatigue = score(fatigue, "fatigue");
  creature.discomfort = score(discomfort, "discomfort");
  creature.unsafety = score(unsafety, "unsafety");
  creature.loneliness = score(loneliness, "loneliness");
}

/** Health drift from the needs this tick already wrote. */
export function applyHealthDrift(creature: CreatureRow, rules: Ruleset): void {
  let health = creature.health;
  const critical =
    creature.hunger > rules.healthCriticalThreshold ||
    creature.thirst > rules.healthCriticalThreshold;
  const deprived =
    creature.hunger > rules.healthStarveThreshold ||
    creature.thirst > rules.healthStarveThreshold;
  if (critical) health -= rules.healthCriticalPerTick;
  else if (deprived) health -= rules.healthStarvePerTick;
  if (creature.fatigue > rules.healthExhaustThreshold) {
    health -= rules.healthExhaustPerTick;
  }
  if (
    creature.hunger < rules.healthRecoverHungerMax &&
    creature.thirst < rules.healthRecoverThirstMax &&
    creature.fatigue < rules.healthRecoverFatigueMax
  ) {
    health += rules.healthRecoverPerTick;
  }
  creature.health = score(health, "health");
}
