import type {
  CatchupReport,
  CreatureQueryResult,
  EventsQueryResult,
  FamilyQueryResult,
  InfluenceSubmit,
  LineageQueryResult,
  WorldPatch,
  WorldView,
} from "./dto";
import type { TimeScale } from "./enums";
import type { InventoryView, ItemCraft } from "./items";

export type WorldClock = {
  tick: number;
  paused: boolean;
  scale: TimeScale;
  clockAt: number;
  /** Sim ms per tick (ruleset). With `scale`, clients derive tick progress. */
  msPerTick: number;
};

export type QueryFamily = { creatureId: number };
export type QueryCreature = { creatureId: number };
export type QueryLineage = { lineageId: number };
export type QueryEvents = {
  worldId: number;
  fromTick: number;
  toTick: number;
  limit: number;
};

/**
 * Multiplayer session join (M22). Auth stub: a non-empty accountId is enough.
 * Local single-player / Electron / browser-worker paths do not require this.
 */
export type SessionJoin = {
  accountId: string;
};

/** Owner may pause / rescale the shared world; players may only influence. */
export type SessionRole = "owner" | "player";

export type SessionWelcome = {
  sessionId: string;
  accountId: string;
  worldId: number;
  tick: number;
  /** Shared-world role. Local single-player hosts are always the owner. */
  role?: SessionRole;
  displayName?: string;
};

export type SessionRejected = {
  reason:
    "invalid_account" | "already_joined" | "host_not_ready" | "invalid_token";
};

/** Non-fatal per-client notice (multiplayer): the command did not apply. */
export type SessionNotice = {
  code:
    | "not_owner"
    | "rate_limited"
    | "influence_rejected"
    | "invalid_message"
    | "item_rejected";
  detail: string;
};

/** Renderer to host. Queries are request/response; clock and influence are commands. */
export type ClientToHost =
  | { message: "session.join"; body: SessionJoin }
  | { message: "session.leave"; body: Record<string, never> }
  | { message: "clock.pause"; body: Record<string, never> }
  | { message: "clock.resume"; body: Record<string, never> }
  | { message: "clock.setScale"; body: { scale: TimeScale } }
  | { message: "influence.submit"; body: InfluenceSubmit }
  | { message: "item.craft"; body: ItemCraft }
  | { message: "query.inventory"; body: Record<string, never> }
  | { message: "query.family"; body: QueryFamily }
  | { message: "query.creature"; body: QueryCreature }
  | { message: "query.lineage"; body: QueryLineage }
  | { message: "query.events"; body: QueryEvents };

export type QueryResult =
  | { message: "query.family"; body: FamilyQueryResult }
  | { message: "query.creature"; body: CreatureQueryResult }
  | { message: "query.lineage"; body: LineageQueryResult }
  | { message: "query.events"; body: EventsQueryResult }
  | { message: "query.inventory"; body: InventoryView };

/** Host to renderer. */
export type HostToClient =
  | { message: "session.welcome"; body: SessionWelcome }
  | { message: "session.rejected"; body: SessionRejected }
  | { message: "session.notice"; body: SessionNotice }
  | { message: "world.snapshot"; body: WorldView }
  | { message: "world.patch"; body: WorldPatch }
  | { message: "world.catchup"; body: CatchupReport }
  | { message: "world.clock"; body: WorldClock };

export type IpcMessage = ClientToHost | HostToClient | QueryResult;
