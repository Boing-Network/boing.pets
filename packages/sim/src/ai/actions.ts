import {
  Action,
  ActionTargetKind,
  CreatureStatus,
  DeathCause,
  EventTemplate,
  Goal,
  MemoryKind,
  MemoryTag,
  MigrationReason,
} from "@boing-pets/contract";
import { discoveryEvent, migrationEvent } from "../history/events";
import { die } from "../kernel/death";
import type { TerritoryTick } from "../kernel/needs";
import { settleScore } from "../kernel/territories";
import { clamp, divRound } from "../math";
import { initialMemoryStrength } from "../memories/strength";
import { isMemoryThrottled } from "../memories/throttle";
import {
  applyContestDelta,
  applyCooperateForageDelta,
  applySnubDelta,
  applySocializeDelta,
  ensureRelationship,
} from "../relationships/delta";
import type { CreatureRow, WorldEvent, WorldSnapshot } from "../types";
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
/**
 * Arrive, write MIGRATION, and write DISCOVERY the first time this lineage
 * enters the destination. Death before this call writes neither.
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
 * Contest, approach, and cooperate resolve when the slot ends; court/forage later.
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
        creature,
        tick,
        goal,
        Action.FORAGE,
        forageDuration(creature.geneSpeed, rules.forageBaseDuration),
      );
      return;
    }
    case Goal.DRINK_WATER:
      startAction(creature, tick, goal, Action.DRINK, rules.drinkDuration);
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
          creature,
          tick,
          Goal.SEEK_SHELTER,
          Action.REST,
          rules.restDurationMin,
        );
        return;
      }
      startAction(
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
      startAction(creature, tick, goal, Action.WANDER, rules.wanderDuration);
      return;
    }
    case Goal.FIND_MATE: {
      const partner = bestMateTarget(snapshot, creature, tick);
      if (!partner) {
        startAction(
          creature,
          tick,
          Goal.SEEK_SHELTER,
          Action.REST,
          rules.restDurationMin,
        );
        return;
      }
      startAction(
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
    startAction(creature, tick, Goal.IDLE, Action.NURSE, 1);
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

/**
 * Resolve a finished non-relocate action. Contest, approach, and cooperate
 * write relationship deltas. Other actions clear the slot for utility.
 */
export function resolveFinishedAction(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
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
    default:
      clearAction(creature);
      return [];
  }
}

/** End an action whose effects are not implemented yet. */
export function clearFinishedAction(creature: CreatureRow): void {
  clearAction(creature);
}
