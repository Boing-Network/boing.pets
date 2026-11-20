/**
 * Live host runtime used by the Electron main process.
 * Single writer: either steps or handles a player command, never both at once.
 */
import type {
  ClientToHost,
  HostToClient,
  QueryResult,
} from "@boing-pets/contract";
import { catchupOnLaunch } from "../catchup";
import {
  advanceClock,
  clockView,
  createHostClock,
  noteLiveCommit,
  pauseClock,
  persistPauseSnap,
  quitAndPersist,
  resumeClock,
  setClockScale,
  tickWhilePaused,
  type HostClock,
} from "../clock";
import {
  loadInfluenceGate,
  submitInfluence,
  type InfluenceGate,
} from "../influence";
import { handleInspectionQuery } from "../ipc/queries";
import {
  createDisabledMintEdge,
  createRepositoryNftLinkStore,
  type MintEdge,
} from "../boing";
import type { WorldRepository } from "../persist/repository";
import { bootSession, commitSession, type HostSession } from "../session";
import { buildWorldView } from "../view/world-view";

export type HostRuntimeEmit = (message: HostToClient) => void;

export type HostRuntimeOptions = {
  repository: WorldRepository;
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
};

export type HostRuntime = {
  session: HostSession;
  clock: HostClock;
  /** Host-edge Boing mint seam. Disabled by default. */
  mintEdge: MintEdge;
  start(): Promise<void>;
  handleCommand(message: ClientToHost): Promise<void>;
  handleQuery(message: ClientToHost): Promise<QueryResult>;
  tickFrame(frameDeltaMs: number): Promise<void>;
  quit(): Promise<void>;
};

const DEFAULT_SEED = 1;
const FRAME_MS = 250;

export function createHostRuntime(options: HostRuntimeOptions): HostRuntime {
  const nowMs = options.nowMs ?? (() => Date.now());
  const seed = options.seed ?? DEFAULT_SEED;
  const mintEdge =
    options.mintEdge ??
    createDisabledMintEdge(createRepositoryNftLinkStore(options.repository));
  let session: HostSession | null = null;
  let clock: HostClock | null = null;
  let gate: InfluenceGate | null = null;
  let busy = false;
  let frameTimer: ReturnType<typeof setInterval> | null = null;
  let lastFrameMs = 0;
  let started = false;

  async function withExclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (busy) throw new Error("host busy");
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
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

  function requireGate(): InfluenceGate {
    if (gate == null) throw new Error("host not started");
    return gate;
  }

  function pushClock(): void {
    options.emit({
      message: "world.clock",
      body: clockView(requireClock(), requireSession()),
    });
  }

  function pushSnapshot(): void {
    options.emit({
      message: "world.snapshot",
      body: buildWorldView(requireSession().snapshot),
    });
  }

  const runtime: HostRuntime = {
    get session() {
      return requireSession();
    },
    get clock() {
      return requireClock();
    },
    mintEdge,
    async start() {
      if (started) throw new Error("already started");
      started = true;

      session = await bootSession(options.repository, seed, {
        nowMs: nowMs(),
        mintEdge,
      });
      clock = createHostClock();
      gate = await loadInfluenceGate(options.repository);

      const report = await catchupOnLaunch(session, nowMs());
      pushSnapshot();
      if (report != null) {
        options.emit({ message: "world.catchup", body: report });
      }
      pushClock();

      lastFrameMs = nowMs();
      if (options.autoFrame !== false) {
        frameTimer = setInterval(() => {
          void runtime.tickFrame(Math.max(0, nowMs() - lastFrameMs));
          lastFrameMs = nowMs();
        }, FRAME_MS);
      }
    },

    async handleCommand(message) {
      await withExclusive(async () => {
        const active = requireSession();
        const activeClock = requireClock();
        switch (message.message) {
          case "clock.pause":
            pauseClock(activeClock);
            pushClock();
            return;
          case "clock.resume":
            resumeClock(activeClock);
            pushClock();
            return;
          case "clock.setScale":
            setClockScale(activeClock, message.body.scale);
            pushClock();
            return;
          case "influence.submit": {
            const result = await submitInfluence(
              active,
              requireGate(),
              message.body,
              nowMs(),
            );
            if (!result.ok) {
              // Rate-limit rejects are silent to the renderer in v1 packaging;
              // the influence simply does not land.
              return;
            }
            pushSnapshot();
            pushClock();
            return;
          }
          default:
            throw new Error(`not a command: ${message.message}`);
        }
      });
    },

    async handleQuery(message) {
      return withExclusive(async () => {
        const tables = await options.repository.readTables();
        if (tables == null) throw new Error("no world");
        return handleInspectionQuery(tables, message);
      });
    },

    async tickFrame(frameDeltaMs) {
      if (!started || busy) return;
      await withExclusive(async () => {
        const active = requireSession();
        const activeClock = requireClock();
        if (activeClock.paused) {
          const pause = tickWhilePaused(activeClock, active, nowMs());
          if (pause.snapped) {
            await persistPauseSnap(active);
            pushClock();
          }
          return;
        }

        const result = advanceClock(activeClock, active, frameDeltaMs);
        if (result.ticksStepped > 0) {
          pushSnapshot();
          pushClock();
        }
        if (result.shouldCommit) {
          await commitSession(active);
          noteLiveCommit(activeClock);
        }
      });
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
        await quitAndPersist(requireClock(), requireSession(), nowMs());
      });
    },
  };

  return runtime;
}
