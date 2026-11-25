import { Action, CreatureStatus, type Ruleset } from "@boing-pets/contract";
import { assertInteger, clamp } from "../math";
import type { CreatureRow } from "../types";
import { HAZARD_RULES, recoverPerTick } from "./hazards";
import type { Sickness } from "./sickness";
import {
  NEUTRAL_PROFILE,
  perceivedDanger,
  type BiologyProfile,
} from "./biology";

/** Effective territory stats for one tick. Population includes creatures in transit. */
export type TerritoryTick = {
  name: string;
  /** Territory slug, for habitat checks. */
  slug: string;
  food: number;
  danger: number;
  population: number;
  capacity: number;
  /** M22 salt lick: per-tick thirst and discomfort relief (0..3). */
  comfort?: number;
  /** The outbreak here this tick, if any (see `kernel/sickness.ts`). */
  sickness?: Sickness;
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

/**
 * Milk: a nursing newborn beside its living mother is fed and watered, so
 * these are subtracted from the nursing drift (net relief per tick).
 */
export const MILK_HUNGER_RELIEF = 4;
export const MILK_THIRST_RELIEF = 5;

/** One tick of need drift, with the species' biology offsets. */
export function applyNeedDrift(
  creature: CreatureRow,
  byId: ReadonlyMap<number, CreatureRow>,
  rules: Ruleset,
  territory: TerritoryTick,
  biology: BiologyProfile = NEUTRAL_PROFILE,
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

  const suckling = nursing && motherBeside(creature, byId);
  if (nursing) {
    hunger += rules.nurseHungerPerTick;
    thirst += rules.nurseThirstPerTick;
    if (suckling) {
      hunger -= MILK_HUNGER_RELIEF;
      thirst -= MILK_THIRST_RELIEF;
    }
  } else {
    hunger += Math.max(0, rules.hungerPerTick + biology.needs.hunger);
    thirst += Math.max(0, rules.thirstPerTick + biology.needs.thirst);
  }
  if (resting) fatigue -= rules.fatigueRestPerTick;
  else if (nursing) fatigue += rules.fatigueNursePerTick;
  else {
    fatigue += Math.max(0, rules.fatigueAwakePerTick + biology.needs.fatigue);
  }

  const crowded = Math.max(0, territory.population - territory.capacity);
  discomfort +=
    rules.discomfortBasePerTick + crowded * rules.discomfortOvercrowdPerHead;
  const danger = perceivedDanger(biology, territory);
  if (danger > rules.discomfortDangerThreshold) {
    discomfort += rules.discomfortDangerPerTick;
  }
  if (resting) discomfort -= rules.discomfortRestPerTick;
  const comfort = territory.comfort ?? 0;
  if (comfort > 0) {
    thirst -= comfort;
    discomfort -= comfort;
  }

  const targetDanger = resting ? Math.floor(danger / 2) : danger;
  if (unsafety < targetDanger) unsafety += rules.unsafetyApproachPerTick;
  else {
    unsafety -= resting
      ? rules.unsafetyRestPerTick
      : rules.unsafetyRetreatPerTick;
  }

  if (suckling) {
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

/**
 * Health drift from the needs this tick already wrote. A sick creature does
 * not mend on its own until the sickness passes.
 *
 * `endangered` (the species is down to its last few) stops want from taking
 * the last health: a famine that empties a crowded territory leaves the last
 * of a kind weak, not dead. Hunger or thirst at 1000 still kills.
 */
export function applyHealthDrift(
  creature: CreatureRow,
  rules: Ruleset,
  sick = false,
  endangered = false,
): void {
  const before = creature.health;
  let health = before;
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
    !sick &&
    creature.hunger < rules.healthRecoverHungerMax &&
    creature.thirst < rules.healthRecoverThirstMax &&
    creature.fatigue < rules.healthRecoverFatigueMax
  ) {
    health += recoverPerTick(health, rules);
  }
  if (endangered) {
    health = Math.max(health, Math.min(before, HAZARD_RULES.spareHealth));
  }
  creature.health = score(health, "health");
}
