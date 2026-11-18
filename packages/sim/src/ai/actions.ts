import {
  Action,
  ActionTargetKind,
  EventTemplate,
  Goal,
  MemoryKind,
  MemoryTag,
  MigrationReason,
} from "@boing-pets/contract";
import { discoveryEvent, migrationEvent } from "../history/events";
import type { TerritoryTick } from "../kernel/needs";
import { settleScore } from "../kernel/territories";
import { assertInteger, clamp, divRound } from "../math";
import type { CreatureRow, WorldEvent, WorldSnapshot } from "../types";

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
  const already = snapshot.memories.some(
    (memory) =>
      memory.creatureId === creature.id &&
      memory.kind === MemoryKind.DISCOVERY &&
      memory.territoryId === territoryId,
  );
  if (already) return;
  snapshot.memories.push({
    id: take(snapshot, "nextMemoryId"),
    worldId: snapshot.world.id,
    creatureId: creature.id,
    tick,
    kind: MemoryKind.DISCOVERY,
    importance: DISCOVERY_IMPORTANCE,
    emotionalValue: DISCOVERY_EMOTION,
    initialStrength: assertInteger(
      clamp(
        DISCOVERY_IMPORTANCE * snapshot.ruleset.memoryStrengthPerImportance,
        1,
        1000,
      ),
      "initialStrength",
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
