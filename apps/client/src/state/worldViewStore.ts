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
import { applyWorldPatch } from "@boing-pets/contract";
import {
  capEvents,
  EMPTY_EVENT_LOG,
  recordEvents,
  type EventLog,
} from "./eventLog";

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
  /**
   * Recent world events for the news feed. Kept apart from `view.events`,
   * which a full snapshot resets.
   */
  eventLog: EventLog;
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
  eventLog: EMPTY_EVENT_LOG,
  connection: "local",
  session: null,
  lastNotice: null,

  setSnapshot(view) {
    // The first snapshot of a world is history: logged, but not "new". A
    // later one is a keyframe standing in for a patch, and the host puts
    // that tick's events in it, so those are news like any patch's.
    const live = get().view?.world.id === view.world.id;
    set({
      view,
      eventLog: recordEvents(get().eventLog, view.world.id, view.events, live),
    });
  },

  applyPatch(patch) {
    const current = get().view;
    if (!current) return;
    // Dead creatures stay in the cache for lineage lookups; events do not
    // need to, so only the newest are kept.
    const next = applyWorldPatch(current, patch).view;
    set({
      view: { ...next, events: capEvents(next.events) },
      eventLog: recordEvents(
        get().eventLog,
        current.world.id,
        patch.events,
        true,
      ),
    });
  },

  applyHostMessage(message) {
    switch (message.message) {
      case "world.snapshot":
        get().setSnapshot(message.body);
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
