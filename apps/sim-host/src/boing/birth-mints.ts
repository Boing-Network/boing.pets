/**
 * After a durable BIRTH history commit, queue unique creature NFT mints.
 * Never called from packages/sim or step().
 */
import { EventKind } from "@boing-pets/contract";
import type { WorldEvent } from "@boing-pets/sim";
import type { CreatureMintJob } from "./types";
import type { MintEdge } from "./mint-edge";

/** Map committed BIRTH world_events to mint jobs (child = actorId). */
export function birthMintJobsFromEvents(
  worldId: number,
  events: readonly WorldEvent[],
): CreatureMintJob[] {
  const jobs: CreatureMintJob[] = [];
  for (const event of events) {
    if (event.kind !== EventKind.BIRTH) continue;
    if (event.actorId == null) continue;
    jobs.push({
      worldId,
      creatureId: event.actorId,
      birthEventId: event.id,
      birthTick: event.tick,
      metadataHashHex: null,
    });
  }
  // Stable order: ascending creature id (matches kernel birth iteration).
  jobs.sort((a, b) => a.creatureId - b.creatureId);
  return jobs;
}

/**
 * Queue mints for every BIRTH in `events`, then kick a non-blocking drain.
 * Failures inside the edge must not throw to the tick/commit path.
 */
export async function enqueueBirthMintsAfterCommit(
  mintEdge: MintEdge,
  worldId: number,
  events: readonly WorldEvent[],
  nowMs: number = Date.now(),
): Promise<void> {
  if (!mintEdge.enabled) return;
  const jobs = birthMintJobsFromEvents(worldId, events);
  for (const job of jobs) {
    try {
      await mintEdge.queueCreatureMint(job, nowMs);
    } catch {
      // Birth is already durable. Never roll back or block the next tick.
    }
  }
  if (jobs.length > 0) {
    void mintEdge.drain(nowMs).catch(() => {
      // Drain errors are recorded on link rows; do not surface to the host clock.
    });
  }
}
