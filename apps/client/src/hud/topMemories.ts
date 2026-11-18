import type { MemoryView } from "@boing-pets/contract";

/** Top memories by effective strength desc, then id asc — display order only. */
export function topMemories(
  memories: readonly MemoryView[],
  limit = 5,
): MemoryView[] {
  return memories
    .slice()
    .sort((a, b) => b.strength - a.strength || a.id - b.id)
    .slice(0, Math.max(0, limit));
}
