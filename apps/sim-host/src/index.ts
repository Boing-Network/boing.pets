/**
 * Sim host: clock, persistence, influences, WorldView mapping, and inspection IPC.
 * Single writer. Electron packaging (M18) drives the live runtime.
 * Boing NFT minting (M19+) attaches only at this host edge — never in step().
 */
export {
  birthMintJobsFromEvents,
  BOING_TESTNET_CHAIN_ID,
  createBoingNftClient,
  createDisabledBoingNftConfig,
  createDisabledMintEdge,
  createMintEdge,
  createMintEdgeFromEnv,
  createRepositoryNftLinkStore,
  DEFAULT_BOING_RPC_URL,
  DisabledBoingNftClient,
  enqueueBirthMintsAfterCommit,
  isRetryableMintStatus,
  isTerminalMintStatus,
  LIVING_PETS_COLLECTION_NAME,
  LIVING_PETS_COLLECTION_SYMBOL,
  MemoryCreatureNftLinkStore,
  NftMintStatus,
  readBoingNftConfig,
  SdkBoingNftClient,
  tokenIdHexForCreature,
  UNCONFIGURED_COLLECTION_HEX,
  type BoingCollectionDeployPlan,
  type BoingMintBatchPlan,
  type BoingMintSubmitResult,
  type BoingNftClient,
  type BoingNftConfig,
  type BoingNftProbeResult,
  type CreatureMintJob,
  type CreatureNftLinkRow,
  type CreatureNftLinkStore,
  type MintEdge,
  type QueuedCreatureMint,
} from "./boing";
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
  createFileHostMetaStore,
  type HostMeta,
  type HostMetaStore,
} from "./persist/host-meta";
export {
  loadSnapshot,
  SchemaTooNewError,
  tablesToSnapshot,
} from "./persist/load";
export { MemoryWorldRepository } from "./persist/memory-repository";
export {
  BROWSER_WORLD_STORAGE_KEY,
  BrowserWorldRepository,
  createIndexedDbStringStore,
  createMemoryStringStore,
  type BrowserStringStore,
  type BrowserWorldRepositoryOptions,
} from "./persist/browser-repository";
export {
  PrismaWorldRepository,
  type PrismaWorldRepositoryOptions,
} from "./persist/prisma-repository";
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
  createHostRuntime,
  type HostRuntime,
  type HostRuntimeEmit,
  type HostRuntimeOptions,
} from "./runtime/host-runtime";
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
