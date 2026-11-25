/**
 * Goal progress per world, remembered in this browser. The rules are in
 * `hud/goals.ts`. `noteGoal` can be called from anywhere a player does
 * something a goal counts.
 */
import { create } from "zustand";
import {
  factsFor,
  newlyReached,
  noteFact,
  parseGoalBook,
  type Goal,
  type GoalBook,
  type GoalFact,
} from "../hud/goals";
import { worldKey } from "../hud/follow";
import { useWorldViewStore } from "./worldViewStore";

const KEY = "living-pets.goals.v1";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function load(): GoalBook {
  try {
    return parseGoalBook(storage()?.getItem(KEY));
  } catch {
    return {};
  }
}

type GoalState = {
  book: GoalBook;
  /** The goal reached most recently, for a brief notice. */
  reached: { goal: Goal; atMs: number } | null;
  /** A rename waiting to be seen in the world before it counts. */
  pendingName: { creatureId: number; name: string } | null;
  note: (key: string, fact: GoalFact, amount?: number) => void;
  expectName: (creatureId: number, name: string) => void;
  clearPendingName: () => void;
  clearReached: () => void;
};

export const useGoalStore = create<GoalState>((set, get) => ({
  book: load(),
  reached: null,
  pendingName: null,

  note(key, fact, amount = 1) {
    const before = factsFor(get().book, key);
    const after = noteFact(before, fact, amount);
    if (after === before) return;
    const book = { ...get().book, [key]: after };
    const reached = newlyReached(before, after);
    const last = reached[reached.length - 1];
    set({
      book,
      ...(last ? { reached: { goal: last, atMs: Date.now() } } : {}),
    });
    try {
      storage()?.setItem(KEY, JSON.stringify(book));
    } catch {
      // Storage can be blocked; progress then lasts for this page load.
    }
  },

  expectName(creatureId, name) {
    set({ pendingName: { creatureId, name } });
  },
  clearPendingName() {
    set({ pendingName: null });
  },
  clearReached() {
    set({ reached: null });
  },
}));

/** Count something toward the goals of the world on screen. */
export function noteGoal(fact: GoalFact, amount = 1): void {
  const world = useWorldViewStore.getState().view?.world;
  if (!world) return;
  useGoalStore.getState().note(worldKey(world.id, world.seed), fact, amount);
}
