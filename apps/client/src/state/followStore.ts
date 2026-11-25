/**
 * The creatures this player follows, per world, remembered in this browser.
 * The rules are in `hud/follow.ts`; this is only the storage and the store.
 */
import { create } from "zustand";
import type { WorldEventView } from "@boing-pets/contract";
import {
  entryFor,
  parseFollowBook,
  toggleFollow,
  type FollowBook,
  type FollowEntry,
} from "../hud/follow";

const KEY = "living-pets.follow.v1";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function load(): FollowBook {
  try {
    return parseFollowBook(storage()?.getItem(KEY));
  } catch {
    return {};
  }
}

function save(book: FollowBook): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(book));
  } catch {
    // Storage can be blocked; the choice then lasts for this page load.
  }
}

type FollowState = {
  book: FollowBook;
  /**
   * Recent durable events fetched once per visit, so the journal has a past
   * and a newly followed creature shows its recent days at once.
   */
  history: readonly WorldEventView[];
  /** `lastSeenTick` as it was when this visit began, per world key. */
  visitStartedAt: Record<string, number>;
  toggle: (key: string, creatureId: number) => boolean;
  dismissPrompt: (key: string) => void;
  /** Remember how far the player has seen; keeps the visit's starting point. */
  markSeen: (key: string, tick: number) => void;
  setHistory: (events: readonly WorldEventView[]) => void;
};

function withEntry(
  book: FollowBook,
  key: string,
  change: (entry: FollowEntry) => FollowEntry,
): FollowBook {
  return { ...book, [key]: change(entryFor(book, key)) };
}

export const useFollowStore = create<FollowState>((set, get) => ({
  book: load(),
  history: [],
  visitStartedAt: {},

  toggle(key, creatureId) {
    const before = entryFor(get().book, key);
    const after = toggleFollow(before, creatureId);
    if (after === before) return false;
    const book = { ...get().book, [key]: after };
    set({ book });
    save(book);
    return true;
  },

  dismissPrompt(key) {
    const book = withEntry(get().book, key, (entry) => ({
      ...entry,
      promptDismissed: true,
    }));
    set({ book });
    save(book);
  },

  markSeen(key, tick) {
    const entry = entryFor(get().book, key);
    const started = get().visitStartedAt;
    const visitStartedAt =
      key in started ? started : { ...started, [key]: entry.lastSeenTick };
    if (tick <= entry.lastSeenTick && visitStartedAt === started) return;
    const book = withEntry(get().book, key, (row) => ({
      ...row,
      lastSeenTick: Math.max(row.lastSeenTick, tick),
    }));
    set({ book, visitStartedAt });
    save(book);
  },

  setHistory(events) {
    set({ history: events });
  },
}));
