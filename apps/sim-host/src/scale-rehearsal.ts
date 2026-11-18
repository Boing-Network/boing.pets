/**
 * M17 scale rehearsal: 5,000 living creatures, 144 steps, one batch commit.
 * Measurement only — does not change sim formulas.
 */
import { CreatureStatus } from "@boing-pets/contract";
import { createScaleWorld, step } from "@boing-pets/sim";
import {
  clearDirty,
  createDirtySet,
  markAfterTick,
  pruneHotSnapshot,
  snapshotCursors,
  type DirtySet,
} from "./persist/dirty";
import { MemoryWorldRepository } from "./persist/memory-repository";
import type { WorldRepository } from "./persist/repository";
import { saveDirty, saveWorldgen } from "./persist/save";

/** Host-only wall clock. packages/sim still bans Date.now. */
function wallMs(): number {
  return Date.now();
}

export const SCALE_REHEARSAL_SEED = 17;
export const SCALE_REHEARSAL_LIVING = 5000;
export const SCALE_REHEARSAL_TICKS = 144;

export type ScaleRehearsalTiming = {
  seed: number;
  livingAtStart: number;
  livingAtEnd: number;
  ticks: number;
  lastTick: number;
  worldgenMs: number;
  stepMs: number;
  commitMs: number;
  totalMs: number;
  recordedAt: string;
};

export type ScaleRehearsalOptions = {
  seed?: number;
  livingCount?: number;
  ticks?: number;
  repository?: WorldRepository;
};

function aliveCount(creatures: { status: CreatureStatus }[]): number {
  return creatures.filter((row) => row.status === CreatureStatus.ALIVE).length;
}

/**
 * Seed a scale world, run `ticks` via step with dirty tracking, then one commit.
 * Returns wall timings for worldgen, the step loop, and the single batch commit.
 */
export async function runScaleRehearsal(
  options: ScaleRehearsalOptions = {},
): Promise<ScaleRehearsalTiming> {
  const seed = options.seed ?? SCALE_REHEARSAL_SEED;
  const livingCount = options.livingCount ?? SCALE_REHEARSAL_LIVING;
  const ticks = options.ticks ?? SCALE_REHEARSAL_TICKS;
  const repository = options.repository ?? new MemoryWorldRepository();

  const worldgenStarted = wallMs();
  const { snapshot, events } = createScaleWorld(seed, livingCount);
  const livingAtStart = aliveCount(snapshot.creatures);
  if (livingAtStart !== livingCount) {
    throw new Error(
      `scale worldgen living ${livingAtStart} !== ${livingCount}`,
    );
  }
  await saveWorldgen(repository, snapshot, events);
  const worldgenMs = wallMs() - worldgenStarted;

  const dirty: DirtySet = createDirtySet();

  const stepStarted = wallMs();
  for (let i = 0; i < ticks; i += 1) {
    const before = snapshotCursors(snapshot);
    const { events: tickEvents } = step(snapshot);
    markAfterTick(dirty, before, snapshot, tickEvents);
  }
  const stepMs = wallMs() - stepStarted;

  if (snapshot.world.lastTick !== ticks) {
    throw new Error(`lastTick ${snapshot.world.lastTick} !== ${ticks}`);
  }

  const commitStarted = wallMs();
  await saveDirty(repository, snapshot, dirty);
  pruneHotSnapshot(snapshot);
  clearDirty(dirty);
  const commitMs = wallMs() - commitStarted;

  const livingAtEnd = aliveCount(snapshot.creatures);
  const totalMs = worldgenMs + stepMs + commitMs;

  return {
    seed,
    livingAtStart,
    livingAtEnd,
    ticks,
    lastTick: snapshot.world.lastTick,
    worldgenMs,
    stepMs,
    commitMs,
    totalMs,
    recordedAt: new Date().toISOString(),
  };
}

/** Round timings for a durable results document. */
export function formatScaleRehearsalTiming(
  timing: ScaleRehearsalTiming,
): ScaleRehearsalTiming {
  const round = (ms: number) => Math.round(ms * 1000) / 1000;
  return {
    ...timing,
    worldgenMs: round(timing.worldgenMs),
    stepMs: round(timing.stepMs),
    commitMs: round(timing.commitMs),
    totalMs: round(timing.totalMs),
  };
}
