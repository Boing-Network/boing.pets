/**
 * Rolling log behind the "World news" feed. `view.events` cannot serve it:
 * the periodic full snapshot resets that list to [], and it also carries the
 * chatty per-creature ITEM rows the inspector shows. Pure, so the rules
 * (dedupe, cap, what counts as new) are unit-tested without a store.
 */
import { EventKind, type WorldEventView } from "@boing-pets/contract";

/** Lines kept. The feed shows a handful; the rest is scroll-back. */
export const EVENT_LOG_LIMIT = 50;

/** `view.events` rows kept by the store (see `capEvents`). */
export const VIEW_EVENTS_LIMIT = 200;

export type EventLog = {
  /** World the entries belong to; another world starts a fresh log. */
  worldId: number | null;
  /** Oldest first, unique by id, at most `EVENT_LOG_LIMIT`. */
  entries: readonly WorldEventView[];
  /**
   * Events that arrived live (in a patch) since this log began. Events already
   * in the first snapshot are history, not news, so they never count; the
   * feed derives its unread badge from this.
   */
  liveCount: number;
};

export const EMPTY_EVENT_LOG: EventLog = {
  worldId: null,
  entries: [],
  liveCount: 0,
};

/** Item rows kept for the inspector's activity lines. */
export const ITEM_LOG_LIMIT = 200;

/** Per-creature item activity: finds, crafts, gifts, meals. */
export function isItemEvent(event: WorldEventView): boolean {
  return event.kind === EventKind.ITEM;
}

/** World-level happenings. ITEM rows are per-creature activity, not news. */
export function isNewsEvent(event: WorldEventView): boolean {
  return event.kind !== EventKind.ITEM;
}

/**
 * Fold events into the log. `live` says whether they arrived in a patch (new)
 * or a snapshot (already happened before we looked). Returns the same object
 * when nothing changed, so store subscribers do not re-render.
 */
export function recordEvents(
  log: EventLog,
  worldId: number,
  events: readonly WorldEventView[],
  live: boolean,
  limit: number = EVENT_LOG_LIMIT,
  accept: (event: WorldEventView) => boolean = isNewsEvent,
): EventLog {
  const base = log.worldId === worldId ? log : { ...EMPTY_EVENT_LOG, worldId };
  const known = new Set(base.entries.map((event) => event.id));
  const added: WorldEventView[] = [];
  for (const event of events) {
    if (!accept(event) || known.has(event.id)) continue;
    known.add(event.id);
    added.push(event);
  }
  if (added.length === 0) return base;
  const sorted = [...base.entries, ...added].sort(
    (a, b) => a.tick - b.tick || a.id - b.id,
  );
  const entries = limit > 0 ? sorted.slice(-limit) : [];
  return {
    worldId,
    entries,
    liveCount: base.liveCount + (live ? added.length : 0),
  };
}

/**
 * `applyWorldPatch` appends every event forever; a long session would grow
 * without bound. Keep the newest rows (the list is sorted by id ascending).
 */
export function capEvents(
  events: WorldEventView[],
  limit: number = VIEW_EVENTS_LIMIT,
): WorldEventView[] {
  if (events.length <= limit) return events;
  return limit > 0 ? events.slice(-limit) : [];
}
