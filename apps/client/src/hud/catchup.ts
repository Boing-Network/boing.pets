/**
 * "While you were away" report: pure helpers (formatting + seen tracking) so
 * the panel stays a thin view and the rules are testable without a DOM.
 */
import type { CatchupReport } from "@boing-pets/contract";

/** Sim minutes per tick at 1x (ruleset msPerTick 60 000). */
const MINUTES_PER_TICK = 1;

/** "3 days 4 hours" of world time for a tick span (whole hours, min 1h). */
export function formatWorldSpan(
  ticks: number,
  minutesPerTick = MINUTES_PER_TICK,
): string {
  const totalHours = Math.max(1, Math.round((ticks * minutesPerTick) / 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days === 0) return part(hours, "hour");
  return hours === 0
    ? part(days, "day")
    : `${part(days, "day")} ${part(hours, "hour")}`;
}

export type CatchupLine = { label: string; count: number };

/** Non-zero tallies in a fixed order. */
export function catchupLines(report: CatchupReport): CatchupLine[] {
  const s = report.summary;
  return [
    { label: "births", count: s.births },
    { label: "deaths", count: s.deaths },
    { label: "matings", count: s.matings },
    { label: "migrations", count: s.migrations },
    { label: "discoveries", count: s.discoveries },
    { label: "creatures wounded", count: s.injuries ?? 0 },
    { label: "outbreaks of sickness", count: s.outbreaks ?? 0 },
    { label: "item finds and uses", count: s.items ?? 0 },
  ].filter((line) => line.count > 0);
}

/** Stable key for "already shown" (a report id is per world database). */
export function catchupKey(report: CatchupReport): string {
  return `living-pets:catchup-seen:${report.worldId}:${report.id}:${report.toTick}`;
}

type SeenStore = Pick<Storage, "getItem" | "setItem">;

export function catchupSeen(
  report: CatchupReport,
  storage: SeenStore | null,
): boolean {
  try {
    return storage?.getItem(catchupKey(report)) === "1";
  } catch {
    return false;
  }
}

export function markCatchupSeen(
  report: CatchupReport,
  storage: SeenStore | null,
): void {
  try {
    storage?.setItem(catchupKey(report), "1");
  } catch {
    // Private mode / quota: the panel just shows again next time.
  }
}
