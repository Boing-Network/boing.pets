/**
 * "Your creatures": the ones a player chose to follow, the journal of what
 * happened to them, and what changed since the last visit. Pure, so it is
 * unit-tested; `state/followStore.ts` keeps it in the browser.
 *
 * Following is a bookmark kept in this browser, per world. It is not
 * ownership: it grants nothing on the server.
 */
import {
  CreatureStatus,
  EventKind,
  type WorldEventView,
} from "@boing-pets/contract";
import { creatureCondition } from "./condition";

/** Enough for a family; few enough that "yours" stays meaningful. */
export const FOLLOW_LIMIT = 12;

export type FollowEntry = {
  /** Followed creature ids, in the order they were followed. */
  ids: number[];
  /** World tick when the player last had this world open. */
  lastSeenTick: number;
  /** The "choose a creature to follow" prompt was turned down. */
  promptDismissed: boolean;
};

/** One entry per world, keyed by `worldKey`. */
export type FollowBook = Record<string, FollowEntry>;

export const EMPTY_FOLLOW_ENTRY: FollowEntry = {
  ids: [],
  lastSeenTick: 0,
  promptDismissed: false,
};

/** Ids restart in a new world, so the seed is part of the key. */
export function worldKey(worldId: number, seed: number): string {
  return `${worldId}:${seed}`;
}

function cleanIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const value of raw) {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      continue;
    }
    if (!out.includes(value)) out.push(value);
  }
  return out.slice(0, FOLLOW_LIMIT);
}

/** Stored JSON back to a book; anything malformed is dropped. */
export function parseFollowBook(raw: string | null | undefined): FollowBook {
  if (raw == null) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {};
  }
  const book: FollowBook = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const row = value as Record<string, unknown>;
    const tick = row.lastSeenTick;
    book[key] = {
      ids: cleanIds(row.ids),
      lastSeenTick:
        typeof tick === "number" && Number.isFinite(tick) && tick > 0
          ? Math.floor(tick)
          : 0,
      promptDismissed: row.promptDismissed === true,
    };
  }
  return book;
}

export function entryFor(book: FollowBook, key: string | null): FollowEntry {
  return (key != null ? book[key] : undefined) ?? EMPTY_FOLLOW_ENTRY;
}

/**
 * Follow or unfollow. Following past `FOLLOW_LIMIT` changes nothing (the
 * same entry comes back), so the caller can tell the player why.
 */
export function toggleFollow(entry: FollowEntry, id: number): FollowEntry {
  if (entry.ids.includes(id)) {
    return { ...entry, ids: entry.ids.filter((row) => row !== id) };
  }
  if (entry.ids.length >= FOLLOW_LIMIT) return entry;
  return { ...entry, ids: [...entry.ids, id] };
}

/**
 * Whether an event is about one of these creatures: it acted, it was acted
 * on (a mate, an attacker's victim), or it became a parent.
 */
export function isAbout(
  event: WorldEventView,
  ids: ReadonlySet<number>,
): boolean {
  if (ids.size === 0) return false;
  if (event.actorId != null && ids.has(event.actorId)) return true;
  if (event.subjectId != null && ids.has(event.subjectId)) return true;
  const payload = event.payload as {
    motherId?: number | null;
    fatherId?: number | null;
  } | null;
  if (payload == null) return false;
  return (
    (payload.motherId != null && ids.has(payload.motherId)) ||
    (payload.fatherId != null && ids.has(payload.fatherId))
  );
}

/**
 * The journal: what happened to the followed creatures, newest first. Item
 * finds and meals are everyday activity and stay in the Inspector.
 */
export function journalLines(
  sources: ReadonlyArray<readonly WorldEventView[]>,
  ids: ReadonlySet<number>,
  limit = 60,
): WorldEventView[] {
  const byId = new Map<number, WorldEventView>();
  for (const events of sources) {
    for (const event of events) {
      if (event.kind === EventKind.ITEM) continue;
      if (!isAbout(event, ids)) continue;
      byId.set(event.id, event);
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.tick - a.tick || b.id - a.id)
    .slice(0, limit);
}

/** Journal lines from after the last visit, oldest first. */
export function sinceLastVisit(
  events: readonly WorldEventView[],
  ids: ReadonlySet<number>,
  lastSeenTick: number,
  limit = 8,
): WorldEventView[] {
  const lines = journalLines([events], ids, Number.MAX_SAFE_INTEGER).filter(
    (event) => event.tick > lastSeenTick,
  );
  // Newest `limit`, told in the order they happened.
  return lines.slice(0, limit).reverse();
}

export type FollowCandidate = {
  id: number;
  name: string;
  speciesId: number;
  status: string;
  ageDays: number;
  health?: number;
  sick?: boolean;
  needs?: { hunger: number; thirst: number };
  family?: { generation: number };
};

export type FollowSuggestion<T> = { creature: T; reason: string };

/**
 * Up to three creatures worth following first, each for a different reason:
 * one that needs help, the youngest, and the one with the longest line
 * behind it. Ties go to the lower id so the choice is stable.
 */
export function suggestFollows<T extends FollowCandidate>(
  creatures: readonly T[],
): FollowSuggestion<T>[] {
  const living = creatures
    .filter((row) => row.status === CreatureStatus.ALIVE)
    .slice()
    .sort((a, b) => a.id - b.id);
  const out: FollowSuggestion<T>[] = [];
  const taken = new Set<number>();
  const add = (creature: T | undefined, reason: string) => {
    if (!creature || taken.has(creature.id)) return;
    taken.add(creature.id);
    out.push({ creature, reason });
  };

  const best = (rows: readonly T[], score: (row: T) => number) => {
    let pick: T | undefined;
    let top = Number.NEGATIVE_INFINITY;
    for (const row of rows) {
      if (taken.has(row.id)) continue;
      const value = score(row);
      if (pick === undefined || value > top) {
        pick = row;
        top = value;
      }
    }
    return pick;
  };

  const needy = living.filter((row) => creatureCondition(row).level > 0);
  const worst = best(needy, (row) => -(row.health ?? 1000));
  if (worst) {
    add(worst, `needs help: ${creatureCondition(worst).reasons.join(", ")}`);
  }
  add(
    best(living, (row) => -row.ageDays),
    "the youngest in the world",
  );
  const elder = best(living, (row) => row.family?.generation ?? 0);
  if (elder) {
    const generation = elder.family?.generation ?? 0;
    add(
      elder,
      generation > 0
        ? `generation ${generation} of its line`
        : "a founder of its line",
    );
  }
  // A quiet world may give fewer distinct reasons: fill from the top.
  for (const row of living) {
    if (out.length >= 3) break;
    add(row, "one of the first here");
  }
  return out.slice(0, 3);
}
