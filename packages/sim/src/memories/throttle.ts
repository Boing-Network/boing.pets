/**
 * Skip a memory insert when a matching row already exists inside the window.
 * Major life events are once-per-owner/subject (or territory) forever.
 */
import { MemoryKind, MemoryTag, type Ruleset } from "@boing-pets/contract";
import type { MemoryRow, WorldSnapshot } from "../types";
import { memoriesOf } from "./index-by-owner";

export type MemoryThrottleQuery = {
  creatureId: number;
  kind: MemoryKind;
  tick: number;
  subjectCreatureId?: number | null;
  territoryId?: number | null;
  tags?: readonly MemoryTag[];
};

function windowTicks(kind: MemoryKind, rules: Ruleset): number | "once" | null {
  switch (kind) {
    case MemoryKind.CONVERSATION:
    case MemoryKind.GIFT:
    case MemoryKind.COOPERATION:
    case MemoryKind.MIGRATION:
      return rules.memoryThrottleTicks;
    case MemoryKind.CONFLICT:
      return rules.conflictMemoryThrottleTicks;
    case MemoryKind.THREAT:
      return rules.memoryThrottleTicks;
    case MemoryKind.PARENT_DEATH:
    case MemoryKind.FIRST_CHILD:
    case MemoryKind.DISCOVERY:
      return "once";
    case MemoryKind.MATE:
    case MemoryKind.RESCUE:
      return null;
    default: {
      const never: never = kind;
      throw new Error(`kind ${String(never)}`);
    }
  }
}

function matchesThrottle(
  memory: MemoryRow,
  query: MemoryThrottleQuery,
): boolean {
  if (memory.creatureId !== query.creatureId) return false;
  if (memory.kind !== query.kind) return false;
  switch (query.kind) {
    case MemoryKind.CONVERSATION:
    case MemoryKind.GIFT:
    case MemoryKind.COOPERATION:
    case MemoryKind.CONFLICT:
    case MemoryKind.PARENT_DEATH:
    case MemoryKind.FIRST_CHILD:
      return memory.subjectCreatureId === (query.subjectCreatureId ?? null);
    case MemoryKind.DISCOVERY:
      return memory.territoryId === (query.territoryId ?? null);
    case MemoryKind.MIGRATION:
      return true;
    case MemoryKind.THREAT:
      return memory.payload.tags.includes(MemoryTag.FOOD_INSECURITY);
    case MemoryKind.MATE:
    case MemoryKind.RESCUE:
      return false;
    default: {
      const never: never = query.kind;
      throw new Error(`kind ${String(never)}`);
    }
  }
}

/**
 * True when an insert of this kind should be skipped.
 * `MATE` and `RESCUE` never throttle. Windowed kinds require a match inside
 * `[tick - window, tick]`. Once-kinds match any prior row forever.
 */
export function isMemoryThrottled(
  snapshot: WorldSnapshot,
  query: MemoryThrottleQuery,
): boolean {
  const window = windowTicks(query.kind, snapshot.ruleset);
  if (window == null) return false;
  for (const memory of memoriesOf(snapshot.memories, query.creatureId)) {
    if (!matchesThrottle(memory, query)) continue;
    if (window === "once") return true;
    if (query.tick - memory.tick <= window) return true;
  }
  return false;
}
