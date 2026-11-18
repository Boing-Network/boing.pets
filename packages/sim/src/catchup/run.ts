/**
 * Offline catch-up kernel loop: the same `step()` as live play, N times.
 * Persistence and wall-clock `clockAt` stay in the host.
 */
import { step } from "../kernel/step";
import type { WorldEvent, WorldSnapshot } from "../types";

export type RunStepsResult = {
  snapshot: WorldSnapshot;
  events: WorldEvent[];
};

/**
 * Advance `ticks` times via `step`. Mutates `snapshot` in place (same as live).
 * Returns every event from the gap, in tick then id order.
 */
export function runSteps(
  snapshot: WorldSnapshot,
  ticks: number,
): RunStepsResult {
  if (ticks < 0) throw new Error("ticks");
  if (!Number.isInteger(ticks)) throw new Error("ticks");
  const events: WorldEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const result = step(snapshot);
    for (const event of result.events) events.push(event);
  }
  return { snapshot, events };
}

/** Ticks owed when wall-now is ahead of canonical `clockAt`. */
export function owedTicks(
  nowMs: number,
  clockAtMs: number,
  msPerTick: number,
): number {
  if (msPerTick <= 0) throw new Error("msPerTick");
  if (!Number.isInteger(msPerTick)) throw new Error("msPerTick");
  if (nowMs <= clockAtMs) return 0;
  return Math.floor((nowMs - clockAtMs) / msPerTick);
}
