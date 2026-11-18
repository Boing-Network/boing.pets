/**
 * Sim host: clock, persistence, influences, WorldView mapping, and inspection IPC.
 * Single writer. M16 adds query.creature / query.family over durable rows.
 */
export {
  catchupOnLaunch,
  runCatchup,
  type CatchupProgress,
  type RunCatchupOptions,
} from "./catchup";
export {
  handleInspectionQuery,
  queryCreatureFromTables,
  queryEventsFromTables,
  queryFamilyFromTables,
  queryLineageFromTables,
} from "./ipc/queries";
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
  acceptedInWindow,
  beginCatchupGuard,
  canAcceptInfluence,
  createInfluenceGate,
  endCatchupGuard,
  loadInfluenceGate,
  pruneInfluenceGate,
  submitInfluence,
  INFLUENCE_RATE_LIMIT,
  INFLUENCE_RATE_WINDOW_MS,
  type InfluenceGate,
  type InfluenceSubmitOk,
  type InfluenceSubmitRejected,
  type InfluenceSubmitResult,
} from "./influence";
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
export { buildWorldView } from "./view/world-view";
export {
  formatScaleRehearsalTiming,
  runScaleRehearsal,
  SCALE_REHEARSAL_LIVING,
  SCALE_REHEARSAL_SEED,
  SCALE_REHEARSAL_TICKS,
  type ScaleRehearsalOptions,
  type ScaleRehearsalTiming,
} from "./scale-rehearsal";
