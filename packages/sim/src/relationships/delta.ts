import type { Ruleset } from "@boing-pets/contract";
import { clamp } from "../math";
import type { RelationshipRow, WorldSnapshot } from "../types";

const SCORE_LO = -1000;
const SCORE_HI = 1000;
const COMPONENT_LO = 0;
const COMPONENT_HI = 1000;

/** Parent-child starting values at birth. */
const PARENT_CHILD = {
  score: 400,
  friendship: 200,
  trust: 300,
  cooperation: 100,
} as const;

export function orderedPairIds(
  creatureAId: number,
  creatureBId: number,
): [number, number] {
  if (creatureAId === creatureBId) throw new Error("pair ids");
  return creatureAId < creatureBId
    ? [creatureAId, creatureBId]
    : [creatureBId, creatureAId];
}

export function findRelationship(
  relationships: readonly RelationshipRow[],
  creatureAId: number,
  creatureBId: number,
): RelationshipRow | null {
  const [low, high] = orderedPairIds(creatureAId, creatureBId);
  return (
    relationships.find(
      (row) => row.creatureAId === low && row.creatureBId === high,
    ) ?? null
  );
}

function takeRelationshipId(snapshot: WorldSnapshot): number {
  const id = snapshot.world.nextRelationshipId;
  snapshot.world.nextRelationshipId = id + 1;
  return id;
}

function clampRelationship(row: RelationshipRow): void {
  row.score = clamp(row.score, SCORE_LO, SCORE_HI);
  row.friendship = clamp(row.friendship, COMPONENT_LO, COMPONENT_HI);
  row.romance = clamp(row.romance, COMPONENT_LO, COMPONENT_HI);
  row.trust = clamp(row.trust, COMPONENT_LO, COMPONENT_HI);
  row.cooperation = clamp(row.cooperation, COMPONENT_LO, COMPONENT_HI);
  row.avoidance = clamp(row.avoidance, COMPONENT_LO, COMPONENT_HI);
  row.conflict = clamp(row.conflict, COMPONENT_LO, COMPONENT_HI);
}

/** Bump interaction count and last-touch. Passive decay never calls this. */
export function touchInteraction(row: RelationshipRow, tick: number): void {
  row.interactionCount += 1;
  row.lastInteractionTick = tick;
}

/**
 * Create a pair at all zeros. `creatureAId` and `creatureBId` are ordered
 * before insert. Throws when the pair already exists.
 */
export function createRelationship(
  snapshot: WorldSnapshot,
  creatureAId: number,
  creatureBId: number,
  tick: number,
): RelationshipRow {
  if (findRelationship(snapshot.relationships, creatureAId, creatureBId)) {
    throw new Error("relationship exists");
  }
  const [low, high] = orderedPairIds(creatureAId, creatureBId);
  const row: RelationshipRow = {
    id: takeRelationshipId(snapshot),
    worldId: snapshot.world.id,
    creatureAId: low,
    creatureBId: high,
    score: 0,
    friendship: 0,
    romance: 0,
    trust: 0,
    cooperation: 0,
    avoidance: 0,
    conflict: 0,
    metTick: tick,
    lastInteractionTick: tick,
    interactionCount: 0,
  };
  snapshot.relationships.push(row);
  return row;
}

/**
 * First APPROACH (and other interaction writers) use this. Missing pairs are
 * created at zeros; an existing pair is returned unchanged.
 */
export function ensureRelationship(
  snapshot: WorldSnapshot,
  creatureAId: number,
  creatureBId: number,
  tick: number,
): RelationshipRow {
  return (
    findRelationship(snapshot.relationships, creatureAId, creatureBId) ??
    createRelationship(snapshot, creatureAId, creatureBId, tick)
  );
}

/** Birth inserts the parent-child row immediately. */
export function createParentChildRelationship(
  snapshot: WorldSnapshot,
  parentId: number,
  childId: number,
  tick: number,
): RelationshipRow {
  const row = createRelationship(snapshot, parentId, childId, tick);
  row.score = PARENT_CHILD.score;
  row.friendship = PARENT_CHILD.friendship;
  row.trust = PARENT_CHILD.trust;
  row.cooperation = PARENT_CHILD.cooperation;
  clampRelationship(row);
  return row;
}

export function applySocializeDelta(
  row: RelationshipRow,
  actorSociability: number,
  tick: number,
  rules: Ruleset,
): void {
  touchInteraction(row, tick);
  row.score += rules.socializeScore;
  row.friendship +=
    rules.socializeFriendshipBase +
    Math.floor(actorSociability / rules.socializeFriendshipPerSociability);
  row.trust += rules.socializeTrust;
  row.cooperation += rules.socializeCooperation;
  clampRelationship(row);
}

export function applySnubDelta(
  row: RelationshipRow,
  tick: number,
  rules: Ruleset,
): void {
  touchInteraction(row, tick);
  row.score -= rules.snubScore;
  row.avoidance += rules.snubAvoidance;
  row.conflict += rules.snubConflict;
  clampRelationship(row);
}

export function applyGiftDelta(row: RelationshipRow, tick: number): void {
  touchInteraction(row, tick);
  row.score += 30;
  row.friendship += 40;
  row.romance += 5;
  row.trust += 15;
  clampRelationship(row);
}

export function applyCooperateForageDelta(
  row: RelationshipRow,
  tick: number,
): void {
  touchInteraction(row, tick);
  row.score += 12;
  row.friendship += 10;
  row.trust += 10;
  row.cooperation += 25;
  clampRelationship(row);
}

/**
 * Contest: score −20, friendship −10 (floored at 0 before clamp), avoidance
 * +15, conflict +40.
 */
export function applyContestDelta(row: RelationshipRow, tick: number): void {
  touchInteraction(row, tick);
  row.score -= 20;
  row.friendship = Math.max(0, row.friendship - 10);
  row.avoidance += 15;
  row.conflict += 40;
  clampRelationship(row);
}

export function applyCourtAcceptDelta(
  row: RelationshipRow,
  tick: number,
): void {
  touchInteraction(row, tick);
  row.score += 30;
  row.friendship += 20;
  row.romance += 50;
  row.trust += 20;
  row.cooperation += 10;
  clampRelationship(row);
}

export function applyCourtRejectDelta(
  row: RelationshipRow,
  tick: number,
): void {
  touchInteraction(row, tick);
  row.romance += 5;
  row.avoidance += 5;
  clampRelationship(row);
}

export function applyRescueDelta(row: RelationshipRow, tick: number): void {
  touchInteraction(row, tick);
  row.score += 80;
  row.friendship += 40;
  row.trust += 60;
  row.cooperation += 20;
  clampRelationship(row);
}

export function applyGuardOffspringDelta(
  row: RelationshipRow,
  tick: number,
): void {
  touchInteraction(row, tick);
  row.trust += 5;
  clampRelationship(row);
}
