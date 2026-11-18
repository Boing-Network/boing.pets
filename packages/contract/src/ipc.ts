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

export type WorldClock = {
  tick: number;
  paused: boolean;
  scale: TimeScale;
  clockAt: number;
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

/** Renderer to host. Queries are request/response; clock and influence are commands. */
export type ClientToHost =
  | { message: "clock.pause"; body: Record<string, never> }
  | { message: "clock.resume"; body: Record<string, never> }
  | { message: "clock.setScale"; body: { scale: TimeScale } }
  | { message: "influence.submit"; body: InfluenceSubmit }
  | { message: "query.family"; body: QueryFamily }
  | { message: "query.creature"; body: QueryCreature }
  | { message: "query.lineage"; body: QueryLineage }
  | { message: "query.events"; body: QueryEvents };

export type QueryResult =
  | { message: "query.family"; body: FamilyQueryResult }
  | { message: "query.creature"; body: CreatureQueryResult }
  | { message: "query.lineage"; body: LineageQueryResult }
  | { message: "query.events"; body: EventsQueryResult };

/** Host to renderer. */
export type HostToClient =
  | { message: "world.snapshot"; body: WorldView }
  | { message: "world.patch"; body: WorldPatch }
  | { message: "world.catchup"; body: CatchupReport }
  | { message: "world.clock"; body: WorldClock };

export type IpcMessage = ClientToHost | HostToClient | QueryResult;
