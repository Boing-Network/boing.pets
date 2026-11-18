/**
 * Single-writer host session: load, step, dirty commit, discard-on-crash.
 * Catch-up wall clock is M12. This milestone only covers persist boundaries.
 */
import { createWorld, step, type WorldSnapshot } from "@boing-pets/sim";
import {
  clearDirty,
  createDirtySet,
  markAfterTick,
  pruneHotSnapshot,
  snapshotCursors,
  type DirtySet,
} from "./persist/dirty";
import { loadSnapshot } from "./persist/load";
import type { WorldRepository } from "./persist/repository";
import { saveDirty, saveWorldgen } from "./persist/save";

export type HostSession = {
  snapshot: WorldSnapshot;
  dirty: DirtySet;
  repository: WorldRepository;
};

/** Boot from the store, or createWorld(seed) when empty and persist it. */
export async function bootSession(
  repository: WorldRepository,
  seed: number,
): Promise<HostSession> {
  const loaded = await loadSnapshot(repository);
  if (loaded != null) {
    return {
      snapshot: loaded,
      dirty: createDirtySet(),
      repository,
    };
  }
  const { snapshot, events } = createWorld(seed);
  await saveWorldgen(repository, snapshot, events);
  return {
    snapshot,
    dirty: createDirtySet(),
    repository,
  };
}

/** Run one tick in RAM and mark dirty. Does not persist. */
export function stepSession(session: HostSession): void {
  const before = snapshotCursors(session.snapshot);
  const { events } = step(session.snapshot);
  markAfterTick(session.dirty, before, session.snapshot, events);
}

/** Persist the dirty window, then prune DEAD rows from the hot snapshot. */
export async function commitSession(session: HostSession): Promise<void> {
  await saveDirty(session.repository, session.snapshot, session.dirty);
  pruneHotSnapshot(session.snapshot);
  clearDirty(session.dirty);
}

/**
 * Run `ticks` steps. Commit every `commitEvery` ticks (and optionally at end).
 * A crash is modeled by skipping commit and dropping the session object.
 */
export async function runBatch(
  session: HostSession,
  ticks: number,
  commitEvery: number,
  options: { commitAtEnd?: boolean } = {},
): Promise<void> {
  if (ticks < 0) throw new Error("ticks");
  if (commitEvery <= 0) throw new Error("commitEvery");
  const commitAtEnd = options.commitAtEnd === true;
  for (let i = 0; i < ticks; i += 1) {
    stepSession(session);
    const stepped = i + 1;
    if (stepped % commitEvery === 0) {
      await commitSession(session);
    }
  }
  if (commitAtEnd && ticks % commitEvery !== 0) {
    await commitSession(session);
  }
}

/** Discard RAM. The next boot reloads the last successful commit. */
export function killSession(session: HostSession): void {
  // Drop hot state so a mistaken use after "kill" cannot read uncommitted RAM.
  session.snapshot = null as unknown as HostSession["snapshot"];
  clearDirty(session.dirty);
}
