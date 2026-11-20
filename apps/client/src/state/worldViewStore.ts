/**
 * Last host snapshot / patch cache. Authoritative creature state stays on the
 * host; this store only mirrors `WorldView` rows the host already derived.
 */
import { create } from "zustand";
import type {
  CatchupReport,
  CreatureView,
  SessionNotice,
  SessionRole,
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

function monotonicNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** How this client reaches its host. `local` = worker / Electron. */
export type ConnectionStatus =
  "local" | "connecting" | "live" | "reconnecting" | "offline";

export type SessionInfo = {
  accountId: string;
  displayName: string;
  role: SessionRole;
};

type WorldViewState = {
  view: WorldView | null;
  clock: WorldClock | null;
  /**
   * Local monotonic ms when the current tick's clock arrived. Motion derives
   * the fractional sim tick from it (see `estimateSimTick`).
   */
  clockReceivedAtMs: number;
  lastCatchup: CatchupReport | null;
  connection: ConnectionStatus;
  /** Shared-world session; null for local play (where you own the world). */
  session: SessionInfo | null;
  lastNotice: (SessionNotice & { atMs: number }) | null;
  applyHostMessage: (message: HostToClient) => void;
  setSnapshot: (view: WorldView) => void;
  applyPatch: (patch: WorldPatch) => void;
  livingCreatures: () => CreatureView[];
};

export const useWorldViewStore = create<WorldViewState>((set, get) => ({
  view: null,
  clock: null,
  clockReceivedAtMs: 0,
  lastCatchup: null,
  connection: "local",
  session: null,
  lastNotice: null,

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
      case "world.clock": {
        const previous = get().clock;
        const next = message.body;
        // A repeat of the same tick (e.g. after an influence) must not restart
        // the in-between-ticks fraction, or motion would stutter backwards.
        const sameTick =
          previous != null &&
          previous.tick === next.tick &&
          previous.paused === next.paused &&
          previous.scale === next.scale;
        set({
          clock: next,
          clockReceivedAtMs: sameTick
            ? get().clockReceivedAtMs
            : monotonicNowMs(),
        });
        break;
      }
      case "session.welcome":
        set({
          session: {
            accountId: message.body.accountId,
            displayName: message.body.displayName ?? message.body.accountId,
            role: message.body.role ?? "owner",
          },
        });
        break;
      case "session.notice":
        set({ lastNotice: { ...message.body, atMs: Date.now() } });
        break;
      case "session.rejected":
        // Rejections are handled by the transport (it reconnects or stops).
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
