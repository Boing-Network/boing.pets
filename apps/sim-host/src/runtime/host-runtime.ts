/**
 * Live host runtime used by the Electron main process.
 * Single writer: either steps or handles a player command, never both at once.
 *
 * M22: optional CommandContext.accountId scopes influence rate limits.
 * Multiplayer fan-out lives in SharedWorldHost — this runtime still has one
 * emit sink (local) or a broadcast sink (shared world).
 */
import {
  AUTONOMY_RULES,
  type CatchupReport,
  type ClientToHost,
  type HostToClient,
  type QueryResult,
  type TimeScale,
  type WorldEventView,
} from "@boing-pets/contract";
import { catchupOnLaunch } from "../catchup";
import {
  advanceClock,
  clockView,
  createHostClock,
  noteLiveCommit,
  pauseClock,
  quitStamp,
  resumeClock,
  setClockScale,
  tickWhilePaused,
  type HostClock,
} from "../clock";
import {
  submitInfluence,
  submitSystemInfluences,
  type InfluenceGate,
} from "../influence";
import type { CreatureOwnerOf } from "../items/autonomy";
import type { RelicChain } from "../items/relics";
import { createItemService, type ItemService } from "../items/service";
import { handleInspectionQuery } from "../ipc/queries";
import { LOCAL_ACCOUNT_ID, resolveAccountId } from "../multiplayer/account";
import {
  gateForAccount,
  hydrateInfluenceBook,
  serializeInfluenceBook,
  type InfluenceGateBook,
} from "../multiplayer/influence-book";
import {
  createDisabledMintEdge,
  enqueueInfluenceRewardMints,
  createRepositoryNftLinkStore,
  type MintEdge,
} from "../boing";
import type { DurableTables, WorldRepository } from "../persist/repository";
import { bootSession, commitSession, type HostSession } from "../session";
import {
  buildWorldPatch,
  createPatchBaseline,
  resetPatchBaseline,
  unsentEventViews,
} from "../view/world-patch";
import { buildWorldView } from "../view/world-view";
import {
  createSaveTracker,
  describeError,
  type PersistenceStatus,
  type SaveTrackerOptions,
} from "./save-tracker";

export type HostRuntimeEmit = (message: HostToClient) => void;

/** Result of a command. Rejections are per-sender and never fatal. */
export type CommandOutcome =
  | { ok: true }
  | {
      ok: false;
      code:
        "rate_limited" | "influence_rejected" | "not_owner" | "item_rejected";
      detail: string;
    };

/** Attribution for a client command (M22). Local play omits this. */
export type CommandContext = {
  accountId?: string;
};

export type HostRuntimeOptions = {
  repository: WorldRepository;
  /** M22: on-chain owner reads for relics (null/omitted trusts mint rows). */
  relicChain?: RelicChain | null;
  /** World seed used only when the database is empty. */
  seed?: number;
  nowMs?: () => number;
  emit: HostRuntimeEmit;
  /**
   * When false, the runtime does not start the live frame timer.
   * Tests and one-shot boots can drive `tickFrame` manually.
   */
  autoFrame?: boolean;
  /**
   * Boing NFT mint edge (M19–M20). Default is disabled / offline-safe.
   * After each durable BIRTH commit the session queues creature mints here.
   * Never passed into `step()`.
   */
  mintEdge?: MintEdge;
  /**
   * When true, live ticks fan out `world.patch` instead of a full snapshot.
   * Shared-world hosts enable this; local single-player keeps full snapshots.
   */
  preferPatches?: boolean;
  /**
   * With `preferPatches`, every Nth live view is a full `world.snapshot`
   * keyframe instead of a patch. Default 60 (one hour of sim at 1x).
   */
  keyframeEvery?: number;
  /**
   * Time scale for a world with no saved clock preference (e.g. a fresh
   * browser world). A saved scale always wins so reload keeps the speed.
   */
  initialScale?: TimeScale;
  /**
   * Who keeps each creature (creature autonomy: loot goes to the keeper,
   * crafts and uses draw on their bag). Default: the local player keeps
   * every creature (single player). Shared hosts pass the adoption index.
   */
  creatureOwners?: () => Promise<CreatureOwnerOf>;
  /**
   * Item rewards for landed influences: "offchain" (default) credits an
   * unminted lot the keeper can mint on demand; "automint" mints LPIT at once.
   */
  itemRewardMode?: "offchain" | "automint";
  /**
   * Player-paid mint on demand: fee per request (base units) and the wallet
   * it is paid to. Without a pay-to wallet, mint on demand stays off.
   */
  itemMintFee?: { feeWei: bigint; payToHex: string | null };
  /** Run the creature autonomy pass (craft / use). Default true. */
  creatureAutonomy?: boolean;
  /** Live-save retry backoff and the "down" threshold (see save-tracker). */
  saveRetry?: SaveTrackerOptions;
  /** Quit: keep retrying the final save this long (wall ms). Default 15s. */
  quitSaveBudgetMs?: number;
  /** Operator log line (save failures / recoveries). Default console.error. */
  log?: (line: string) => void;
};

/** Players see this while the database is not taking saves. */
/** How long one read of the durable store may answer inspection queries. */
export const QUERY_TABLES_TTL_MS = 5_000;

export const SAVES_BLOCKED_DETAIL =
  "the world can't save right now; try again in a minute";

export type HostRuntime = {
  session: HostSession;
  clock: HostClock;
  /** Host-edge Boing mint seam. Disabled by default. */
  mintEdge: MintEdge;
  /** Per-account influence gates (includes `"local"`). */
  influenceBook: InfluenceGateBook;
  /** M22 item service (inventory, item escrow reconcile). */
  items?: ItemService;
  start(): Promise<void>;
  handleCommand(
    message: ClientToHost,
    context?: CommandContext,
  ): Promise<CommandOutcome>;
  handleQuery(
    message: ClientToHost,
    context?: CommandContext,
  ): Promise<QueryResult>;
  /**
   * Step the live clock. Never rejects: a failed save keeps the dirty window,
   * keeps ticking in memory, and retries with backoff.
   */
  tickFrame(frameDeltaMs: number): Promise<void>;
  /**
   * Stamp quit and save, retrying for `quitSaveBudgetMs`. Rejects only when
   * the final save could not be made (the last durable tick is in the error).
   */
  quit(): Promise<void>;
  /** Live-save health (for `/healthz`). */
  persistenceStatus(): PersistenceStatus;
  /** Push a full snapshot + clock to the emit sink (join handshake). */
  pushViewToEmit(): void;
  /**
   * The catch-up report from this launch (time the world spent offline), or
   * null. Shared hosts replay it to players who join later.
   */
  readonly lastCatchup: CatchupReport | null;
};

const DEFAULT_SEED = 1;
const FRAME_MS = 250;

export function createHostRuntime(options: HostRuntimeOptions): HostRuntime {
  const nowMs = options.nowMs ?? (() => Date.now());
  const seed = options.seed ?? DEFAULT_SEED;
  const mintEdge =
    options.mintEdge ??
    createDisabledMintEdge(createRepositoryNftLinkStore(options.repository));
  const preferPatches = options.preferPatches === true;
  let session: HostSession | null = null;
  let clock: HostClock | null = null;
  let book: InfluenceGateBook | null = null;
  let busy = false;
  const exclusiveWaiters: Array<() => void> = [];
  let frameTimer: ReturnType<typeof setInterval> | null = null;
  let lastFrameMs = 0;
  // Frame time that arrived while the runtime was busy (a slow commit or a
  // command); added to the next frame so wall time is never dropped.
  let owedFrameMs = 0;
  let started = false;
  const log =
    options.log ?? ((line: string) => console.error(`[sim-host] ${line}`));
  let saves = createSaveTracker(0, nowMs(), options.saveRetry);
  let lastCatchup: CatchupReport | null = null;
  const items = createItemService({
    repository: options.repository,
    assetLinks: () => options.repository.readAssetMintLinks(),
    chain: options.relicChain ?? null,
    mint: {
      enabled: mintEdge.enabled && options.itemMintFee?.payToHex != null,
      queue: (job) => mintEdge.queueCompressedItemMint(job, nowMs()),
      feeWei: options.itemMintFee?.feeWei,
      payToHex: options.itemMintFee?.payToHex ?? null,
    },
  });
  const itemRewardMode = options.itemRewardMode ?? "offchain";
  const creatureOwners =
    options.creatureOwners ??
    (async (): Promise<CreatureOwnerOf> => () => LOCAL_ACCOUNT_ID);
  // Creature autonomy: last item use per creature (cooldown; host memory),
  // and the tick of the last pass.
  const lastUseTick = new Map<number, number>();
  let lastAutonomyTick: number | null = null;

  /** One autonomy pass, between ticks, after a durable commit. */
  async function runAutonomyPass(active: HostSession): Promise<void> {
    if (options.creatureAutonomy === false || active.catchingUp) return;
    const tick = active.snapshot.world.lastTick;
    if (lastAutonomyTick == null) lastAutonomyTick = tick;
    if (tick - lastAutonomyTick < AUTONOMY_RULES.everyTicks) return;
    lastAutonomyTick = tick;
    try {
      // Bags refresh on the client's own inventory poll.
      await items.runAutonomy(active, {
        ownerOf: await creatureOwners(),
        lastUseTick,
        persist: (records) => submitSystemInfluences(active, records),
        nowMs: nowMs(),
      });
    } catch {
      // Autonomy is a nicety; never break the frame loop.
    }
  }

  /**
   * Commit the dirty window. On failure the window stays dirty (nothing is
   * lost) and the next attempt is a replay (nothing is duplicated if the
   * failed attempt landed after all). Never throws.
   */
  async function trySave(active: HostSession): Promise<boolean> {
    const replay = saves.failing();
    try {
      await commitSession(active, { replay });
    } catch (error) {
      noteSaveFailure(error);
      return false;
    }
    const tick = active.snapshot.world.lastTick;
    if (replay) {
      const before = saves.status(tick, nowMs());
      log(
        `world save recovered at tick ${tick} after ${before.saveFailures} failed attempt(s)`,
      );
    }
    saves.succeeded(tick, nowMs());
    queryTables = null;
    return true;
  }

  function noteSaveFailure(error: unknown): void {
    saves.failed(error, nowMs());
    const status = saves.status(session?.snapshot.world.lastTick ?? 0, nowMs());
    log(
      `world save failed (attempt ${status.saveFailures}, ${status.unsavedTicks} tick(s) unsaved since tick ${status.lastSavedTick}; ` +
        `still ticking in memory, retry in ${status.nextRetryInS}s): ${status.lastError}`,
    );
  }

  // Inspection queries read the whole durable store (dead ancestors are not
  // in the hot snapshot). Doing that under the writer lock for every query
  // let one client stall the world: at the socket rate limit the lock never
  // came free, so nothing ticked or saved. One read is now shared by every
  // query until the store changes (a save or a command) or it ages out, and
  // the answers are computed outside the lock.
  let queryTables: { atMs: number; tables: DurableTables } | null = null;
  let queryTablesLoading: Promise<DurableTables> | null = null;

  function tablesForQueries(): Promise<DurableTables> {
    const cached = queryTables;
    if (cached != null && nowMs() - cached.atMs < QUERY_TABLES_TTL_MS) {
      return Promise.resolve(cached.tables);
    }
    queryTablesLoading ??= withExclusive(async () => {
      const tables = await options.repository.readTables();
      if (tables == null) throw new Error("no world");
      queryTables = { atMs: nowMs(), tables };
      return tables;
    }).finally(() => {
      queryTablesLoading = null;
    });
    return queryTablesLoading;
  }

  /**
   * Single-writer lock. Contended commands wait (multiplayer safe).
   * `tickFrame` still early-returns when busy so frames do not pile up.
   */
  async function withExclusive<T>(fn: () => Promise<T>): Promise<T> {
    while (busy) {
      await new Promise<void>((resolve) => {
        exclusiveWaiters.push(resolve);
      });
    }
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
      const next = exclusiveWaiters.shift();
      if (next != null) next();
    }
  }

  function requireSession(): HostSession {
    if (session == null) throw new Error("host not started");
    return session;
  }

  function requireClock(): HostClock {
    if (clock == null) throw new Error("host not started");
    return clock;
  }

  function requireBook(): InfluenceGateBook {
    if (book == null) throw new Error("host not started");
    return book;
  }

  function pushClock(): void {
    options.emit({
      message: "world.clock",
      body: clockView(requireClock(), requireSession()),
    });
  }

  // What listeners already hold; live patches only carry the difference.
  const baseline = createPatchBaseline();
  // Every Nth live view is a full snapshot (a keyframe): it heals any
  // listener whose merged view drifted, and older clients that ignore
  // creature deltas, at the cost of one snapshot per N ticks.
  const keyframeEvery = Math.max(1, options.keyframeEvery ?? 60);
  let patchesSinceKeyframe = 0;

  /**
   * `events`: live events this snapshot stands in for (a keyframe). Other
   * snapshots (boot, after an influence) carry none: history is a query.
   */
  function pushSnapshot(events: WorldEventView[] = []): void {
    patchesSinceKeyframe = 0;
    const view = buildWorldView(requireSession().snapshot, events);
    resetPatchBaseline(baseline, view);
    options.emit({ message: "world.snapshot", body: view });
  }

  function pushLiveView(): void {
    const active = requireSession();
    if (
      preferPatches &&
      active.dirty.creatureIds.size > 0 &&
      patchesSinceKeyframe < keyframeEvery - 1
    ) {
      patchesSinceKeyframe += 1;
      options.emit({
        message: "world.patch",
        body: buildWorldPatch(active.snapshot, active.dirty, baseline),
      });
    } else {
      pushSnapshot(unsentEventViews(active.dirty, baseline));
    }
    pushClock();
  }

  /** Boot the session, clock, and influence book (one start attempt). */
  async function startSession(): Promise<void> {
    session = await bootSession(options.repository, seed, {
      nowMs: nowMs(),
      mintEdge,
    });
    session.relicChain = options.relicChain ?? null;
    const booted = session;
    booted.onItemEvents = async (events) => {
      await items.creditLoot(booted, events, await creatureOwners(), nowMs());
    };
    // M22: mirror LPIT reward rows into inventory, and retry any FAILED
    // mint rows (e.g. item rewards from before the LPIT collection existed).
    await items
      .syncRewardLots(
        session.snapshot.world.id,
        session.snapshot.world.lastTick,
        nowMs(),
      )
      .catch(() => 0);
    if (mintEdge.enabled) {
      void mintEdge.drain(nowMs()).catch(() => {
        // Recorded on link rows.
      });
    }
    const savedClock = (await options.repository.readHostClock?.()) ?? null;
    clock = createHostClock({
      scale: savedClock?.scale ?? options.initialScale ?? 1,
    });
    const tables = await options.repository.readTables();
    book = hydrateInfluenceBook({
      influenceAcceptedAtMs: tables?.influenceAcceptedAtMs,
      influenceAcceptedByAccount: tables?.influenceAcceptedByAccount,
    });

    const report = await catchupOnLaunch(session, nowMs());
    lastCatchup = report;
    pushSnapshot();
    if (report != null) {
      options.emit({ message: "world.catchup", body: report });
    }
    pushClock();
  }

  const runtime: HostRuntime = {
    get lastCatchup() {
      return lastCatchup;
    },
    get session() {
      return requireSession();
    },
    get clock() {
      return requireClock();
    },
    mintEdge,
    items,
    get influenceBook() {
      return requireBook();
    },
    pushViewToEmit() {
      pushSnapshot();
      pushClock();
    },
    async start() {
      if (started) throw new Error("already started");
      started = true;
      try {
        await startSession();
      } catch (error) {
        // Leave the runtime re-startable (boot retries on a database blip).
        started = false;
        session = null;
        clock = null;
        book = null;
        throw error;
      }
      saves = createSaveTracker(
        requireSession().snapshot.world.lastTick,
        nowMs(),
        options.saveRetry,
      );
      lastFrameMs = nowMs();
      owedFrameMs = 0;
      if (options.autoFrame !== false) {
        frameTimer = setInterval(() => {
          const at = nowMs();
          const delta = Math.max(0, at - lastFrameMs);
          lastFrameMs = at;
          runtime.tickFrame(delta).catch((error: unknown) => {
            log(`frame failed: ${describeError(error)}`);
          });
        }, FRAME_MS);
      }
    },

    async handleCommand(message, context = {}) {
      // Session framing is handled by SharedWorldHost, not the writer.
      if (
        message.message === "session.join" ||
        message.message === "session.leave"
      ) {
        return { ok: true };
      }

      return withExclusive(async (): Promise<CommandOutcome> => {
        // Commands can write the store (a rename, an item); queries after
        // one must see it.
        queryTables = null;
        const active = requireSession();
        const activeClock = requireClock();
        switch (message.message) {
          case "clock.pause":
            pauseClock(activeClock);
            pushClock();
            return { ok: true };
          case "clock.resume":
            resumeClock(activeClock);
            pushClock();
            return { ok: true };
          case "clock.setScale":
            setClockScale(activeClock, message.body.scale);
            await options.repository.writeHostClock?.({
              scale: activeClock.scale,
            });
            pushClock();
            return { ok: true };
          case "influence.submit": {
            // Influence commits write the world header; while live saves are
            // failing that header would get ahead of the unsaved window.
            if (saves.failing()) {
              return {
                ok: false,
                code: "influence_rejected",
                detail: SAVES_BLOCKED_DETAIL,
              };
            }
            const accountId = resolveAccountId(
              context.accountId ?? LOCAL_ACCOUNT_ID,
            );
            const gate: InfluenceGate = gateForAccount(
              requireBook(),
              accountId,
            );
            const prepared = await items.prepare(
              active,
              accountId,
              message.body,
              nowMs(),
            );
            if (!prepared.ok) {
              return {
                ok: false,
                code: "item_rejected",
                detail: prepared.detail,
              };
            }
            const submit = prepared.submit;
            let result: Awaited<ReturnType<typeof submitInfluence>>;
            try {
              result = await submitInfluence(active, gate, submit, nowMs(), {
                influenceAcceptedByAccount: serializeInfluenceBook(
                  requireBook(),
                  nowMs(),
                ),
              });
            } catch (error) {
              // Rolled back in memory; the live loop retries the database.
              noteSaveFailure(error);
              return {
                ok: false,
                code: "influence_rejected",
                detail: SAVES_BLOCKED_DETAIL,
              };
            }
            if (!result.ok) {
              // Local play stays silent (the influence simply does not land);
              // shared hosts relay this to the sender as a notice.
              if (result.reason === "rate_limit") {
                return {
                  ok: false,
                  code: "rate_limited",
                  detail: "influence limit reached for this account",
                };
              }
              return {
                ok: false,
                code: "influence_rejected",
                detail:
                  result.reason === "invalid"
                    ? result.detail
                    : "the world is catching up; try again",
              };
            }
            // Wallet players earn a token for a landed influence (minting
            // is off by default; see boing/influence-rewards.ts).
            await items
              .afterAccept(
                active,
                accountId,
                submit,
                result.id,
                result.issuedAtTick,
                nowMs(),
              )
              .catch(() => {
                // The influence is durable; inventory bookkeeping is best effort.
              });
            const worldId = active.snapshot.world.id;
            const mintItems = itemRewardMode === "automint";
            void enqueueInfluenceRewardMints(
              mintEdge,
              worldId,
              result.id,
              submit,
              context.accountId,
              nowMs(),
              { mintItems },
            )
              .then(async (jobs) => {
                if (jobs == null || jobs.items.length === 0) return;
                if (mintItems) {
                  await items.syncRewardLots(
                    worldId,
                    result.issuedAtTick,
                    nowMs(),
                  );
                } else {
                  // Off-chain first: the keeper mints it on demand.
                  await items.creditRewardLots(
                    worldId,
                    jobs.items,
                    result.issuedAtTick,
                    nowMs(),
                  );
                }
              })
              .catch(() => {
                // Minting and mirroring never fail the command.
              });
            pushSnapshot();
            pushClock();
            return { ok: true };
          }
          case "item.craft": {
            const accountId = resolveAccountId(
              context.accountId ?? LOCAL_ACCOUNT_ID,
            );
            const crafted = await items.craft(
              active,
              accountId,
              message.body.output,
              nowMs(),
            );
            return crafted.ok
              ? { ok: true }
              : { ok: false, code: "item_rejected", detail: crafted.detail };
          }
          case "item.autonomy": {
            const accountId = resolveAccountId(
              context.accountId ?? LOCAL_ACCOUNT_ID,
            );
            const set = await items.setAutonomy(
              active.snapshot.world.id,
              accountId,
              message.body,
              nowMs(),
            );
            return set.ok
              ? { ok: true }
              : { ok: false, code: "item_rejected", detail: set.detail };
          }
          default:
            throw new Error(`not a command: ${message.message}`);
        }
      });
    },

    async handleQuery(message, context = {}) {
      if (message.message === "query.inventory") {
        return withExclusive(async () => {
          const accountId = resolveAccountId(
            context.accountId ?? LOCAL_ACCOUNT_ID,
          );
          return {
            message: "query.inventory" as const,
            body: await items.inventory(requireSession(), accountId, nowMs()),
          };
        });
      }
      return handleInspectionQuery(await tablesForQueries(), message);
    },

    async tickFrame(frameDeltaMs) {
      if (!started) return;
      if (busy) {
        owedFrameMs += Math.max(0, frameDeltaMs);
        return;
      }
      const deltaMs = Math.max(0, frameDeltaMs) + owedFrameMs;
      owedFrameMs = 0;
      try {
        await withExclusive(async () => {
          const active = requireSession();
          const activeClock = requireClock();
          if (activeClock.paused) {
            const pause = tickWhilePaused(activeClock, active, nowMs());
            const retry = saves.failing() && saves.due(nowMs());
            if ((pause.snapped && !saves.failing()) || retry) {
              await trySave(active);
            }
            if (pause.snapped) pushClock();
            return;
          }

          const result = advanceClock(activeClock, active, deltaMs);
          if (result.ticksStepped > 0) {
            pushLiveView();
          }
          // While saves fail, the commit counters keep running (shouldCommit
          // stays true) and the backoff decides when to try again.
          if (result.shouldCommit && saves.due(nowMs())) {
            if (await trySave(active)) {
              noteLiveCommit(activeClock);
              // Between ticks, with the window durable: creatures craft and use.
              await runAutonomyPass(active);
            }
          }
        });
      } catch (error) {
        // Never let a frame reject (the frame timer does not await it).
        log(`frame failed: ${describeError(error)}`);
      }
    },

    persistenceStatus() {
      return saves.status(session?.snapshot.world.lastTick ?? 0, nowMs());
    },

    async quit() {
      if (frameTimer != null) {
        clearInterval(frameTimer);
        frameTimer = null;
      }
      if (session == null || clock == null) return;
      // Stop the frame loop first, then wait out any in-flight tick before
      // stamping quit. Busy retries avoid a permanent hang on shutdown.
      const deadline = nowMs() + 5_000;
      while (busy) {
        if (nowMs() >= deadline) throw new Error("host quit timeout");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await withExclusive(async () => {
        const active = requireSession();
        const activeClock = requireClock();
        quitStamp(activeClock, active, nowMs());
        // Wall clock on purpose: the budget must hold even with a test clock.
        const budgetEnd = Date.now() + (options.quitSaveBudgetMs ?? 15_000);
        for (;;) {
          if (await trySave(active)) {
            noteLiveCommit(activeClock);
            return;
          }
          const waitMs = Math.min(
            saves.retryDelayMs(),
            Math.max(0, budgetEnd - Date.now()),
          );
          if (waitMs <= 0 || Date.now() + waitMs >= budgetEnd) {
            const status = saves.status(
              active.snapshot.world.lastTick,
              nowMs(),
            );
            throw new Error(
              `world not saved on quit after ${status.saveFailures} attempt(s): ` +
                `last durable tick ${status.lastSavedTick} (${status.unsavedTicks} tick(s) in memory not saved; ` +
                `the next launch catches up from tick ${status.lastSavedTick}): ${status.lastError}`,
            );
          }
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      });
    },
  };

  return runtime;
}
