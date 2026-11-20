/**
 * Pair lookup index for `snapshot.relationships`, keyed by array identity and
 * extended by appended rows (the kernel only pushes; pruning makes a new
 * array). Same answer as a linear `find` for the first matching row.
 */
import type { RelationshipRow } from "../types";

type PairIndex = {
  length: number;
  tail: RelationshipRow | undefined;
  byPair: Map<number, RelationshipRow>;
};

const indexes = new WeakMap<readonly RelationshipRow[], PairIndex>();

/** Creature ids are far below 2^26, so low * 2^26 + high is exact. */
function key(low: number, high: number): number {
  return low * 67108864 + high;
}

export function lookupPair(
  relationships: readonly RelationshipRow[],
  low: number,
  high: number,
): RelationshipRow | null {
  let index = indexes.get(relationships);
  if (
    !index ||
    index.length > relationships.length ||
    (index.length > 0 && relationships[index.length - 1] !== index.tail)
  ) {
    index = { length: 0, tail: undefined, byPair: new Map() };
    indexes.set(relationships, index);
  }
  for (let i = index.length; i < relationships.length; i += 1) {
    const row = relationships[i]!;
    const k = key(row.creatureAId, row.creatureBId);
    if (!index.byPair.has(k)) index.byPair.set(k, row);
  }
  index.length = relationships.length;
  index.tail = relationships[relationships.length - 1];
  return index.byPair.get(key(low, high)) ?? null;
}
