/**
 * Utility AI: score every eligible goal and take the argmax.
 * Memory strength is derived; the Memory term uses the hot set of 32.
 */
import {
  Action,
  CreatureStatus,
  Goal,
  GOAL_ORDER,
  goalOrdinal,
  type Ruleset,
} from "@boing-pets/contract";
import { ageDays } from "../kernel/death";
import { assertInteger, clamp, divRound } from "../math";
import { memoryTermForGoal } from "../memories/score";
import type {
  CompatibilityRow,
  CreatureRow,
  RelationshipRow,
  SpeciesRow,
  WorldSnapshot,
} from "../types";

export type GoalTerms = {
  goal: Goal;
  need: number;
  personality: number;
  relationship: number;
  memory: number;
  score: number;
};

const SCORED_GOALS: readonly Goal[] = GOAL_ORDER.filter(
  (goal) => goal !== Goal.IDLE,
);

function fertility(
  compatibility: readonly CompatibilityRow[],
  speciesA: number,
  speciesB: number,
): number {
  const low = Math.min(speciesA, speciesB);
  const high = Math.max(speciesA, speciesB);
  const row = compatibility.find(
    (entry) => entry.speciesLowId === low && entry.speciesHighId === high,
  );
  return row?.fertility ?? 0;
}

/** Missing pairs read as zeros. Creation is a later milestone. */
export function pairOf(
  relationships: readonly RelationshipRow[],
  creatureAId: number,
  creatureBId: number,
): RelationshipRow | null {
  const low = Math.min(creatureAId, creatureBId);
  const high = Math.max(creatureAId, creatureBId);
  return (
    relationships.find(
      (row) => row.creatureAId === low && row.creatureBId === high,
    ) ?? null
  );
}

function pairField(
  relationships: readonly RelationshipRow[],
  creatureAId: number,
  creatureBId: number,
  field: keyof Pick<
    RelationshipRow,
    | "score"
    | "friendship"
    | "romance"
    | "trust"
    | "cooperation"
    | "avoidance"
    | "conflict"
  >,
): number {
  return pairOf(relationships, creatureAId, creatureBId)?.[field] ?? 0;
}

function isMature(
  creature: CreatureRow,
  species: SpeciesRow,
  tick: number,
  ticksPerDay: number,
): boolean {
  return ageDays(creature.birthTick, tick, ticksPerDay) >= species.maturityDays;
}

function isGestating(creature: CreatureRow, tick: number): boolean {
  return creature.gestationEndTick != null && tick < creature.gestationEndTick;
}

function cooldownClear(creature: CreatureRow, tick: number): boolean {
  return (
    creature.mateCooldownUntilTick == null ||
    tick >= creature.mateCooldownUntilTick
  );
}

function mateBodyOk(creature: CreatureRow, rules: Ruleset): boolean {
  return (
    creature.health >= rules.mateHealthMin &&
    creature.hunger < rules.mateHungerMax &&
    creature.thirst < rules.mateThirstMax
  );
}

export function othersInTerritory(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
): CreatureRow[] {
  return snapshot.creatures
    .filter(
      (other) =>
        other.id !== creature.id &&
        other.status === CreatureStatus.ALIVE &&
        other.territoryId === creature.territoryId,
    )
    .sort((a, b) => a.id - b.id);
}

function speciesOf(snapshot: WorldSnapshot, creature: CreatureRow): SpeciesRow {
  const species = snapshot.species.find((row) => row.id === creature.speciesId);
  if (!species) throw new Error("species");
  return species;
}

/** Alive, other gender, fertile, mature, free, healthy, conflict under the gate. */
export function legalPartners(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
): CreatureRow[] {
  const rules = snapshot.ruleset;
  const actorSpecies = speciesOf(snapshot, creature);
  if (
    !isMature(creature, actorSpecies, tick, rules.ticksPerDay) ||
    !mateBodyOk(creature, rules) ||
    isGestating(creature, tick) ||
    !cooldownClear(creature, tick)
  ) {
    return [];
  }
  return othersInTerritory(snapshot, creature).filter((other) => {
    if (other.gender === creature.gender) return false;
    const otherSpecies = speciesOf(snapshot, other);
    if (
      fertility(snapshot.compatibility, creature.speciesId, other.speciesId) <=
      0
    ) {
      return false;
    }
    if (!isMature(other, otherSpecies, tick, rules.ticksPerDay)) return false;
    if (isGestating(other, tick) || !cooldownClear(other, tick)) return false;
    if (!mateBodyOk(other, rules)) return false;
    const conflict = pairField(
      snapshot.relationships,
      creature.id,
      other.id,
      "conflict",
    );
    return conflict < rules.mateConflictMax;
  });
}

function adjacentTerritoryIds(
  snapshot: WorldSnapshot,
  territoryId: number,
): number[] {
  return snapshot.links
    .filter((link) => link.fromId === territoryId)
    .map((link) => link.toId)
    .sort((a, b) => a - b);
}

/** Living juvenile offspring in this territory or one hop away. */
export function protectedOffspring(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
): CreatureRow[] {
  const species = speciesOf(snapshot, creature);
  const here = creature.territoryId;
  const nearby = new Set([here, ...adjacentTerritoryIds(snapshot, here)]);
  return snapshot.creatures
    .filter((child) => {
      if (child.status !== CreatureStatus.ALIVE) return false;
      if (child.motherId !== creature.id && child.fatherId !== creature.id) {
        return false;
      }
      if (!nearby.has(child.territoryId)) return false;
      const days = ageDays(child.birthTick, tick, snapshot.ruleset.ticksPerDay);
      return days < species.juvenileDays;
    })
    .sort((a, b) => a.id - b.id);
}

export function isEligible(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  goal: Goal,
): boolean {
  switch (goal) {
    case Goal.FIND_FOOD:
    case Goal.DRINK_WATER:
    case Goal.SEEK_SHELTER:
    case Goal.EXPLORE:
      return true;
    case Goal.SOCIALIZE:
      return othersInTerritory(snapshot, creature).length > 0;
    case Goal.FIND_MATE:
      return legalPartners(snapshot, creature, tick).length > 0;
    case Goal.PROTECT_OFFSPRING:
      return protectedOffspring(snapshot, creature, tick).length > 0;
    case Goal.IDLE:
      return false;
    default: {
      const never: never = goal;
      throw new Error(`goal ${String(never)}`);
    }
  }
}

function needTerm(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  goal: Goal,
): number {
  switch (goal) {
    case Goal.FIND_FOOD:
      return creature.hunger;
    case Goal.DRINK_WATER:
      return creature.thirst;
    case Goal.SEEK_SHELTER:
      return Math.max(creature.fatigue, creature.discomfort, creature.unsafety);
    case Goal.SOCIALIZE:
      return creature.loneliness;
    case Goal.EXPLORE:
      return clamp(
        500 -
          Math.max(
            creature.hunger,
            creature.thirst,
            creature.fatigue,
            creature.unsafety,
          ),
        0,
        500,
      );
    case Goal.FIND_MATE:
      return isEligible(snapshot, creature, tick, Goal.FIND_MATE) ? 700 : 0;
    case Goal.PROTECT_OFFSPRING:
      return isEligible(snapshot, creature, tick, Goal.PROTECT_OFFSPRING)
        ? clamp(700 + Math.floor(creature.unsafety / 5), 0, 1000)
        : 0;
    case Goal.IDLE:
      return 0;
    default: {
      const never: never = goal;
      throw new Error(`goal ${String(never)}`);
    }
  }
}

function personalityTerm(creature: CreatureRow, goal: Goal): number {
  switch (goal) {
    case Goal.FIND_FOOD:
      return clamp(400 + Math.floor(creature.traitAggression / 5), 0, 1000);
    case Goal.DRINK_WATER:
      return 400;
    case Goal.SEEK_SHELTER:
      return divRound(
        1000 - creature.traitBravery + (1000 - creature.traitRiskTaking),
        2,
      );
    case Goal.SOCIALIZE:
      return creature.traitSociability;
    case Goal.EXPLORE:
      return divRound(
        creature.traitCuriosity * 2 +
          creature.traitRiskTaking +
          creature.traitBravery,
        4,
      );
    case Goal.FIND_MATE:
      return divRound(creature.traitSociability + creature.traitLoyalty, 2);
    case Goal.PROTECT_OFFSPRING:
      return divRound(
        creature.traitLoyalty * 2 +
          creature.traitBravery +
          creature.traitAggression,
        4,
      );
    case Goal.IDLE:
      return 0;
    default: {
      const never: never = goal;
      throw new Error(`goal ${String(never)}`);
    }
  }
}

function relationshipTerm(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  goal: Goal,
  rules: Ruleset,
): number {
  const others = othersInTerritory(snapshot, creature);
  switch (goal) {
    case Goal.FIND_FOOD: {
      let anyConflict = false;
      let anyCoop = false;
      for (const other of others) {
        const conflict = pairField(
          snapshot.relationships,
          creature.id,
          other.id,
          "conflict",
        );
        const cooperation = pairField(
          snapshot.relationships,
          creature.id,
          other.id,
          "cooperation",
        );
        if (conflict >= 500) anyConflict = true;
        if (cooperation >= rules.coopRelationshipMin) anyCoop = true;
      }
      if (anyConflict) return 700;
      if (anyCoop) return 200;
      return 400;
    }
    case Goal.DRINK_WATER:
      return 400;
    case Goal.SEEK_SHELTER: {
      let maxConflict = 0;
      for (const other of others) {
        maxConflict = Math.max(
          maxConflict,
          pairField(snapshot.relationships, creature.id, other.id, "conflict"),
        );
      }
      return maxConflict;
    }
    case Goal.SOCIALIZE: {
      let best = 0;
      for (const other of others) {
        const score = pairField(
          snapshot.relationships,
          creature.id,
          other.id,
          "score",
        );
        best = Math.max(best, Math.floor(clamp(score + 1000, 0, 2000) / 2));
      }
      return best;
    }
    case Goal.EXPLORE: {
      let maxAvoidance = 0;
      for (const other of others) {
        maxAvoidance = Math.max(
          maxAvoidance,
          pairField(snapshot.relationships, creature.id, other.id, "avoidance"),
        );
      }
      return maxAvoidance;
    }
    case Goal.FIND_MATE: {
      let maxRomance = 0;
      for (const partner of legalPartners(snapshot, creature, tick)) {
        maxRomance = Math.max(
          maxRomance,
          pairField(snapshot.relationships, creature.id, partner.id, "romance"),
        );
      }
      return maxRomance;
    }
    case Goal.PROTECT_OFFSPRING:
      return isEligible(snapshot, creature, tick, Goal.PROTECT_OFFSPRING)
        ? 1000
        : 0;
    case Goal.IDLE:
      return 0;
    default: {
      const never: never = goal;
      throw new Error(`goal ${String(never)}`);
    }
  }
}

function memoryTerm(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  goal: Goal,
): number {
  const partners = legalPartners(snapshot, creature, tick);
  const legalPartnerIds = new Set(partners.map((partner) => partner.id));
  return memoryTermForGoal(snapshot, creature, tick, goal, legalPartnerIds);
}

export function scoreGoal(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  goal: Goal,
): GoalTerms {
  const rules = snapshot.ruleset;
  const need = assertInteger(needTerm(snapshot, creature, tick, goal), "need");
  const personality = assertInteger(
    personalityTerm(creature, goal),
    "personality",
  );
  const relationship = assertInteger(
    relationshipTerm(snapshot, creature, tick, goal, rules),
    "relationship",
  );
  const memory = assertInteger(
    memoryTerm(snapshot, creature, tick, goal),
    "memory",
  );
  const score = assertInteger(
    divRound(
      rules.weightNeed * need +
        rules.weightPersonality * personality +
        rules.weightRelationship * relationship +
        rules.weightMemory * memory,
      100,
    ),
    "goalScore",
  );
  return { goal, need, personality, relationship, memory, score };
}

/**
 * Higher score wins. Ties break by higher Need, then higher Personality,
 * then lower goal ordinal. Creature id is already fixed by the caller order.
 */
export function betterTerms(a: GoalTerms, b: GoalTerms): boolean {
  if (a.score !== b.score) return a.score > b.score;
  if (a.need !== b.need) return a.need > b.need;
  if (a.personality !== b.personality) return a.personality > b.personality;
  return goalOrdinal(a.goal) < goalOrdinal(b.goal);
}

/** Eligible goals only. `IDLE` is never scored. */
export function scoreEligibleGoals(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
): GoalTerms[] {
  const terms: GoalTerms[] = [];
  for (const goal of SCORED_GOALS) {
    if (!isEligible(snapshot, creature, tick, goal)) continue;
    terms.push(scoreGoal(snapshot, creature, tick, goal));
  }
  return terms;
}

/**
 * Argmax over eligible goals. When none are eligible, returns `SEEK_SHELTER`
 * so the action table can start a short rest.
 */
export function chooseGoal(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
): Goal {
  const terms = scoreEligibleGoals(snapshot, creature, tick);
  if (terms.length === 0) return Goal.SEEK_SHELTER;
  let best = terms[0]!;
  for (let i = 1; i < terms.length; i += 1) {
    const next = terms[i]!;
    if (betterTerms(next, best)) best = next;
  }
  return best.goal;
}

/**
 * True while a newborn must nurse without scoring.
 * Founders have no parents and never enter this path.
 */
export function shouldNurse(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
): boolean {
  if (creature.motherId == null && creature.fatherId == null) return false;
  return (
    ageDays(creature.birthTick, tick, snapshot.ruleset.ticksPerDay) <
    snapshot.ruleset.nurseDays
  );
}

/** Best social target: highest pair score, then friendship, then lowest id. */
export function bestSocialTarget(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
): CreatureRow | null {
  const others = othersInTerritory(snapshot, creature);
  if (others.length === 0) return null;
  let best = others[0]!;
  let bestScore = pairField(
    snapshot.relationships,
    creature.id,
    best.id,
    "score",
  );
  let bestFriendship = pairField(
    snapshot.relationships,
    creature.id,
    best.id,
    "friendship",
  );
  for (let i = 1; i < others.length; i += 1) {
    const other = others[i]!;
    const score = pairField(
      snapshot.relationships,
      creature.id,
      other.id,
      "score",
    );
    const friendship = pairField(
      snapshot.relationships,
      creature.id,
      other.id,
      "friendship",
    );
    if (
      score > bestScore ||
      (score === bestScore && friendship > bestFriendship) ||
      (score === bestScore &&
        friendship === bestFriendship &&
        other.id < best.id)
    ) {
      best = other;
      bestScore = score;
      bestFriendship = friendship;
    }
  }
  return best;
}

/** Best mate: highest romance, then score, then lowest id. */
export function bestMateTarget(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
): CreatureRow | null {
  const partners = legalPartners(snapshot, creature, tick);
  if (partners.length === 0) return null;
  let best = partners[0]!;
  let bestRomance = pairField(
    snapshot.relationships,
    creature.id,
    best.id,
    "romance",
  );
  let bestScore = pairField(
    snapshot.relationships,
    creature.id,
    best.id,
    "score",
  );
  for (let i = 1; i < partners.length; i += 1) {
    const other = partners[i]!;
    const romance = pairField(
      snapshot.relationships,
      creature.id,
      other.id,
      "romance",
    );
    const score = pairField(
      snapshot.relationships,
      creature.id,
      other.id,
      "score",
    );
    if (
      romance > bestRomance ||
      (romance === bestRomance && score > bestScore) ||
      (romance === bestRomance && score === bestScore && other.id < best.id)
    ) {
      best = other;
      bestRomance = romance;
      bestScore = score;
    }
  }
  return best;
}

/** Contest target: highest aggression among foragers, then lowest id. */
export function contestTarget(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
): CreatureRow | null {
  const foraging = othersInTerritory(snapshot, creature).filter(
    (other) =>
      other.currentAction === Action.FORAGE ||
      other.currentAction === Action.CONTEST ||
      other.currentAction === Action.COOPERATE_FORAGE,
  );
  if (foraging.length === 0) return null;
  let best = foraging[0]!;
  for (let i = 1; i < foraging.length; i += 1) {
    const other = foraging[i]!;
    if (
      other.traitAggression > best.traitAggression ||
      (other.traitAggression === best.traitAggression && other.id < best.id)
    ) {
      best = other;
    }
  }
  return best;
}

/** Coop partner: highest cooperation among eligible, then lowest id. Actor id must be lower. */
export function cooperateTarget(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  rules: Ruleset,
): CreatureRow | null {
  let best: CreatureRow | null = null;
  let bestCoop = -1;
  for (const other of othersInTerritory(snapshot, creature)) {
    if (creature.id >= other.id) continue;
    const cooperation = pairField(
      snapshot.relationships,
      creature.id,
      other.id,
      "cooperation",
    );
    if (cooperation < rules.coopRelationshipMin) continue;
    if (
      best == null ||
      cooperation > bestCoop ||
      (cooperation === bestCoop && other.id < best.id)
    ) {
      best = other;
      bestCoop = cooperation;
    }
  }
  return best;
}
