/**
 * Live clock: pause, time scale, quit stamp.
 * Catch-up on launch stays in catchup.ts; this module never invents a second step().
 *
 * Wall time is injected as `nowMs` / `frameDeltaMs` so tests stay deterministic.
 * packages/sim must not call Date.now or Math.random; the host may.
 */
import {
  TIME_SCALES,
  type TimeScale,
  type WorldClock,
} from "@boing-pets/contract";
import { commitSession, stepSession, type HostSession } from "./session";

/** Pause snaps `clockAt` forward at most this often while paused. */
export const PAUSE_SNAP_INTERVAL_MS = 10_000;

/** Live play: commit after this many ticks (or wall interval below). */
export const LIVE_COMMIT_TICKS = 10;

/** Live play: commit after this much wall time (or tick interval above). */
export const LIVE_COMMIT_WALL_MS = 30_000;

const SCALE_SET = new Set<number>(TIME_SCALES);

export function isTimeScale(value: number): value is TimeScale {
  return SCALE_SET.has(value);
}

export type HostClockOptions = {
  scale?: TimeScale;
  /** Wall ms of the last pause snap, or null when never snapped this pause. */
  lastPauseSnapMs?: number | null;
};

export type HostClock = {
  paused: boolean;
  scale: TimeScale;
  accumulatorMs: number;
  lastPauseSnapMs: number | null;
  ticksSinceCommit: number;
  wallMsSinceCommit: number;
};

export type AdvanceResult = {
  ticksStepped: number;
  shouldCommit: boolean;
};

export type PauseTickResult = {
  snapped: boolean;
};

export function createHostClock(options: HostClockOptions = {}): HostClock {
  const scale = options.scale ?? 1;
  if (!isTimeScale(scale)) throw new Error("scale");
  return {
    paused: false,
    scale,
    accumulatorMs: 0,
    lastPauseSnapMs: options.lastPauseSnapMs ?? null,
    ticksSinceCommit: 0,
    wallMsSinceCommit: 0,
  };
}

export function clockView(clock: HostClock, session: HostSession): WorldClock {
  return {
    tick: session.snapshot.world.lastTick,
    paused: clock.paused,
    scale: clock.scale,
    clockAt: session.snapshot.world.clockAtMs,
  };
}

/** Freeze the open session. Accumulator clears; paused wall gap is discarded. */
export function pauseClock(clock: HostClock): void {
  clock.paused = true;
  clock.accumulatorMs = 0;
  clock.lastPauseSnapMs = null;
}

/** Resume live play. Does not replay the paused gap. */
export function resumeClock(clock: HostClock): void {
  clock.paused = false;
  clock.accumulatorMs = 0;
  clock.lastPauseSnapMs = null;
}

export function setClockScale(clock: HostClock, scale: TimeScale): void {
  if (!isTimeScale(scale)) throw new Error("scale");
  clock.scale = scale;
}

/**
 * While paused: every `PAUSE_SNAP_INTERVAL_MS`, if `clockAt < now`, set
 * `clockAt = now` so resume does not owe the paused gap.
 */
export function tickWhilePaused(
  clock: HostClock,
  session: HostSession,
  nowMs: number,
): PauseTickResult {
  if (!clock.paused) throw new Error("paused");
  if (clock.lastPauseSnapMs != null) {
    if (nowMs - clock.lastPauseSnapMs < PAUSE_SNAP_INTERVAL_MS) {
      return { snapped: false };
    }
  }
  if (session.snapshot.world.clockAtMs >= nowMs) {
    clock.lastPauseSnapMs = nowMs;
    return { snapped: false };
  }
  session.snapshot.world.clockAtMs = nowMs;
  clock.lastPauseSnapMs = nowMs;
  return { snapped: true };
}

/**
 * Live frame. Scale multiplies wall delta into the accumulator; each full
 * `msPerTick` runs one `step` and advances `clockAt` by `msPerTick`.
 * At scale > 1, `clockAt` can run ahead of wall-now.
 */
export function advanceClock(
  clock: HostClock,
  session: HostSession,
  frameDeltaMs: number,
): AdvanceResult {
  if (clock.paused) throw new Error("paused");
  if (frameDeltaMs < 0) throw new Error("frameDeltaMs");
  if (!Number.isFinite(frameDeltaMs)) throw new Error("frameDeltaMs");

  const msPerTick = session.snapshot.ruleset.msPerTick;
  clock.accumulatorMs += frameDeltaMs * clock.scale;
  clock.wallMsSinceCommit += frameDeltaMs;

  let ticksStepped = 0;
  while (clock.accumulatorMs >= msPerTick) {
    stepSession(session);
    session.snapshot.world.clockAtMs += msPerTick;
    clock.accumulatorMs -= msPerTick;
    ticksStepped += 1;
    clock.ticksSinceCommit += 1;
  }

  const shouldCommit =
    clock.ticksSinceCommit >= LIVE_COMMIT_TICKS ||
    clock.wallMsSinceCommit >= LIVE_COMMIT_WALL_MS;

  return { ticksStepped, shouldCommit };
}

/** After a live commit, reset the commit counters. */
export function noteLiveCommit(clock: HostClock): void {
  clock.ticksSinceCommit = 0;
  clock.wallMsSinceCommit = 0;
}

/**
 * Quit stamp: if `clockAt < now`, set `clockAt = now`. Drop a partial tick.
 * Fast-forwarded worlds with `clockAt` already ahead are left alone.
 * Closing the game is not a pause — time after exit is owed on the next launch.
 */
export function quitStamp(
  clock: HostClock,
  session: HostSession,
  nowMs: number,
): void {
  clock.accumulatorMs = 0;
  if (session.snapshot.world.clockAtMs < nowMs) {
    session.snapshot.world.clockAtMs = nowMs;
  }
}

/**
 * Convenience: quit stamp then persist. Live dirty creature state is also
 * committed so a relaunch resumes from the stamped clock.
 */
export async function quitAndPersist(
  clock: HostClock,
  session: HostSession,
  nowMs: number,
): Promise<void> {
  quitStamp(clock, session, nowMs);
  await commitSession(session);
  noteLiveCommit(clock);
}

/**
 * Persist a pause snap (clockAt only change, or with any pending dirty).
 * Call when `tickWhilePaused` returns `snapped: true`.
 */
export async function persistPauseSnap(session: HostSession): Promise<void> {
  await commitSession(session);
}
