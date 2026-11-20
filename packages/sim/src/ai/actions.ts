import {
  Action,
  ActionTargetKind,
  CreatureStatus,
  DeathCause,
  EventTemplate,
  Gender,
  Goal,
  MemoryKind,
  MemoryTag,
  MigrationReason,
} from "@boing-pets/contract";
import { discoveryEvent, matingEvent, migrationEvent } from "../history/events";
import { ageDays, die } from "../kernel/death";
import type { TerritoryTick } from "../kernel/needs";
import { settleScore } from "../kernel/territories";
import { clamp, divRound } from "../math";
import { initialMemoryStrength } from "../memories/strength";
import { isMemoryThrottled } from "../memories/throttle";
import {
  applyContestDelta,
  applyCooperateForageDelta,
  applyCourtAcceptDelta,
  applyCourtRejectDelta,
  applyGiftDelta,
  applyGuardOffspringDelta,
  applyRescueDelta,
  applySnubDelta,
  applySocializeDelta,
  ensureRelationship,
  findRelationship,
} from "../relationships/delta";
import { rngInt } from "../rng";
import { planMove } from "./movement";
import type {
  CompatibilityRow,
  CreatureRow,
  SpeciesRow,
  WorldEvent,
  WorldSnapshot,
} from "../types";
import {
  bestMateTarget,
  bestSocialTarget,
  chooseGoal,
  contestTarget,
  cooperateTarget,
  protectedOffspring,
  shouldNurse,
} from "./utility";

/** Speed 500 is 1× the link. Speed 0 is 2×. Speed 1000 is shorter. */
export function travelDuration(travelTicks: number, geneSpeed: number): number {
  if (travelTicks <= 0) throw new Error("travelTicks");
  return Math.max(1, divRound(travelTicks * 1000, 500 + geneSpeed));
}

/**
 * Neighbor with the lowest effective danger.
 * Ties break toward the higher settle score, then the lower territory id.
 */
export function fleeDestination(
  snapshot: WorldSnapshot,
  originId: number,
  territories: ReadonlyMap<number, TerritoryTick>,
): { territoryId: number; travelTicks: number } | null {
  const candidates = snapshot.links
    .filter((link) => link.fromId === originId)
    .map((link) => {
      const stats = territories.get(link.toId);
      if (!stats) throw new Error("territory");
      return {
        territoryId: link.toId,
        travelTicks: link.travelTicks,
        danger: stats.danger,
        settle: settleScore(stats),
      };
    });
  candidates.sort((a, b) => {
    if (a.danger !== b.danger) return a.danger - b.danger;
    if (a.settle !== b.settle) return b.settle - a.settle;
    return a.territoryId - b.territoryId;
  });
  const best = candidates[0];
  if (!best) return null;
  return { territoryId: best.territoryId, travelTicks: best.travelTicks };
}

function migrationReason(goal: Goal): MigrationReason {
  switch (goal) {
    case Goal.SEEK_SHELTER:
      return MigrationReason.FLEE;
    case Goal.EXPLORE:
      return MigrationReason.SETTLE;
    case Goal.PROTECT_OFFSPRING:
      return MigrationReason.PROTECT;
    default:
      throw new Error("relocate goal");
  }
}

/** Start travel toward a linked territory. Duration is at least one tick. */
export function beginRelocate(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  destinationId: number,
  goal: Goal,
): number {
  migrationReason(goal);
  const link = snapshot.links.find(
    (row) => row.fromId === creature.territoryId && row.toId === destinationId,
  );
  if (!link) throw new Error("territory link");
  const duration = travelDuration(link.travelTicks, creature.geneSpeed);
  creature.currentGoal = goal;
  creature.currentAction = Action.RELOCATE;
  creature.actionTargetKind = ActionTargetKind.TERRITORY;
  creature.actionTargetId = destinationId;
  creature.actionStartedTick = tick;
  creature.actionEndsTick = tick + duration;
  planMove(snapshot, creature, tick);
  return duration;
}

/** Flee to the safest neighbor. Returns null when the territory has no exit. */
export function beginFlee(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  territories: ReadonlyMap<number, TerritoryTick>,
): number | null {
  const destination = fleeDestination(
    snapshot,
    creature.territoryId,
    territories,
  );
  if (!destination) return null;
  return beginRelocate(
    snapshot,
    creature,
    tick,
    destination.territoryId,
    Goal.SEEK_SHELTER,
  );
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

function knowsTerritory(
  snapshot: WorldSnapshot,
  lineageId: number,
  territoryId: number,
): boolean {
  return snapshot.discoveries.some(
    (row) => row.lineageId === lineageId && row.territoryId === territoryId,
  );
}

const DISCOVERY_IMPORTANCE = 10;
const DISCOVERY_EMOTION = 300;
const MIGRATION_IMPORTANCE = 4;
const MIGRATION_EMOTION = 50;

function rememberDiscovery(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  territoryId: number,
): void {
  if (
    isMemoryThrottled(snapshot, {
      creatureId: creature.id,
      kind: MemoryKind.DISCOVERY,
      tick,
      territoryId,
    })
  ) {
    return;
  }
  snapshot.memories.push({
    id: take(snapshot, "nextMemoryId"),
    worldId: snapshot.world.id,
    creatureId: creature.id,
    tick,
    kind: MemoryKind.DISCOVERY,
    importance: DISCOVERY_IMPORTANCE,
    emotionalValue: DISCOVERY_EMOTION,
    initialStrength: initialMemoryStrength(
      DISCOVERY_IMPORTANCE,
      snapshot.ruleset,
    ),
    subjectCreatureId: null,
    territoryId,
    payload: {
      tags: [MemoryTag.DISCOVERY],
      template: EventTemplate.DISCOVERY,
    },
    archived: false,
  });
}

/** Importance 4, emotional +50. Throttled to one per owner per 144 ticks. */
function rememberMigration(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  territoryId: number,
): void {
  if (
    isMemoryThrottled(snapshot, {
      creatureId: creature.id,
      kind: MemoryKind.MIGRATION,
      tick,
      territoryId,
    })
  ) {
    return;
  }
  snapshot.memories.push({
    id: take(snapshot, "nextMemoryId"),
    worldId: snapshot.world.id,
    creatureId: creature.id,
    tick,
    kind: MemoryKind.MIGRATION,
    importance: MIGRATION_IMPORTANCE,
    emotionalValue: MIGRATION_EMOTION,
    initialStrength: initialMemoryStrength(
      MIGRATION_IMPORTANCE,
      snapshot.ruleset,
    ),
    subjectCreatureId: null,
    territoryId,
    payload: {
      tags: [MemoryTag.MIGRATION],
      template: EventTemplate.MIGRATION,
    },
    archived: false,
  });
}

/**
 * Arrive, write MIGRATION (event + memory), and write DISCOVERY the first time
 * this lineage enters the destination. Death before this call writes neither.
 */
export function resolveRelocate(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
): WorldEvent[] {
  const reason = migrationReason(creature.currentGoal);
  const destinationId = creature.actionTargetId;
  if (
    creature.actionTargetKind !== ActionTargetKind.TERRITORY ||
    destinationId == null
  ) {
    throw new Error("relocate target");
  }
  const origin = snapshot.territories.find(
    (row) => row.id === creature.territoryId,
  );
  const destination = snapshot.territories.find(
    (row) => row.id === destinationId,
  );
  const lineage = snapshot.lineages.find(
    (row) => row.id === creature.lineageId,
  );
  if (!origin || !destination || !lineage) throw new Error("relocate");

  const fromTerritoryId = creature.territoryId;
  creature.territoryId = destinationId;
  clearAction(creature);

  const events: WorldEvent[] = [
    migrationEvent({
      id: take(snapshot, "nextEventId"),
      worldId: snapshot.world.id,
      tick,
      creatureId: creature.id,
      lineageId: creature.lineageId,
      fromTerritoryId,
      toTerritoryId: destinationId,
      name: creature.name,
      fromTerritory: origin.name,
      toTerritory: destination.name,
      reason,
    }),
  ];
  rememberMigration(snapshot, creature, tick, destinationId);

  if (!knowsTerritory(snapshot, creature.lineageId, destinationId)) {
    snapshot.discoveries.push({
      lineageId: creature.lineageId,
      territoryId: destinationId,
    });
    events.push(
      discoveryEvent({
        id: take(snapshot, "nextEventId"),
        worldId: snapshot.world.id,
        tick,
        creatureId: creature.id,
        lineageId: creature.lineageId,
        territoryId: destinationId,
        name: creature.name,
        lineageName: lineage.name,
        territoryName: destination.name,
      }),
    );
    rememberDiscovery(snapshot, creature, tick, destinationId);
  }
  return events;
}

function startAction(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  goal: Goal,
  action: Action,
  duration: number,
  targetKind: ActionTargetKind = ActionTargetKind.NONE,
  targetId: number | null = null,
): void {
  if (duration < 1) throw new Error("duration");
  creature.currentGoal = goal;
  creature.currentAction = action;
  creature.actionTargetKind = targetKind;
  creature.actionTargetId = targetId;
  creature.actionStartedTick = tick;
  creature.actionEndsTick = tick + duration;
  planMove(snapshot, creature, tick);
}

function forageDuration(geneSpeed: number, forageBaseDuration: number): number {
  return Math.max(2, divRound(forageBaseDuration * 1000, 500 + geneSpeed));
}

function restDuration(
  fatigue: number,
  rules: { restDurationMin: number; restDurationMax: number },
): number {
  return clamp(
    8 + Math.floor(fatigue / 50),
    rules.restDurationMin,
    rules.restDurationMax,
  );
}

/**
 * Neighbor for explore: undiscovered with the highest settle, else a neighbor
 * that beats the current settle by settleMargin.
 */
export function exploreDestination(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  territories: ReadonlyMap<number, TerritoryTick>,
): { territoryId: number; travelTicks: number } | null {
  const current = territories.get(creature.territoryId);
  if (!current) throw new Error("territory");
  const currentSettle = settleScore(current);
  const neighbors = snapshot.links
    .filter((link) => link.fromId === creature.territoryId)
    .map((link) => {
      const stats = territories.get(link.toId);
      if (!stats) throw new Error("territory");
      return {
        territoryId: link.toId,
        travelTicks: link.travelTicks,
        settle: settleScore(stats),
        discovered: knowsTerritory(snapshot, creature.lineageId, link.toId),
      };
    });
  const undiscovered = neighbors
    .filter((row) => !row.discovered)
    .sort((a, b) => {
      if (a.settle !== b.settle) return b.settle - a.settle;
      return a.territoryId - b.territoryId;
    });
  if (undiscovered[0]) {
    return {
      territoryId: undiscovered[0].territoryId,
      travelTicks: undiscovered[0].travelTicks,
    };
  }
  const better = neighbors
    .filter((row) => row.settle > currentSettle + snapshot.ruleset.settleMargin)
    .sort((a, b) => {
      if (a.settle !== b.settle) return b.settle - a.settle;
      return a.territoryId - b.territoryId;
    });
  if (better[0]) {
    return {
      territoryId: better[0].territoryId,
      travelTicks: better[0].travelTicks,
    };
  }
  return null;
}

/** Adjacent territory with the youngest protected offspring. Tie: lowest id. */
export function protectDestination(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
): { territoryId: number; travelTicks: number } | null {
  const offspring = protectedOffspring(snapshot, creature, tick).filter(
    (child) => child.territoryId !== creature.territoryId,
  );
  if (offspring.length === 0) return null;
  let youngest = offspring[0]!;
  for (let i = 1; i < offspring.length; i += 1) {
    const child = offspring[i]!;
    if (
      child.birthTick > youngest.birthTick ||
      (child.birthTick === youngest.birthTick &&
        child.territoryId < youngest.territoryId)
    ) {
      youngest = child;
    }
  }
  const link = snapshot.links.find(
    (row) =>
      row.fromId === creature.territoryId && row.toId === youngest.territoryId,
  );
  if (!link) return null;
  return { territoryId: youngest.territoryId, travelTicks: link.travelTicks };
}

function contestGateOpen(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  food: number,
  target: CreatureRow,
): boolean {
  const rules = snapshot.ruleset;
  if (creature.hunger <= 600) return false;
  if (food >= rules.contestFoodBelow) return false;
  if (creature.traitAggression < rules.contestAggressionMin) return false;
  if (
    creature.id > target.id &&
    target.currentAction === Action.CONTEST &&
    target.actionTargetKind === ActionTargetKind.CREATURE &&
    target.actionTargetId === creature.id
  ) {
    return false;
  }
  return true;
}

/**
 * Flat goal → action table. Picks the first matching gate and starts the action.
 * Resolution runs when the slot ends; the new action never resolves on this tick.
 */
export function startActionForGoal(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  goal: Goal,
  territories: ReadonlyMap<number, TerritoryTick>,
): void {
  const rules = snapshot.ruleset;
  const territory = territories.get(creature.territoryId);
  if (!territory) throw new Error("territory");

  switch (goal) {
    case Goal.FIND_FOOD: {
      const rival = contestTarget(snapshot, creature);
      if (rival && contestGateOpen(snapshot, creature, territory.food, rival)) {
        startAction(
          snapshot,
          creature,
          tick,
          goal,
          Action.CONTEST,
          rules.contestDuration,
          ActionTargetKind.CREATURE,
          rival.id,
        );
        return;
      }
      const partner = cooperateTarget(snapshot, creature, rules);
      if (partner && territory.food >= rules.coopFoodAtLeast) {
        startAction(
          snapshot,
          creature,
          tick,
          goal,
          Action.COOPERATE_FORAGE,
          rules.coopDuration,
          ActionTargetKind.CREATURE,
          partner.id,
        );
        return;
      }
      startAction(
        snapshot,
        creature,
        tick,
        goal,
        Action.FORAGE,
        forageDuration(creature.geneSpeed, rules.forageBaseDuration),
      );
      return;
    }
    case Goal.DRINK_WATER:
      startAction(
        snapshot,
        creature,
        tick,
        goal,
        Action.DRINK,
        rules.drinkDuration,
      );
      return;
    case Goal.SEEK_SHELTER: {
      const flee =
        (creature.unsafety > rules.fleeUnsafety ||
          territory.danger > rules.fleeDanger) &&
        fleeDestination(snapshot, creature.territoryId, territories);
      if (flee) {
        beginRelocate(snapshot, creature, tick, flee.territoryId, goal);
        return;
      }
      startAction(
        snapshot,
        creature,
        tick,
        goal,
        Action.REST,
        restDuration(creature.fatigue, rules),
      );
      return;
    }
    case Goal.SOCIALIZE: {
      const target = bestSocialTarget(snapshot, creature);
      if (!target) {
        startAction(
          snapshot,
          creature,
          tick,
          Goal.SEEK_SHELTER,
          Action.REST,
          rules.restDurationMin,
        );
        return;
      }
      startAction(
        snapshot,
        creature,
        tick,
        goal,
        Action.APPROACH,
        rules.approachDuration,
        ActionTargetKind.CREATURE,
        target.id,
      );
      return;
    }
    case Goal.EXPLORE: {
      const destination = exploreDestination(snapshot, creature, territories);
      if (destination) {
        beginRelocate(snapshot, creature, tick, destination.territoryId, goal);
        return;
      }
      startAction(
        snapshot,
        creature,
        tick,
        goal,
        Action.WANDER,
        rules.wanderDuration,
      );
      return;
    }
    case Goal.FIND_MATE: {
      const partner = bestMateTarget(snapshot, creature, tick);
      if (!partner) {
        startAction(
          snapshot,
          creature,
          tick,
          Goal.SEEK_SHELTER,
          Action.REST,
          rules.restDurationMin,
        );
        return;
      }
      startAction(
        snapshot,
        creature,
        tick,
        goal,
        Action.COURT,
        rules.courtDuration,
        ActionTargetKind.CREATURE,
        partner.id,
      );
      return;
    }
    case Goal.PROTECT_OFFSPRING: {
      const here = protectedOffspring(snapshot, creature, tick).filter(
        (child) => child.territoryId === creature.territoryId,
      );
      if (here.length === 0) {
        const destination = protectDestination(snapshot, creature, tick);
        if (destination) {
          beginRelocate(
            snapshot,
            creature,
            tick,
            destination.territoryId,
            goal,
          );
          return;
        }
        startAction(
          snapshot,
          creature,
          tick,
          Goal.SEEK_SHELTER,
          Action.REST,
          rules.restDurationMin,
        );
        return;
      }
      let youngest = here[0]!;
      for (let i = 1; i < here.length; i += 1) {
        const child = here[i]!;
        if (
          child.birthTick > youngest.birthTick ||
          (child.birthTick === youngest.birthTick && child.id < youngest.id)
        ) {
          youngest = child;
        }
      }
      startAction(
        snapshot,
        creature,
        tick,
        goal,
        Action.GUARD,
        rules.guardDuration,
        ActionTargetKind.CREATURE,
        youngest.id,
      );
      return;
    }
    case Goal.IDLE:
      startAction(
        snapshot,
        creature,
        tick,
        Goal.SEEK_SHELTER,
        Action.REST,
        rules.restDurationMin,
      );
      return;
    default: {
      const never: never = goal;
      throw new Error(`goal ${String(never)}`);
    }
  }
}

/**
 * Empty action slot: nurse without scoring while young, otherwise score and
 * start the matching action. Does not resolve on this tick.
 */
export function chooseAndStartAction(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  territories: ReadonlyMap<number, TerritoryTick>,
): void {
  if (shouldNurse(snapshot, creature, tick)) {
    startAction(snapshot, creature, tick, Goal.IDLE, Action.NURSE, 1);
    return;
  }
  const goal = chooseGoal(snapshot, creature, tick);
  startActionForGoal(snapshot, creature, tick, goal, territories);
}

const CONFLICT_IMPORTANCE = 8;
const CONFLICT_EMOTION = -400;
const CONVERSATION_IMPORTANCE = 1;
const CONVERSATION_EMOTION = 200;
const COOPERATION_IMPORTANCE = 6;
const COOPERATION_EMOTION = 250;

function rememberFor(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  kind: MemoryKind,
  importance: number,
  emotionalValue: number,
  subjectCreatureId: number | null,
  territoryId: number | null,
  tags: MemoryTag[],
  template: string,
): void {
  if (
    isMemoryThrottled(snapshot, {
      creatureId: creature.id,
      kind,
      tick,
      subjectCreatureId,
      territoryId,
      tags,
    })
  ) {
    return;
  }
  snapshot.memories.push({
    id: take(snapshot, "nextMemoryId"),
    worldId: snapshot.world.id,
    creatureId: creature.id,
    tick,
    kind,
    importance,
    emotionalValue,
    initialStrength: initialMemoryStrength(importance, snapshot.ruleset),
    subjectCreatureId,
    territoryId,
    payload: { tags, template },
    archived: false,
  });
}

function contestPower(creature: CreatureRow): number {
  return creature.geneStrength * 2 + creature.traitAggression;
}

/**
 * Higher power wins. Tie: lower creature id. Both get conflict deltas and a
 * CONFLICT memory. A loser at 0 health dies of INJURY.
 */
export function resolveContest(
  snapshot: WorldSnapshot,
  actor: CreatureRow,
  tick: number,
): WorldEvent[] {
  const rules = snapshot.ruleset;
  const targetId = actor.actionTargetId;
  if (
    actor.actionTargetKind !== ActionTargetKind.CREATURE ||
    targetId == null
  ) {
    throw new Error("contest target");
  }
  const target = snapshot.creatures.find((row) => row.id === targetId);
  clearAction(actor);
  if (!target || target.status !== CreatureStatus.ALIVE) return [];

  const actorPower = contestPower(actor);
  const targetPower = contestPower(target);
  const actorWins =
    actorPower > targetPower ||
    (actorPower === targetPower && actor.id < target.id);
  const winner = actorWins ? actor : target;
  const loser = actorWins ? target : actor;

  winner.hunger = clamp(winner.hunger - rules.contestHungerWin, 0, 1000);
  loser.hunger = clamp(loser.hunger - rules.contestHungerLose, 0, 1000);
  loser.health = clamp(loser.health - rules.contestHealthLose, 0, 1000);
  loser.unsafety = clamp(loser.unsafety + 200, 0, 1000);

  const pair = ensureRelationship(snapshot, actor.id, target.id, tick);
  applyContestDelta(pair, tick);

  const territory = snapshot.territories.find(
    (row) => row.id === actor.territoryId,
  );
  if (!territory) throw new Error("territory");
  for (const creature of [actor, target]) {
    const other = creature.id === actor.id ? target : actor;
    rememberFor(
      snapshot,
      creature,
      tick,
      MemoryKind.CONFLICT,
      CONFLICT_IMPORTANCE,
      CONFLICT_EMOTION,
      other.id,
      actor.territoryId,
      [MemoryTag.INJURY, MemoryTag.FEAR_TERRITORY],
      "conflict.v1",
    );
  }

  const events: WorldEvent[] = [];
  if (loser.health <= 0 && loser.status === CreatureStatus.ALIVE) {
    events.push(die(snapshot, loser, tick, DeathCause.INJURY, territory.name));
  }
  return events;
}

/**
 * First approach creates the pair. Snub or socialize deltas follow. Missing
 * or dead targets end with no deltas.
 */
export function resolveApproach(
  snapshot: WorldSnapshot,
  actor: CreatureRow,
  tick: number,
): void {
  const rules = snapshot.ruleset;
  const targetId = actor.actionTargetId;
  if (
    actor.actionTargetKind !== ActionTargetKind.CREATURE ||
    targetId == null
  ) {
    throw new Error("approach target");
  }
  const target = snapshot.creatures.find((row) => row.id === targetId);
  clearAction(actor);
  if (
    !target ||
    target.status !== CreatureStatus.ALIVE ||
    target.territoryId !== actor.territoryId
  ) {
    return;
  }

  const pair = ensureRelationship(snapshot, actor.id, target.id, tick);
  if (
    target.traitSociability < rules.snubSociabilityMax &&
    actor.traitAggression >= rules.snubAggressionMin
  ) {
    applySnubDelta(pair, tick, rules);
    return;
  }

  applySocializeDelta(pair, actor.traitSociability, tick, rules);
  actor.loneliness = clamp(
    actor.loneliness - rules.socializeLonelinessActor,
    0,
    1000,
  );
  target.loneliness = clamp(
    target.loneliness - rules.socializeLonelinessTarget,
    0,
    1000,
  );
  for (const creature of [actor, target]) {
    const other = creature.id === actor.id ? target : actor;
    rememberFor(
      snapshot,
      creature,
      tick,
      MemoryKind.CONVERSATION,
      CONVERSATION_IMPORTANCE,
      CONVERSATION_EMOTION,
      other.id,
      null,
      [],
      "conversation.v1",
    );
  }
}

/** Lower-id actor owns the action; both creatures share the hunger relief. */
export function resolveCooperateForage(
  snapshot: WorldSnapshot,
  actor: CreatureRow,
  tick: number,
): void {
  const rules = snapshot.ruleset;
  const targetId = actor.actionTargetId;
  if (
    actor.actionTargetKind !== ActionTargetKind.CREATURE ||
    targetId == null
  ) {
    throw new Error("cooperate target");
  }
  const target = snapshot.creatures.find((row) => row.id === targetId);
  clearAction(actor);
  if (
    !target ||
    target.status !== CreatureStatus.ALIVE ||
    target.territoryId !== actor.territoryId
  ) {
    return;
  }

  actor.hunger = clamp(actor.hunger - rules.coopHungerRelief, 0, 1000);
  target.hunger = clamp(target.hunger - rules.coopHungerRelief, 0, 1000);
  const pair = ensureRelationship(snapshot, actor.id, target.id, tick);
  applyCooperateForageDelta(pair, tick);
  for (const creature of [actor, target]) {
    const other = creature.id === actor.id ? target : actor;
    rememberFor(
      snapshot,
      creature,
      tick,
      MemoryKind.COOPERATION,
      COOPERATION_IMPORTANCE,
      COOPERATION_EMOTION,
      other.id,
      null,
      [],
      "cooperation.v1",
    );
  }
}

const FOOD_INSECURITY_IMPORTANCE = 8;
const FOOD_INSECURITY_EMOTION = -500;
const GIFT_IMPORTANCE = 5;
const GIFT_EMOTION = 350;

/**
 * Effective-food forage roll. Success and failure both relieve some hunger.
 * Failure may mint a food_insecurity THREAT memory. Gift runs on success when
 * the pre-relief hunger gate and pair friendship allow it.
 */
export function resolveForage(
  snapshot: WorldSnapshot,
  actor: CreatureRow,
  tick: number,
  territories: ReadonlyMap<number, TerritoryTick>,
): void {
  const rules = snapshot.ruleset;
  const territory = territories.get(actor.territoryId);
  if (!territory) throw new Error("territory");

  const hungerBefore = actor.hunger;
  const chancePerMille = clamp(
    territory.food -
      territory.population * rules.foragePopPressure +
      Math.floor(actor.geneIntelligence / 5),
    rules.forageChanceMin,
    rules.forageChanceMax,
  );
  const roll = rngInt(snapshot.world.seed, tick, "forage", actor.id, 0, 0, 999);
  const success = roll < chancePerMille;
  actor.hunger = clamp(
    actor.hunger -
      (success ? rules.forageHungerSuccess : rules.forageHungerFail),
    0,
    1000,
  );
  clearAction(actor);

  if (!success) {
    rememberFor(
      snapshot,
      actor,
      tick,
      MemoryKind.THREAT,
      FOOD_INSECURITY_IMPORTANCE,
      FOOD_INSECURITY_EMOTION,
      null,
      null,
      [MemoryTag.FOOD_INSECURITY],
      "threat.food.v1",
    );
    return;
  }

  maybeGiftAfterForage(snapshot, actor, tick, hungerBefore);
}

function pairHasRecentGift(
  snapshot: WorldSnapshot,
  actorId: number,
  recipientId: number,
  tick: number,
): boolean {
  const window = snapshot.ruleset.memoryThrottleTicks;
  for (const memory of snapshot.memories) {
    if (memory.kind !== MemoryKind.GIFT) continue;
    if (tick - memory.tick > window) continue;
    const a = memory.creatureId;
    const b = memory.subjectCreatureId;
    if (
      (a === actorId && b === recipientId) ||
      (a === recipientId && b === actorId)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Gift uses hunger from before forage relief. Actor id must be lower than the
 * recipient. Recipient is the hungriest co-located friend who passes the gates.
 */
function maybeGiftAfterForage(
  snapshot: WorldSnapshot,
  actor: CreatureRow,
  tick: number,
  hungerBefore: number,
): void {
  const rules = snapshot.ruleset;
  if (hungerBefore >= rules.giftActorHungerMax) return;

  let recipient: CreatureRow | null = null;
  for (const other of snapshot.creatures) {
    if (other.status !== CreatureStatus.ALIVE) continue;
    if (other.id <= actor.id) continue;
    if (other.territoryId !== actor.territoryId) continue;
    if (other.hunger <= rules.giftTargetHungerMin) continue;
    const pair = findRelationship(snapshot.relationships, actor.id, other.id);
    if (!pair || pair.friendship < rules.giftFriendMin) continue;
    if (pairHasRecentGift(snapshot, actor.id, other.id, tick)) continue;
    if (
      !recipient ||
      other.hunger > recipient.hunger ||
      (other.hunger === recipient.hunger && other.id < recipient.id)
    ) {
      recipient = other;
    }
  }
  if (!recipient) return;

  actor.hunger = clamp(actor.hunger + rules.giftHungerActor, 0, 1000);
  recipient.hunger = clamp(recipient.hunger - rules.giftHungerTarget, 0, 1000);
  const pair = ensureRelationship(snapshot, actor.id, recipient.id, tick);
  applyGiftDelta(pair, tick);
  for (const creature of [actor, recipient]) {
    const other = creature.id === actor.id ? recipient : actor;
    rememberFor(
      snapshot,
      creature,
      tick,
      MemoryKind.GIFT,
      GIFT_IMPORTANCE,
      GIFT_EMOTION,
      other.id,
      null,
      [],
      "gift.v1",
    );
  }
}

/** Every territory has water. Relief is always applied. */
export function resolveDrink(
  snapshot: WorldSnapshot,
  actor: CreatureRow,
): void {
  const rules = snapshot.ruleset;
  actor.thirst = clamp(actor.thirst - rules.drinkThirstRelief, 0, 1000);
  clearAction(actor);
}

const MATE_IMPORTANCE = 15;
const MATE_EMOTION = 500;

function fertilityOf(
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

function speciesRow(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
): SpeciesRow {
  const species = snapshot.species.find((row) => row.id === creature.speciesId);
  if (!species) throw new Error("species");
  return species;
}

function isMatureAt(
  creature: CreatureRow,
  species: SpeciesRow,
  tick: number,
  ticksPerDay: number,
): boolean {
  return ageDays(creature.birthTick, tick, ticksPerDay) >= species.maturityDays;
}

function isGestatingAt(creature: CreatureRow, tick: number): boolean {
  return creature.gestationEndTick != null && tick < creature.gestationEndTick;
}

function cooldownClearAt(creature: CreatureRow, tick: number): boolean {
  return (
    creature.mateCooldownUntilTick == null ||
    tick >= creature.mateCooldownUntilTick
  );
}

/**
 * COURT accept gates are checked at resolution, not only at decision time.
 * Acceptance does not require the target to have selected FIND_MATE.
 */
export function courtAccepts(
  snapshot: WorldSnapshot,
  actor: CreatureRow,
  target: CreatureRow,
  tick: number,
): boolean {
  const rules = snapshot.ruleset;
  if (actor.status !== CreatureStatus.ALIVE) return false;
  if (target.status !== CreatureStatus.ALIVE) return false;
  if (actor.territoryId !== target.territoryId) return false;
  if (actor.gender === target.gender) return false;
  if (
    fertilityOf(snapshot.compatibility, actor.speciesId, target.speciesId) <= 0
  ) {
    return false;
  }
  const actorSpecies = speciesRow(snapshot, actor);
  const targetSpecies = speciesRow(snapshot, target);
  if (!isMatureAt(actor, actorSpecies, tick, rules.ticksPerDay)) return false;
  if (!isMatureAt(target, targetSpecies, tick, rules.ticksPerDay)) return false;
  if (
    actor.health < rules.mateHealthMin ||
    target.health < rules.mateHealthMin
  ) {
    return false;
  }
  if (
    actor.hunger >= rules.mateHungerMax ||
    target.hunger >= rules.mateHungerMax
  ) {
    return false;
  }
  if (
    actor.thirst >= rules.mateThirstMax ||
    target.thirst >= rules.mateThirstMax
  ) {
    return false;
  }
  if (isGestatingAt(actor, tick) || isGestatingAt(target, tick)) return false;
  if (!cooldownClearAt(actor, tick) || !cooldownClearAt(target, tick)) {
    return false;
  }
  const pair = findRelationship(snapshot.relationships, actor.id, target.id);
  const score = pair?.score ?? 0;
  const romance = pair?.romance ?? 0;
  const conflict = pair?.conflict ?? 0;
  if (score < rules.mateScoreMin) return false;
  if (romance < rules.mateRomanceMin) return false;
  if (conflict >= rules.mateConflictMax) return false;
  return true;
}

function applyMateCooldown(
  creature: CreatureRow,
  tick: number,
  cooldown: number,
): void {
  const until = tick + cooldown;
  creature.mateCooldownUntilTick =
    creature.mateCooldownUntilTick == null
      ? until
      : Math.max(creature.mateCooldownUntilTick, until);
}

/**
 * On accept: female gestates, both take a mate cooldown, mating deltas, two
 * MATE memories, one MATING event. On reject: small romance/avoidance bump.
 */
export function resolveCourt(
  snapshot: WorldSnapshot,
  actor: CreatureRow,
  tick: number,
): WorldEvent[] {
  const rules = snapshot.ruleset;
  const targetId = actor.actionTargetId;
  if (
    actor.actionTargetKind !== ActionTargetKind.CREATURE ||
    targetId == null
  ) {
    throw new Error("court target");
  }
  const target = snapshot.creatures.find((row) => row.id === targetId);
  clearAction(actor);
  if (!target) return [];

  const pair = ensureRelationship(snapshot, actor.id, target.id, tick);
  if (!courtAccepts(snapshot, actor, target, tick)) {
    applyCourtRejectDelta(pair, tick);
    return [];
  }

  const mother = actor.gender === Gender.FEMALE ? actor : target;
  const father = actor.gender === Gender.MALE ? actor : target;
  if (mother.gender !== Gender.FEMALE || father.gender !== Gender.MALE) {
    throw new Error("court genders");
  }

  const motherSpecies = speciesRow(snapshot, mother);
  mother.gestationSireId = father.id;
  mother.gestationEndTick =
    tick + motherSpecies.gestationDays * rules.ticksPerDay;
  applyMateCooldown(mother, tick, rules.postpartumCooldownTicks);
  applyMateCooldown(father, tick, rules.maleCooldownTicks);

  applyCourtAcceptDelta(pair, tick);

  for (const creature of [mother, father]) {
    const other = creature.id === mother.id ? father : mother;
    rememberFor(
      snapshot,
      creature,
      tick,
      MemoryKind.MATE,
      MATE_IMPORTANCE,
      MATE_EMOTION,
      other.id,
      null,
      [],
      "mate.v1",
    );
  }

  const territory = snapshot.territories.find(
    (row) => row.id === mother.territoryId,
  );
  if (!territory) throw new Error("territory");

  return [
    matingEvent({
      id: take(snapshot, "nextEventId"),
      worldId: snapshot.world.id,
      tick,
      motherId: mother.id,
      fatherId: father.id,
      lineageId: mother.lineageId,
      territoryId: mother.territoryId,
      motherName: mother.name,
      fatherName: father.name,
      territoryName: territory.name,
      relationshipScore: pair.score,
    }),
  ];
}

const RESCUE_IMPORTANCE = 25;
const RESCUE_EMOTION = 800;
const RESCUE_HEALTH_BELOW = 300;
const RESCUE_HEALTH_RELIEF = 40;
const RESCUE_UNSAFETY_RELIEF = 100;
const GUARD_OFFSPRING_UNSAFETY = 30;
const GUARD_RESCUE_FATIGUE = 20;
const GUARD_IDLE_FATIGUE = 2;

/**
 * Guard: every living offspring here loses unsafety and gains parent trust.
 * A co-located creature with health < 300 may be rescued (lowest health;
 * offspring wins ties, then lowest id).
 */
export function resolveGuard(
  snapshot: WorldSnapshot,
  actor: CreatureRow,
  tick: number,
): void {
  clearAction(actor);

  const offspringHere = protectedOffspring(snapshot, actor, tick).filter(
    (child) => child.territoryId === actor.territoryId,
  );
  for (const child of offspringHere) {
    child.unsafety = clamp(child.unsafety - GUARD_OFFSPRING_UNSAFETY, 0, 1000);
    const pair = ensureRelationship(snapshot, actor.id, child.id, tick);
    applyGuardOffspringDelta(pair, tick);
  }

  let rescue: CreatureRow | null = null;
  const offspringIds = new Set(offspringHere.map((child) => child.id));
  for (const other of snapshot.creatures) {
    if (other.status !== CreatureStatus.ALIVE) continue;
    if (other.id === actor.id) continue;
    if (other.territoryId !== actor.territoryId) continue;
    if (other.health >= RESCUE_HEALTH_BELOW) continue;
    if (!rescue) {
      rescue = other;
      continue;
    }
    if (other.health < rescue.health) {
      rescue = other;
      continue;
    }
    if (other.health > rescue.health) continue;
    const otherIsOffspring = offspringIds.has(other.id);
    const rescueIsOffspring = offspringIds.has(rescue.id);
    if (otherIsOffspring && !rescueIsOffspring) {
      rescue = other;
      continue;
    }
    if (otherIsOffspring === rescueIsOffspring && other.id < rescue.id) {
      rescue = other;
    }
  }

  if (rescue) {
    rescue.health = clamp(rescue.health + RESCUE_HEALTH_RELIEF, 0, 1000);
    rescue.unsafety = clamp(rescue.unsafety - RESCUE_UNSAFETY_RELIEF, 0, 1000);
    const pair = ensureRelationship(snapshot, actor.id, rescue.id, tick);
    applyRescueDelta(pair, tick);
    for (const creature of [actor, rescue]) {
      const other = creature.id === actor.id ? rescue : actor;
      rememberFor(
        snapshot,
        creature,
        tick,
        MemoryKind.RESCUE,
        RESCUE_IMPORTANCE,
        RESCUE_EMOTION,
        other.id,
        null,
        [],
        "rescue.v1",
      );
    }
    actor.fatigue = clamp(actor.fatigue + GUARD_RESCUE_FATIGUE, 0, 1000);
    return;
  }

  actor.fatigue = clamp(actor.fatigue + GUARD_IDLE_FATIGUE, 0, 1000);
}

/**
 * Resolve a finished non-relocate action. Contest, approach, cooperate, court,
 * forage, drink, and guard apply their effects. Other actions clear the slot.
 */
export function resolveFinishedAction(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  territories: ReadonlyMap<number, TerritoryTick>,
): WorldEvent[] {
  switch (creature.currentAction) {
    case Action.CONTEST:
      return resolveContest(snapshot, creature, tick);
    case Action.APPROACH:
      resolveApproach(snapshot, creature, tick);
      return [];
    case Action.COOPERATE_FORAGE:
      resolveCooperateForage(snapshot, creature, tick);
      return [];
    case Action.COURT:
      return resolveCourt(snapshot, creature, tick);
    case Action.FORAGE:
      resolveForage(snapshot, creature, tick, territories);
      return [];
    case Action.DRINK:
      resolveDrink(snapshot, creature);
      return [];
    case Action.GUARD:
      resolveGuard(snapshot, creature, tick);
      return [];
    default:
      clearAction(creature);
      return [];
  }
}

/** Clear a finished action slot without resolution side effects. */
export function clearFinishedAction(creature: CreatureRow): void {
  clearAction(creature);
}
