/**
 * Plain-language labels for the kernel's enums. The host sends `SEEK_SHELTER`
 * and `FIRST_CHILD`; a player should read "Looking for shelter" and "First
 * child". Pure, so the wording is unit-tested against the contract enums.
 */
import type { Action, Goal, MemoryKind } from "@boing-pets/contract";

export const GOAL_LABELS: Record<Goal, string> = {
  FIND_FOOD: "Looking for food",
  DRINK_WATER: "Looking for water",
  SEEK_SHELTER: "Looking for shelter",
  SOCIALIZE: "Seeking company",
  EXPLORE: "Exploring",
  FIND_MATE: "Looking for a mate",
  PROTECT_OFFSPRING: "Protecting its young",
  IDLE: "Taking it easy",
};

export const ACTION_LABELS: Record<Action, string> = {
  FORAGE: "Foraging",
  CONTEST: "Fighting over food",
  COOPERATE_FORAGE: "Foraging together",
  DRINK: "Drinking",
  REST: "Resting",
  RELOCATE: "Moving to a new territory",
  APPROACH: "Approaching another creature",
  WANDER: "Wandering",
  COURT: "Courting",
  GUARD: "Standing guard",
  NURSE: "Nursing its young",
};

export const MEMORY_LABELS: Record<MemoryKind, string> = {
  CONVERSATION: "A conversation",
  GIFT: "A gift",
  RESCUE: "A rescue",
  PARENT_DEATH: "Lost a parent",
  FIRST_CHILD: "First child",
  THREAT: "A threat",
  MATE: "Found a mate",
  DISCOVERY: "A discovery",
  MIGRATION: "A migration",
  CONFLICT: "A conflict",
  COOPERATION: "Working together",
};

/** `SOME_NEW_VALUE` → "Some New Value", for values this client predates. */
export function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** A newer host may send a value this build has no phrase for. */
function labelFrom(table: Record<string, string>, value: string): string {
  return Object.hasOwn(table, value) ? table[value]! : titleCase(value);
}

export function goalLabel(goal: string): string {
  return labelFrom(GOAL_LABELS, goal);
}

export function actionLabel(action: string): string {
  return labelFrom(ACTION_LABELS, action);
}

export function memoryLabel(kind: string): string {
  return labelFrom(MEMORY_LABELS, kind);
}

export type MemoryStrength = {
  label: "vivid" | "clear" | "fading";
  /** Meter fill, 0–100. */
  percent: number;
};

/**
 * Memory strength is 0–1000 and decays over time. Players get a word and a
 * meter; the raw number stays a tooltip, like needs.
 *
 * The bands follow how the kernel fills that range, not even thirds: an
 * everyday memory (a talk, a discovery) starts under 200 and only a life
 * event (a first child, a parent's death) starts above 300. Even thirds would
 * call every everyday memory "fading" the moment it formed.
 */
export function memoryStrength(strength: number): MemoryStrength {
  const v = Number.isFinite(strength)
    ? Math.max(0, Math.min(1000, Math.round(strength)))
    : 0;
  const label = v >= 300 ? "vivid" : v >= 100 ? "clear" : "fading";
  return { label, percent: Math.round(v / 10) };
}
