/**
 * Single-writer host session: load, step, dirty commit, discard-on-crash.
 * Offline catch-up and live clock both commit through this dirty path.
 */
import { EventKind, type CatchupReport } from "@boing-pets/contract";
import {
  createWorld,
  introduceSpecies,
  step,
  type IntroduceSpeciesResult,
  type WorldEvent,
  type WorldSnapshot,
} from "@boing-pets/sim";
import {
  createDisabledMintEdge,
  enqueueBirthMintsAfterCommit,
  type MintEdge,
} from "./boing";
import {
  clearDirty,
  createDirtySet,
  markAfterTick,
  pruneHotSnapshot,
  snapshotCursors,
  type DirtySet,
} from "./persist/dirty";
import { enqueueRelicMintsAfterCommit, type RelicChain } from "./items/relics";
import { loadWorld } from "./persist/load";
import type { WorldRepository } from "./persist/repository";
import { saveDirty, saveWorldgen } from "./persist/save";

export type HostSession = {
  snapshot: WorldSnapshot;
  dirty: DirtySet;
  repository: WorldRepository;
  /**
   * True while catch-up is running. Influence submits wait until false so
   * `issuedAtTick` uses the post-catch-up `lastTick + 1`.
   */
  catchingUp: boolean;
  /** Host-edge Boing mint seam. Never passed into step(). */
  mintEdge: MintEdge;
  /** M22: on-chain owner reads for relic recipients (null: no chain). */
  relicChain?: RelicChain | null;
  /**
   * Creature autonomy: called with the ITEM events of each window right
   * after it is durable (the item service credits loot). Never throws.
   */
  onItemEvents?: ((events: readonly WorldEvent[]) => Promise<void>) | null;
  /**
   * What the introduce-species migration did on this boot (already
   * committed), or null when the world was up to date / freshly created.
   */
  introduced: IntroducedSpecies | null;
};

export type IntroducedSpecies = {
  atTick: number;
  species: string[];
  dietUpdates: string[];
  founders: number;
};

/**
 * Mark an introduce-species result dirty so the next commit writes it:
 * species + compatibility rows, the founders, their lineages and events.
 */
export function markIntroduced(
  dirty: DirtySet,
  result: IntroduceSpeciesResult,
): void {
  dirty.species.push(...result.addedSpecies, ...result.updatedSpecies);
  dirty.compatibility.push(...result.addedCompatibility);
  for (const creature of result.creatures) {
    dirty.creatureIds.add(creature.id);
    dirty.newCreatureIds.add(creature.id);
  }
  for (const lineage of result.lineages) dirty.lineageIds.add(lineage.id);
  dirty.events.push(...result.events);
}

/** Boot from the store, or createWorld(seed) when empty and persist it. */
export async function bootSession(
  repository: WorldRepository,
  seed: number,
  options: { nowMs?: number; mintEdge?: MintEdge } = {},
): Promise<HostSession> {
  const mintEdge = options.mintEdge ?? createDisabledMintEdge();
  const loaded = await loadWorld(repository);
  if (loaded != null) {
    const dirty = createDirtySet();
    if (loaded.upgradedFromSchema != null) {
      // Rewrite every upgraded row on the first commit, even a zero-tick one,
      // so the stored header never claims v2 over v1 (zeroed) positions.
      for (const creature of loaded.snapshot.creatures) {
        dirty.creatureIds.add(creature.id);
      }
    }
    const session: HostSession = {
      snapshot: loaded.snapshot,
      dirty,
      repository,
      catchingUp: false,
      mintEdge,
      introduced: null,
    };
    // Introduce-species migration: a world saved by an older build gains the
    // species this build's catalog adds (two founders each, at lastTick).
    // Deterministic and idempotent, and committed at once (before any tick or
    // catch-up) so a crash before this commit simply re-derives the same rows
    // on the next boot. Existing creatures and history are never touched.
    const result = introduceSpecies(loaded.snapshot);
    if (result.addedSpecies.length > 0 || result.updatedSpecies.length > 0) {
      markIntroduced(dirty, result);
      await commitSession(session);
      session.introduced = {
        atTick: loaded.snapshot.world.lastTick,
        species: result.addedSpecies.map((row) => row.slug),
        dietUpdates: result.updatedSpecies.map((row) => row.slug),
        founders: result.creatures.length,
      };
    }
    return session;
  }
  const { snapshot, events } = createWorld(seed);
  // createWorld leaves clockAtMs at 0; the host stamps wall time on insert
  // so a cold launch does not owe an epoch→now catch-up.
  snapshot.world.clockAtMs = options.nowMs ?? Date.now();
  await saveWorldgen(repository, snapshot, events);
  // Founders: queue unique NFT mints only after durable BIRTH commit.
  await enqueueBirthMintsAfterCommit(
    mintEdge,
    snapshot.world.id,
    events,
    snapshot.world.clockAtMs,
  );
  return {
    snapshot,
    dirty: createDirtySet(),
    repository,
    catchingUp: false,
    mintEdge,
    introduced: null,
  };
}

/** Run one tick in RAM and mark dirty. Does not persist. */
export function stepSession(session: HostSession): void {
  const before = snapshotCursors(session.snapshot);
  const { events } = step(session.snapshot);
  markAfterTick(session.dirty, before, session.snapshot, events);
}

/**
 * Persist the dirty window, then prune DEAD rows from the hot snapshot.
 *
 * If the commit throws, the dirty window is left intact so a later call can
 * re-send it; pass `replay: true` on that retry (the failed attempt may have
 * landed). Once the commit succeeds the window is durable: post-commit side
 * effects (mint queues, loot credit) are best effort and never keep the
 * window dirty, since re-sending it would only duplicate history.
 */
export async function commitSession(
  session: HostSession,
  options: { catchup?: CatchupReport | null; replay?: boolean } = {},
): Promise<void> {
  const birthEvents = session.dirty.events.filter(
    (event) => event.kind === EventKind.BIRTH,
  );
  const relicEvents = session.dirty.events.filter(
    (event) => event.kind === EventKind.BIRTH || event.kind === EventKind.DEATH,
  );
  const itemEvents = session.dirty.events.filter(
    (event) => event.kind === EventKind.ITEM,
  );
  await saveDirty(
    session.repository,
    session.snapshot,
    session.dirty,
    options.catchup ?? null,
    options.replay === true,
  );
  try {
    // Live / catch-up births: mint only after history commit succeeds.
    await enqueueBirthMintsAfterCommit(
      session.mintEdge,
      session.snapshot.world.id,
      birthEvents,
      session.snapshot.world.clockAtMs,
    );
  } catch (error) {
    logPostCommit("birth mints", error);
  }
  // M22 relics: first child / first loss per lineage, after the same commit.
  if (relicEvents.length > 0 && session.mintEdge.enabled) {
    const repository = session.repository;
    try {
      await enqueueRelicMintsAfterCommit({
        mintEdge: session.mintEdge,
        worldId: session.snapshot.world.id,
        events: relicEvents,
        creatureLinks: () => repository.readCreatureNftLinks(),
        accounts: async () =>
          repository.readInfluenceAccounts
            ? repository.readInfluenceAccounts(session.snapshot.world.id)
            : [],
        chain: session.relicChain ?? null,
        nowMs: session.snapshot.world.clockAtMs,
      });
    } catch (error) {
      logPostCommit("relic mints", error);
    }
  }
  // Creature loot: credit keepers / pouches after the same commit.
  if (itemEvents.length > 0 && session.onItemEvents != null) {
    try {
      await session.onItemEvents(itemEvents);
    } catch {
      // The world history is durable; crediting loot is best effort.
    }
  }
  pruneHotSnapshot(session.snapshot);
  clearDirty(session.dirty);
}

function logPostCommit(what: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[sim-host] world saved; ${what} failed: ${detail}`);
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
