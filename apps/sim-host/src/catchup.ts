/**
 * Offline catch-up: loop the same step() as live play, batch-commit, report.
 * Pause / time scale live in clock.ts. This module only closes a wall-clock gap.
 */
import type { CatchupReport } from "@boing-pets/contract";
import {
  buildCatchupSummary,
  owedTicks,
  type WorldEvent,
} from "@boing-pets/sim";
import { commitSession, stepSession, type HostSession } from "./session";

export type CatchupProgress = {
  fromTick: number;
  toTick: number;
  doneTicks: number;
  totalTicks: number;
};

export type RunCatchupOptions = {
  /** Wall instant stamped on the CatchupReport row. Defaults to `nowMs`. */
  createdAtMs?: number;
  /** Called after each batch commit (and once at the end). */
  onProgress?: (progress: CatchupProgress) => void;
};

/**
 * If `nowMs > clockAt`, run owed ticks via `step`, commit every
 * `catchupBatchTicks`, advance `clockAt` by `n * msPerTick`, and insert one
 * CatchupReport. Returns null when nothing is owed.
 */
export async function runCatchup(
  session: HostSession,
  nowMs: number,
  options: RunCatchupOptions = {},
): Promise<CatchupReport | null> {
  const rules = session.snapshot.ruleset;
  const fromTick = session.snapshot.world.lastTick;
  const n = owedTicks(nowMs, session.snapshot.world.clockAtMs, rules.msPerTick);
  if (n === 0) return null;

  const batchSize = rules.catchupBatchTicks;
  const gapEvents: WorldEvent[] = [];
  const createdAtMs = options.createdAtMs ?? nowMs;

  for (let i = 0; i < n; i += 1) {
    stepSession(session);
    const stepped = i + 1;
    const atBatch = stepped % batchSize === 0;
    const atEnd = stepped === n;

    if (!atBatch && !atEnd) continue;

    for (const event of session.dirty.events) gapEvents.push(event);

    if (atEnd) {
      session.snapshot.world.clockAtMs += n * rules.msPerTick;
      const tables = await session.repository.readTables();
      const existing = tables?.catchups.length ?? 0;
      const summary = buildCatchupSummary(
        fromTick,
        session.snapshot.world.lastTick,
        gapEvents,
        session.snapshot.lineages,
      );
      const report: CatchupReport = {
        id: existing + 1,
        worldId: session.snapshot.world.id,
        fromTick: summary.fromTick,
        toTick: summary.toTick,
        createdAtMs,
        summary,
      };
      await commitSession(session, { catchup: report });
      options.onProgress?.({
        fromTick,
        toTick: session.snapshot.world.lastTick,
        doneTicks: stepped,
        totalTicks: n,
      });
      return report;
    }

    await commitSession(session);
    options.onProgress?.({
      fromTick,
      toTick: session.snapshot.world.lastTick,
      doneTicks: stepped,
      totalTicks: n,
    });
  }

  throw new Error("catchup");
}

/**
 * Launch path: boot already loaded the snapshot; close any wall gap before
 * the client sees the world.
 */
export async function catchupOnLaunch(
  session: HostSession,
  nowMs: number,
  options: RunCatchupOptions = {},
): Promise<CatchupReport | null> {
  return runCatchup(session, nowMs, options);
}
