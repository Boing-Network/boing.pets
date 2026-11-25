export {
  HAZARD_RULES,
  applyHazard,
  hazardChance,
  recoverPerTick,
} from "./kernel/hazards";
export { step } from "./kernel/step";
export { applyInfluences } from "./kernel/influences";
export { aggregateTerritories } from "./kernel/territories";
export {
  activeHarvestUnits,
  gatherYield,
  relicTriggers,
  resourceStock,
  type RelicTrigger,
  type ResourceStock,
} from "./kernel/items";
export {
  creatureLootsToday,
  lootCheck,
  planCreatureAutonomy,
  wantedItems,
  type AutonomyBag,
  type AutonomyIntent,
  type LootCheck,
} from "./kernel/autonomy";
export { createWorld } from "./worldgen/create-world";
export {
  INTRODUCED_FOUNDERS_PER_SPECIES,
  introduceSpecies,
  speciesUpToDate,
} from "./worldgen/introduce-species";
export type { IntroduceSpeciesResult } from "./worldgen/introduce-species";
export {
  TERRITORY_CAPACITY_VERSION,
  territoryCapacitiesUpToDate,
  upgradeTerritoryCapacities,
} from "./worldgen/upgrade-territory-capacities";
export type {
  TerritoryCapacityChange,
  UpgradeTerritoryCapacitiesResult,
} from "./worldgen/upgrade-territory-capacities";
export {
  biologyFor,
  dietFoodBase,
  perceivedDanger,
  type BiologyProfile,
} from "./kernel/biology";
export {
  LINK_CATALOG,
  SPECIES as WORLDGEN_SPECIES,
  TERRITORY_CATALOG,
  speciesCatalogRow,
} from "./worldgen/catalog";
export type {
  LinkCatalogRow,
  SpeciesCatalogRow,
  TerritoryCatalogRow,
  TerritorySlug,
} from "./worldgen/catalog";
export {
  createScaleWorld,
  livingCountsPerSpecies,
} from "./worldgen/create-scale-world";
export { RULESET_V1 } from "./ruleset";
export { canonicalHash, canonicalJson } from "./hash";
export { RNG_DOMAINS, fnv1a64, rngInt, splitmix64 } from "./rng";
export { buildCatchupSummary, catchupEventRank } from "./catchup/summary";
export { owedTicks, runSteps } from "./catchup/run";
export type { RunStepsResult } from "./catchup/run";
export {
  MVP_GENES,
  generateName,
  inheritGenes,
  inheritPersonality,
  mutationDelta,
  rollGender,
} from "./genetics/inherit";
export { resolveBirths } from "./kernel/birth";
export {
  createFounderLineage,
  generationForChild,
  lineageIdForChild,
} from "./family/lineage";
export {
  courtAccepts,
  resolveCourt,
  resolveDrink,
  resolveForage,
  resolveGuard,
} from "./ai/actions";
export {
  MEMORY_DECAY_LUT,
  initialMemoryStrength,
  memoryResidue,
  memoryStrength,
} from "./memories/strength";
export { isMemoryThrottled } from "./memories/throttle";
export { hotMemories, memoryTermForGoal } from "./memories/score";
export {
  applyContestDelta,
  applyCooperateForageDelta,
  applyCourtAcceptDelta,
  applyCourtRejectDelta,
  applyGiftDelta,
  applyGuardOffspringDelta,
  applyRescueDelta,
  applySnubDelta,
  applySocializeDelta,
  createParentChildRelationship,
  createRelationship,
  ensureRelationship,
  findRelationship,
  orderedPairIds,
  touchInteraction,
} from "./relationships/delta";
export {
  applyRelationshipDecay,
  decayQuietRelationships,
} from "./relationships/decay";
export type { RngDomain } from "./rng";
export type { CreateWorldResult } from "./worldgen/create-world";
export type {
  CompatibilityRow,
  CreatureRow,
  DiscoveryRow,
  LineageRow,
  MemoryRow,
  PlayerInfluenceRow,
  RelationshipRow,
  SpeciesRow,
  StepResult,
  TerritoryLinkRow,
  TerritoryModifierRow,
  TerritoryRow,
  WorldEvent,
  WorldHeader,
  WorldSnapshot,
} from "./types";
export {
  POSITIONS_SCHEMA_VERSION,
  clampToLand,
  nestSpot,
  placeAt,
  planMove,
  settleSpot,
  upgradeSnapshotPositions,
  type Spot,
} from "./ai/movement";
