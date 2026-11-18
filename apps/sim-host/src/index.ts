/**
 * Sim host: clock, persistence, and (later) IPC. Single writer.
 * M13 lands pause and time scale on top of M12 catch-up.
 */
export {
  catchupOnLaunch,
  runCatchup,
  type CatchupProgress,
  type RunCatchupOptions,
} from "./catchup";
export {
  advanceClock,
  clockView,
  createHostClock,
  isTimeScale,
  noteLiveCommit,
  pauseClock,
  persistPauseSnap,
  quitAndPersist,
  quitStamp,
  resumeClock,
  setClockScale,
  tickWhilePaused,
  LIVE_COMMIT_TICKS,
  LIVE_COMMIT_WALL_MS,
  PAUSE_SNAP_INTERVAL_MS,
  type AdvanceResult,
  type HostClock,
  type HostClockOptions,
  type PauseTickResult,
} from "./clock";
export {
  clearDirty,
  createDirtySet,
  dirtyCreatures,
  dirtyLineages,
  dirtyRelationships,
  markAfterTick,
  newCreatures,
  newMemories,
  newModifiers,
  newRelationships,
  pruneHotSnapshot,
  snapshotCursors,
  type DirtySet,
  type IdCursors,
} from "./persist/dirty";
export {
  loadSnapshot,
  SchemaTooNewError,
  tablesToSnapshot,
} from "./persist/load";
export { MemoryWorldRepository } from "./persist/memory-repository";
export type {
  CommitBatch,
  DurableTables,
  WorldRepository,
} from "./persist/repository";
export {
  buildCommitBatch,
  collectArchiveIds,
  saveDirty,
  saveWorldgen,
  worldgenTables,
} from "./persist/save";
export {
  bootSession,
  commitSession,
  killSession,
  runBatch,
  stepSession,
  type HostSession,
} from "./session";
