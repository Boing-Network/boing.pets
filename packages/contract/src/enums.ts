/** Closed sets shared by the kernel, the host, and the client. */

export const CreatureStatus = {
  ALIVE: "ALIVE",
  DEAD: "DEAD",
} as const;
export type CreatureStatus =
  (typeof CreatureStatus)[keyof typeof CreatureStatus];

export const Gender = {
  FEMALE: "FEMALE",
  MALE: "MALE",
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

/**
 * What a species eats. The kernel turns this into forage odds and relief
 * (see `packages/sim/src/kernel/biology.ts`); there is no predation, so
 * CARNIVORE means "hunts small, unmodelled prey".
 */
export const Diet = {
  HERBIVORE: "HERBIVORE",
  OMNIVORE: "OMNIVORE",
  INSECTIVORE: "INSECTIVORE",
  CARNIVORE: "CARNIVORE",
} as const;
export type Diet = (typeof Diet)[keyof typeof Diet];

export const Goal = {
  FIND_FOOD: "FIND_FOOD",
  DRINK_WATER: "DRINK_WATER",
  SEEK_SHELTER: "SEEK_SHELTER",
  SOCIALIZE: "SOCIALIZE",
  EXPLORE: "EXPLORE",
  FIND_MATE: "FIND_MATE",
  PROTECT_OFFSPRING: "PROTECT_OFFSPRING",
  IDLE: "IDLE",
} as const;
export type Goal = (typeof Goal)[keyof typeof Goal];

/** Tie-break order. `FIND_FOOD` is 0. `IDLE` is stored, never an argmax result. */
export const GOAL_ORDER = [
  Goal.FIND_FOOD,
  Goal.DRINK_WATER,
  Goal.SEEK_SHELTER,
  Goal.SOCIALIZE,
  Goal.EXPLORE,
  Goal.FIND_MATE,
  Goal.PROTECT_OFFSPRING,
  Goal.IDLE,
] as const;

type AssertTrue<T extends true> = T;
type GoalOrderIsComplete = AssertTrue<
  [Goal] extends [(typeof GOAL_ORDER)[number]] ? true : false
>;

export function goalOrdinal(goal: Goal): number {
  const orderIsComplete: GoalOrderIsComplete = true;
  void orderIsComplete;
  return GOAL_ORDER.indexOf(goal);
}

export const Action = {
  FORAGE: "FORAGE",
  CONTEST: "CONTEST",
  COOPERATE_FORAGE: "COOPERATE_FORAGE",
  DRINK: "DRINK",
  REST: "REST",
  RELOCATE: "RELOCATE",
  APPROACH: "APPROACH",
  WANDER: "WANDER",
  COURT: "COURT",
  GUARD: "GUARD",
  NURSE: "NURSE",
} as const;
export type Action = (typeof Action)[keyof typeof Action];

export const ActionTargetKind = {
  NONE: "NONE",
  CREATURE: "CREATURE",
  TERRITORY: "TERRITORY",
} as const;
export type ActionTargetKind =
  (typeof ActionTargetKind)[keyof typeof ActionTargetKind];

export const MemoryKind = {
  CONVERSATION: "CONVERSATION",
  GIFT: "GIFT",
  RESCUE: "RESCUE",
  PARENT_DEATH: "PARENT_DEATH",
  FIRST_CHILD: "FIRST_CHILD",
  THREAT: "THREAT",
  MATE: "MATE",
  DISCOVERY: "DISCOVERY",
  MIGRATION: "MIGRATION",
  CONFLICT: "CONFLICT",
  COOPERATION: "COOPERATION",
} as const;
export type MemoryKind = (typeof MemoryKind)[keyof typeof MemoryKind];

export const EventKind = {
  BIRTH: "BIRTH",
  DEATH: "DEATH",
  MATING: "MATING",
  DISCOVERY: "DISCOVERY",
  MIGRATION: "MIGRATION",
} as const;
export type EventKind = (typeof EventKind)[keyof typeof EventKind];

export const DeathCause = {
  OLD_AGE: "OLD_AGE",
  STARVATION: "STARVATION",
  THIRST: "THIRST",
  ILLNESS: "ILLNESS",
  INJURY: "INJURY",
} as const;
export type DeathCause = (typeof DeathCause)[keyof typeof DeathCause];

export const InfluenceKind = {
  NAME_CREATURE: "NAME_CREATURE",
  NAME_LINEAGE: "NAME_LINEAGE",
  FAVOR_BLOODLINE: "FAVOR_BLOODLINE",
  ENRICH_TERRITORY: "ENRICH_TERRITORY",
  CALM_TERRITORY: "CALM_TERRITORY",
  /** M22: take resource units from a territory's regrowing stock. */
  GATHER_RESOURCE: "GATHER_RESOURCE",
  /** M22: spend a tool, consumable or relic for its effect. */
  USE_ITEM: "USE_ITEM",
} as const;
export type InfluenceKind = (typeof InfluenceKind)[keyof typeof InfluenceKind];

export const ModifierKind = {
  FOOD: "FOOD",
  DANGER: "DANGER",
  /** Gathered resource stock: negative food until it regrows. */
  HARVEST: "HARVEST",
  /** Salt lick: per-tick thirst and discomfort relief. */
  COMFORT: "COMFORT",
} as const;
export type ModifierKind = (typeof ModifierKind)[keyof typeof ModifierKind];

/** Live time scales. The tick contents do not change with scale. */
export const TIME_SCALES = [1, 4, 16, 64] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

export const MemoryTag = {
  FOOD_INSECURITY: "food_insecurity",
  FEAR_TERRITORY: "fear_territory",
  INJURY: "injury",
  GRIEF: "grief",
  DISCOVERY: "discovery",
  MIGRATION: "migration",
} as const;
export type MemoryTag = (typeof MemoryTag)[keyof typeof MemoryTag];

export const EventTemplate = {
  BIRTH: "birth.v1",
  BIRTH_FOUNDER: "birth.founder.v1",
  DEATH: "death.v1",
  MATING: "mating.v1",
  DISCOVERY: "discovery.v1",
  MIGRATION: "migration.v1",
} as const;
export type EventTemplate = (typeof EventTemplate)[keyof typeof EventTemplate];

export const MigrationReason = {
  FLEE: "FLEE",
  SETTLE: "SETTLE",
  PROTECT: "PROTECT",
} as const;
export type MigrationReason =
  (typeof MigrationReason)[keyof typeof MigrationReason];

export const RelationshipLabel = {
  FRIEND: "friend",
  MATE_POTENTIAL: "mate potential",
  COOPERATIVE: "cooperative",
  AVOIDING: "avoiding",
  IN_CONFLICT: "in conflict",
} as const;
export type RelationshipLabel =
  (typeof RelationshipLabel)[keyof typeof RelationshipLabel];
