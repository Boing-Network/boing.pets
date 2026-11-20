/**
 * Last host snapshot / patch cache. Authoritative creature state stays on the
 * host; this store only mirrors `WorldView` rows the host already derived.
 */
import { create } from "zustand";
import type {
  CatchupReport,
  CreatureView,
  WorldClock,
  WorldPatch,
  WorldView,
} from "@boing-pets/contract";
import type { HostToClient } from "@boing-pets/contract";

function replaceById<T extends { id: number }>(
  current: T[],
  incoming: T[],
): T[] {
  if (incoming.length === 0) return current;
  const map = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) {
    map.set(row.id, row);
  }
  return [...map.values()].sort((a, b) => a.id - b.id);
}

type WorldViewState = {
  view: WorldView | null;
  clock: WorldClock | null;
  lastCatchup: CatchupReport | null;
  applyHostMessage: (message: HostToClient) => void;
  setSnapshot: (view: WorldView) => void;
  applyPatch: (patch: WorldPatch) => void;
  livingCreatures: () => CreatureView[];
};

export const useWorldViewStore = create<WorldViewState>((set, get) => ({
  view: null,
  clock: null,
  lastCatchup: null,

  setSnapshot(view) {
    set({ view });
  },

  applyPatch(patch) {
    const current = get().view;
    if (!current) return;
    const creatureMap = new Map(
      current.creatures.map((c) => [c.id, c] as const),
    );
    for (const creature of patch.creatures) {
      creatureMap.set(creature.id, creature);
    }
    // Dead creatures leave the map but stay in the cache for lineage later.
    set({
      view: {
        ...current,
        world: { ...current.world, lastTick: patch.tick },
        creatures: [...creatureMap.values()].sort((a, b) => a.id - b.id),
        relationships: replaceById(current.relationships, patch.relationships),
        events: replaceById(current.events, patch.events),
        territories: replaceById(current.territories, patch.territories),
      },
    });
  },

  applyHostMessage(message) {
    switch (message.message) {
      case "world.snapshot":
        set({ view: message.body });
        break;
      case "world.patch":
        get().applyPatch(message.body);
        break;
      case "world.catchup":
        set({ lastCatchup: message.body });
        break;
      case "world.clock":
        set({ clock: message.body });
        break;
      case "session.welcome":
      case "session.rejected":
        // Multiplayer session framing is handled by the transport, not the view cache.
        break;
      default: {
        const never: never = message;
        void never;
      }
    }
  },

  livingCreatures() {
    const view = get().view;
    if (!view) return [];
    return view.creatures.filter((c) => c.status === "ALIVE");
  },
}));
