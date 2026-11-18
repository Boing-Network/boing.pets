/**
 * Sim host: clock, persistence, and (later) IPC. Single writer.
 * M12 lands offline catch-up and CatchupReport on the same step() path.
 */
export {
  catchupOnLaunch,
  runCatchup,
  type CatchupProgress,
  type RunCatchupOptions,
} from "./catchup";
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
