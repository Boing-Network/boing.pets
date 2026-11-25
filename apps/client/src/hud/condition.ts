/**
 * Which creatures need help, and why. Pure, so it is unit-tested.
 *
 * Health is 0–1000 (higher is better). Below 500 a creature is wounded and
 * heals slowly, so that is where a player's potion or stew changes the
 * outcome. Hunger and thirst kill at 1000.
 */
import { CreatureStatus } from "@boing-pets/contract";

/** Mirrors the kernel's `HAZARD_RULES.woundedBelow`. */
export const WOUNDED_BELOW = 500;
const CRITICAL_BELOW = 250;
const STARVING_AT = 850;

export type ConditionInput = {
  status: string;
  /** Absent from servers older than the health field: treated as healthy. */
  health?: number;
  needs?: { hunger: number; thirst: number };
};

export type Condition = {
  /** 0 fine · 1 needs help · 2 in danger of dying. */
  level: 0 | 1 | 2;
  /** Short reasons, worst first ("badly wounded", "starving"). */
  reasons: string[];
  /** What a player can do about it. Empty when nothing is wrong. */
  advice: string;
};

const FINE: Condition = { level: 0, reasons: [], advice: "" };

export function creatureCondition(creature: ConditionInput): Condition {
  if (creature.status !== CreatureStatus.ALIVE) return FINE;
  const health = creature.health ?? 1000;
  const hunger = creature.needs?.hunger ?? 0;
  const thirst = creature.needs?.thirst ?? 0;
  const reasons: string[] = [];
  const advice: string[] = [];
  let level: 0 | 1 | 2 = 0;
  if (health < WOUNDED_BELOW) {
    const critical = health < CRITICAL_BELOW;
    reasons.push(critical ? "badly wounded" : "wounded");
    advice.push("a Mending Potion heals it");
    level = critical ? 2 : 1;
  }
  if (hunger >= STARVING_AT) {
    reasons.push("starving");
    advice.push("a Hearty Stew feeds it");
    level = 2;
  }
  if (thirst >= STARVING_AT) {
    reasons.push("parched");
    if (hunger < STARVING_AT) advice.push("a Hearty Stew eases its thirst");
    level = 2;
  }
  if (level === 0) return FINE;
  const text = advice.join("; ");
  return {
    level,
    reasons,
    advice: text.charAt(0).toUpperCase() + text.slice(1) + ".",
  };
}

/** Ids of living creatures that need help, most urgent first. */
export function creaturesInNeed<T extends ConditionInput & { id: number }>(
  creatures: readonly T[],
): T[] {
  return creatures
    .map((creature) => ({ creature, condition: creatureCondition(creature) }))
    .filter((row) => row.condition.level > 0)
    .sort(
      (a, b) =>
        b.condition.level - a.condition.level ||
        (a.creature.health ?? 1000) - (b.creature.health ?? 1000) ||
        a.creature.id - b.creature.id,
    )
    .map((row) => row.creature);
}

export type HealthLevel = {
  label: string;
  /** 0 fine · 1 noticeable · 2 pressing · 3 critical (same scale as needs). */
  tone: 0 | 1 | 2 | 3;
  percent: number;
};

/** Health as a word and a meter fill (fuller is better). */
export function healthLevel(health: number): HealthLevel {
  const v = Math.max(0, Math.min(1000, Math.round(health)));
  const tone =
    v >= 750 ? 0 : v >= WOUNDED_BELOW ? 1 : v >= CRITICAL_BELOW ? 2 : 3;
  const label = ["healthy", "hurt", "wounded", "badly wounded"][tone]!;
  return { label, tone, percent: Math.round(v / 10) };
}
