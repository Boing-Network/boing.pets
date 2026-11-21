/**
 * Live-save health for the host runtime: consecutive failures, exponential
 * backoff between retries, and the status `/healthz` reports.
 *
 * The world keeps ticking in memory while saves fail; the dirty window is
 * kept and re-sent (as a replay) once the database answers again.
 */

export type PersistenceState = "ok" | "retrying" | "down";

export type PersistenceStatus = {
  /** "retrying" while saves fail; "down" once they have failed for `downAfterMs`. */
  db: PersistenceState;
  /** Last world tick known durable. */
  lastSavedTick: number;
  /** Seconds since the last successful save (null before the first one). */
  lastSaveAgoS: number | null;
  /** Ticks simulated in memory that are not yet durable. */
  unsavedTicks: number;
  /** Consecutive failed save attempts (0 when healthy). */
  saveFailures: number;
  /** Failed save attempts since launch. */
  totalSaveFailures: number;
  /** Seconds until the next retry (null when healthy). */
  nextRetryInS: number | null;
  /** Last save error message (null when healthy). */
  lastError: string | null;
};

export type SaveTrackerOptions = {
  /** First retry delay. Default 1s. */
  baseDelayMs?: number;
  /** Backoff cap. Default 60s. */
  maxDelayMs?: number;
  /** Report "down" (unhealthy) after failing this long. Default 10 min. */
  downAfterMs?: number;
};

export type SaveTracker = {
  /** True while the last save attempt failed. */
  failing(): boolean;
  /** True when a save may be attempted now (always, unless backing off). */
  due(nowMs: number): boolean;
  /** Delay before the next retry, given the current failure count. */
  retryDelayMs(): number;
  succeeded(tick: number, nowMs: number): void;
  failed(error: unknown, nowMs: number): void;
  status(currentTick: number, nowMs: number): PersistenceStatus;
};

export const SAVE_RETRY_BASE_MS = 1_000;
export const SAVE_RETRY_MAX_MS = 60_000;
export const SAVE_DOWN_AFTER_MS = 10 * 60_000;

export function createSaveTracker(
  initialTick: number,
  initialMs: number,
  options: SaveTrackerOptions = {},
): SaveTracker {
  const baseDelayMs = options.baseDelayMs ?? SAVE_RETRY_BASE_MS;
  const maxDelayMs = options.maxDelayMs ?? SAVE_RETRY_MAX_MS;
  const downAfterMs = options.downAfterMs ?? SAVE_DOWN_AFTER_MS;
  let lastSavedTick = initialTick;
  let lastSavedMs: number | null = initialMs;
  let failures = 0;
  let totalFailures = 0;
  let failingSinceMs: number | null = null;
  let nextAttemptMs = 0;
  let lastError: string | null = null;

  const tracker: SaveTracker = {
    failing: () => failures > 0,
    due: (nowMs) => failures === 0 || nowMs >= nextAttemptMs,
    retryDelayMs: () =>
      failures === 0
        ? 0
        : Math.min(maxDelayMs, baseDelayMs * 2 ** Math.min(failures - 1, 30)),
    succeeded(tick, nowMs) {
      lastSavedTick = tick;
      lastSavedMs = nowMs;
      failures = 0;
      failingSinceMs = null;
      nextAttemptMs = 0;
      lastError = null;
    },
    failed(error, nowMs) {
      failures += 1;
      totalFailures += 1;
      failingSinceMs ??= nowMs;
      lastError = describeError(error);
      nextAttemptMs = nowMs + tracker.retryDelayMs();
    },
    status(currentTick, nowMs) {
      const db: PersistenceState =
        failures === 0
          ? "ok"
          : failingSinceMs != null && nowMs - failingSinceMs >= downAfterMs
            ? "down"
            : "retrying";
      return {
        db,
        lastSavedTick,
        lastSaveAgoS:
          lastSavedMs == null
            ? null
            : Math.max(0, Math.round((nowMs - lastSavedMs) / 1000)),
        unsavedTicks: Math.max(0, currentTick - lastSavedTick),
        saveFailures: failures,
        totalSaveFailures: totalFailures,
        nextRetryInS:
          failures === 0
            ? null
            : Math.max(0, Math.ceil((nextAttemptMs - nowMs) / 1000)),
        lastError,
      };
    },
  };
  return tracker;
}

/** One-line error text for logs and health (no stack, bounded length). */
export function describeError(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.name === "Error" ? "" : `${error.name}: `}${error.message}`
      : String(error);
  // Never echo connection strings (they can carry credentials).
  const line = raw
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`]+/gi, "<url>")
    .replace(/\s+/g, " ")
    .trim();
  return line.length > 200 ? `${line.slice(0, 197)}...` : line;
}
