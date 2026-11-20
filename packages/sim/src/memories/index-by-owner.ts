/**
 * Per-owner memory buckets, rebuilt lazily. `snapshot.memories` only grows by
 * `push` inside a tick and is replaced (new array) when the host prunes, so
 * the index is keyed by array identity and extended by the appended tail.
 * Pure acceleration: callers get the same rows they would get by scanning,
 * in insertion order, so results are unchanged and deterministic.
 */
import type { MemoryRow } from "../types";

type OwnerIndex = {
  length: number;
  /** Row at `length - 1` when indexed; a mismatch means in-place edits. */
  tail: MemoryRow | undefined;
  byOwner: Map<number, MemoryRow[]>;
  /** Per-owner derived value, valid for one tick and one bucket length. */
  derived: Map<number, { tick: number; size: number; value: unknown }>;
};

const indexes = new WeakMap<readonly MemoryRow[], OwnerIndex>();

function sync(memories: readonly MemoryRow[]): OwnerIndex {
  let index = indexes.get(memories);
  if (
    !index ||
    index.length > memories.length ||
    (index.length > 0 && memories[index.length - 1] !== index.tail)
  ) {
    index = {
      length: 0,
      tail: undefined,
      byOwner: new Map(),
      derived: new Map(),
    };
    indexes.set(memories, index);
  }
  for (let i = index.length; i < memories.length; i += 1) {
    const memory = memories[i]!;
    let bucket = index.byOwner.get(memory.creatureId);
    if (!bucket) {
      bucket = [];
      index.byOwner.set(memory.creatureId, bucket);
    }
    bucket.push(memory);
  }
  index.length = memories.length;
  index.tail = memories[memories.length - 1];
  return index;
}

export function memoriesOf(
  memories: readonly MemoryRow[],
  creatureId: number,
): readonly MemoryRow[] {
  return sync(memories).byOwner.get(creatureId) ?? [];
}

/**
 * Memoize a per-owner value for one tick. Recomputed when the owner gains a
 * memory or the tick moves on. `compute` must be pure in (rows, tick).
 */
export function derivedForOwner<T>(
  memories: readonly MemoryRow[],
  creatureId: number,
  tick: number,
  compute: (rows: readonly MemoryRow[]) => T,
): T {
  const index = sync(memories);
  const rows = index.byOwner.get(creatureId) ?? [];
  const hit = index.derived.get(creatureId);
  if (hit && hit.tick === tick && hit.size === rows.length) {
    return hit.value as T;
  }
  const value = compute(rows);
  index.derived.set(creatureId, { tick, size: rows.length, value });
  return value;
}
