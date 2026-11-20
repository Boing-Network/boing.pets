/**
 * Utility Memory term: top hot memories by strength, then goal-specific filters.
 */
import {
  CreatureStatus,
  Goal,
  MemoryKind,
  MemoryTag,
} from "@boing-pets/contract";
import type { CreatureRow, MemoryRow, WorldSnapshot } from "../types";
import { derivedForOwner } from "./index-by-owner";
import { memoryStrength } from "./strength";

type RankedMemory = {
  memory: MemoryRow;
  strength: number;
};

/**
 * Owner's non-archived memories, strongest first, id ascending, capped.
 * Memoized per owner per tick (utility scoring asks once per goal); the
 * returned array is shared and must not be mutated.
 */
export function hotMemories(
  snapshot: WorldSnapshot,
  creatureId: number,
  tick: number,
): readonly RankedMemory[] {
  const rules = snapshot.ruleset;
  return derivedForOwner(snapshot.memories, creatureId, tick, (rows) => {
    const ranked: RankedMemory[] = [];
    for (const memory of rows) {
      if (memory.archived) continue;
      ranked.push({
        memory,
        strength: memoryStrength(memory, tick, rules),
      });
    }
    ranked.sort((a, b) => {
      if (a.strength !== b.strength) return b.strength - a.strength;
      return a.memory.id - b.memory.id;
    });
    return ranked.slice(0, rules.memoryHotScoreCap);
  });
}

function hasTag(memory: MemoryRow, tag: MemoryTag): boolean {
  return memory.payload.tags.includes(tag);
}

function maxStrength(ranked: readonly RankedMemory[]): number {
  let best = 0;
  for (const row of ranked) {
    if (row.strength > best) best = row.strength;
  }
  return best;
}

function subjectInTerritory(
  snapshot: WorldSnapshot,
  subjectId: number | null,
  territoryId: number,
): boolean {
  if (subjectId == null) return false;
  const subject = snapshot.creatures.find((row) => row.id === subjectId);
  return (
    subject != null &&
    subject.status === CreatureStatus.ALIVE &&
    subject.territoryId === territoryId
  );
}

/**
 * Goal Memory term over the hot set. Returns 0 when nothing matches.
 */
export function memoryTermForGoal(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
  goal: Goal,
  legalPartnerIds: ReadonlySet<number>,
): number {
  const hot = hotMemories(snapshot, creature.id, tick);
  if (hot.length === 0) return 0;

  switch (goal) {
    case Goal.FIND_FOOD:
      return maxStrength(
        hot.filter((row) => hasTag(row.memory, MemoryTag.FOOD_INSECURITY)),
      );
    case Goal.DRINK_WATER:
      return 0;
    case Goal.SEEK_SHELTER:
      return maxStrength(
        hot.filter((row) => {
          if (hasTag(row.memory, MemoryTag.INJURY)) return true;
          if (hasTag(row.memory, MemoryTag.GRIEF)) return true;
          return (
            hasTag(row.memory, MemoryTag.FEAR_TERRITORY) &&
            row.memory.territoryId === creature.territoryId
          );
        }),
      );
    case Goal.SOCIALIZE:
      return maxStrength(
        hot.filter(
          (row) =>
            row.memory.emotionalValue > 0 &&
            subjectInTerritory(
              snapshot,
              row.memory.subjectCreatureId,
              creature.territoryId,
            ),
        ),
      );
    case Goal.EXPLORE:
      return maxStrength(
        hot.filter(
          (row) =>
            hasTag(row.memory, MemoryTag.DISCOVERY) ||
            (hasTag(row.memory, MemoryTag.FEAR_TERRITORY) &&
              row.memory.territoryId === creature.territoryId),
        ),
      );
    case Goal.FIND_MATE:
      return maxStrength(
        hot.filter(
          (row) =>
            row.memory.kind === MemoryKind.MATE &&
            row.memory.subjectCreatureId != null &&
            legalPartnerIds.has(row.memory.subjectCreatureId),
        ),
      );
    case Goal.PROTECT_OFFSPRING:
      return maxStrength(
        hot.filter(
          (row) =>
            row.memory.kind === MemoryKind.PARENT_DEATH ||
            row.memory.kind === MemoryKind.FIRST_CHILD,
        ),
      );
    case Goal.IDLE:
      return 0;
    default: {
      const never: never = goal;
      throw new Error(`goal ${String(never)}`);
    }
  }
}
