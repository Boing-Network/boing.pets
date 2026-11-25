/**
 * Hazards: danger that bites. A creature in a dangerous territory is now and
 * then hurt (a fall, a predator, a storm), and a creature that is badly hurt
 * heals slowly, so a second blow or a hungry spell can finish it.
 *
 * The numbers live in code, not the frozen ruleset (like the item catalog),
 * so every world picks them up on load with no migration. Pure integer math;
 * the roll is a function of (seed, tick, "hazard", creature id).
 */
import { Action, type Ruleset } from "@boing-pets/contract";
import { clamp } from "../math";
import { rngInt } from "../rng";
import type { CreatureRow } from "../types";

export const HAZARD_RULES = {
  /** Perceived danger at or below this never hurts anyone. */
  dangerFloor: 150,
  /** Chance per tick, in parts per 100,000, per point of danger above the floor. */
  chancePerDangerNum: 58,
  chancePerDangerDen: 100,
  /** A resting (sheltered) creature is this many times less likely to be hit. */
  restingDivisor: 3,
  /** Health lost to one hit. */
  damageMin: 150,
  damageMax: 520,
  /** A hit frightens: added to unsafety, so the creature seeks shelter. */
  unsafetyHit: 250,
  /** Below this health a creature is wounded and heals slowly. */
  woundedBelow: 500,
  woundedRecoverPerTick: 1,
  /**
   * A species with this few living members is wary: a hit still wounds but
   * never kills, so danger alone cannot wipe out the last of a kind.
   */
  endangeredAtMost: 4,
  /** Health a non-lethal hit leaves at least. */
  spareHealth: 40,
} as const;

/** Chance of a hit this tick, in parts per 100,000. */
export function hazardChance(
  perceivedDanger: number,
  resting: boolean,
): number {
  const over = perceivedDanger - HAZARD_RULES.dangerFloor;
  if (over <= 0) return 0;
  const chance = Math.floor(
    (over * HAZARD_RULES.chancePerDangerNum) / HAZARD_RULES.chancePerDangerDen,
  );
  return resting ? Math.floor(chance / HAZARD_RULES.restingDivisor) : chance;
}

export type HazardOutcome = "none" | "hurt" | "killed";

/**
 * Roll this tick's hazard for one creature and apply it. Nursing young are
 * sheltered by the mother and never roll. Returns "killed" when the hit took
 * the creature's last health; the caller records the death.
 */
export function applyHazard(
  creature: CreatureRow,
  seed: number,
  tick: number,
  perceivedDanger: number,
  speciesLiving: number,
): HazardOutcome {
  if (creature.currentAction === Action.NURSE) return "none";
  const chance = hazardChance(
    perceivedDanger,
    creature.currentAction === Action.REST,
  );
  if (chance <= 0) return "none";
  if (rngInt(seed, tick, "hazard", creature.id, 0, 0, 99_999) >= chance) {
    return "none";
  }
  const damage = rngInt(
    seed,
    tick,
    "hazard",
    creature.id,
    1,
    HAZARD_RULES.damageMin,
    HAZARD_RULES.damageMax,
  );
  const endangered = speciesLiving <= HAZARD_RULES.endangeredAtMost;
  const floor = endangered
    ? Math.min(creature.health, HAZARD_RULES.spareHealth)
    : 0;
  creature.health = clamp(creature.health - damage, floor, 1000);
  creature.unsafety = clamp(
    creature.unsafety + HAZARD_RULES.unsafetyHit,
    0,
    1000,
  );
  return creature.health <= 0 ? "killed" : "hurt";
}

/** Health regained per tick when needs allow recovery: slow while wounded. */
export function recoverPerTick(health: number, rules: Ruleset): number {
  return health < HAZARD_RULES.woundedBelow
    ? Math.min(rules.healthRecoverPerTick, HAZARD_RULES.woundedRecoverPerTick)
    : rules.healthRecoverPerTick;
}
