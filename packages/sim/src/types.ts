import type {
  Action,
  ActionTargetKind,
  CreatureStatus,
  DeathCause,
  Diet,
  Gender,
  Goal,
  InfluenceKind,
  InfluencePayload,
  MemoryKind,
  MemoryPayload,
  ModifierKind,
  Ruleset,
  WorldEventView,
} from "@boing-pets/contract";

export type WorldHeader = {
  id: number;
  name: string;
  seed: number;
  schemaVersion: number;
  rulesetVersion: number;
  lastTick: number;
  clockAtMs: number;
  nextCreatureId: number;
  nextMemoryId: number;
  nextRelationshipId: number;
  nextEventId: number;
  nextLineageId: number;
  nextModifierId: number;
  nextTerritoryId: number;
  nextInfluenceId: number;
};

export type SpeciesRow = {
  id: number;
  worldId: number;
  slug: string;
  displayName: string;
  diet: Diet;
  maturityDays: number;
  baseLifespanDays: number;
  gestationDays: number;
  juvenileDays: number;
  baseCuriosity: number;
  baseAggression: number;
  baseLoyalty: number;
  baseSociability: number;
  baseBravery: number;
  baseRiskTaking: number;
  colorHex: string;
};

export type CompatibilityRow = {
  worldId: number;
  speciesLowId: number;
  speciesHighId: number;
  fertility: number;
};

export type TerritoryRow = {
  id: number;
  worldId: number;
  slug: string;
  name: string;
  foodAbundance: number;
  danger: number;
  capacity: number;
};

export type TerritoryLinkRow = {
  worldId: number;
  fromId: number;
  toId: number;
  travelTicks: number;
};

/** A lineage already has a DISCOVERY for this territory. */
export type DiscoveryRow = {
  lineageId: number;
  territoryId: number;
};

export type TerritoryModifierRow = {
  id: number;
  worldId: number;
  territoryId: number;
  kind: ModifierKind;
  amount: number;
  startTick: number;
  endTick: number;
  sourceInfluenceId: number | null;
};

export type LineageRow = {
  id: number;
  worldId: number;
  founderCreatureId: number | null;
  speciesId: number;
  name: string;
  foundedTick: number;
  playerFavor: number;
};

export type CreatureRow = {
  id: number;
  worldId: number;
  name: string;
  nameGivenByPlayer: boolean;
  speciesId: number;
  gender: Gender;
  status: CreatureStatus;
  birthTick: number;
  deathTick: number | null;
  deathCause: DeathCause | null;
  territoryId: number;
  lineageId: number;
  motherId: number | null;
  fatherId: number | null;
  generation: number;
  geneStrength: number;
  geneSpeed: number;
  geneIntelligence: number;
  geneCuriosity: number;
  geneSociability: number;
  genesExtra: Record<string, number>;
  traitCuriosity: number;
  traitAggression: number;
  traitLoyalty: number;
  traitSociability: number;
  traitBravery: number;
  traitRiskTaking: number;
  personalityExtra: Record<string, number>;
  hunger: number;
  thirst: number;
  fatigue: number;
  discomfort: number;
  unsafety: number;
  loneliness: number;
  health: number;
  currentGoal: Goal;
  currentAction: Action | null;
  actionTargetKind: ActionTargetKind;
  actionTargetId: number | null;
  actionStartedTick: number | null;
  actionEndsTick: number | null;
  gestationSireId: number | null;
  gestationEndTick: number | null;
  mateCooldownUntilTick: number | null;
  /**
   * Where the current movement leg ends, in territory-local permille of the
   * region radius (see `ai/movement.ts`). For RELOCATE this is in the
   * destination territory; otherwise in `territoryId`. A spot with length
   * over 1000 is a shoreline spot addressed by angle.
   */
  spotX: number;
  spotZ: number;
  /** Where the current leg started, in `territoryId` coordinates. */
  fromSpotX: number;
  fromSpotZ: number;
};

export type RelationshipRow = {
  id: number;
  worldId: number;
  creatureAId: number;
  creatureBId: number;
  score: number;
  friendship: number;
  romance: number;
  trust: number;
  cooperation: number;
  avoidance: number;
  conflict: number;
  metTick: number;
  lastInteractionTick: number;
  interactionCount: number;
};

export type MemoryRow = {
  id: number;
  worldId: number;
  creatureId: number;
  tick: number;
  kind: MemoryKind;
  importance: number;
  emotionalValue: number;
  initialStrength: number;
  subjectCreatureId: number | null;
  territoryId: number | null;
  payload: MemoryPayload;
  archived: boolean;
};

/** Same shape the host sends to the client. The kernel does not keep history in RAM. */
export type WorldEvent = WorldEventView;

export type PlayerInfluenceRow = {
  id: number;
  worldId: number;
  kind: InfluenceKind;
  issuedAtTick: number;
  payload: InfluencePayload;
  applied: boolean;
};

export type WorldSnapshot = {
  world: WorldHeader;
  ruleset: Ruleset;
  species: SpeciesRow[];
  compatibility: CompatibilityRow[];
  territories: TerritoryRow[];
  links: TerritoryLinkRow[];
  /**
   * Lineage discoveries step can see. Worldgen stores founder homes here
   * because DISCOVERY events are not reloaded into the kernel.
   */
  discoveries: DiscoveryRow[];
  modifiers: TerritoryModifierRow[];
  lineages: LineageRow[];
  creatures: CreatureRow[];
  relationships: RelationshipRow[];
  memories: MemoryRow[];
  pendingInfluences: PlayerInfluenceRow[];
};

export type StepResult = {
  snapshot: WorldSnapshot;
  events: WorldEvent[];
};
