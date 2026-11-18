/**
 * BigInt ↔ number and Prisma row ↔ kernel-shaped plain objects.
 * `step()` never sees a bigint. The host assembles these into a snapshot.
 */
import type {
  Action,
  ActionTargetKind,
  CreatureStatus,
  DeathCause,
  Diet,
  EventKind,
  EventPayload,
  Gender,
  Goal,
  InfluenceKind,
  InfluencePayload,
  MemoryKind,
  MemoryPayload,
  ModifierKind,
  Ruleset,
} from "@boing-pets/contract";
import type {
  Creature,
  Lineage,
  Memory,
  PlayerInfluence,
  Relationship,
  Species,
  SpeciesCompatibility,
  Territory,
  TerritoryLink,
  TerritoryModifier,
  World,
  WorldEvent,
} from "@prisma/client";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Prisma stores ids as BigInt; the kernel and IPC use safe integers. */
export function toNumber(value: bigint): number {
  if (value < 0n || value > MAX_SAFE) {
    throw new Error(`bigint out of safe integer range: ${value.toString()}`);
  }
  return Number(value);
}

export function toBigInt(value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`id is not a safe integer: ${value}`);
  }
  return BigInt(value);
}

export function toNumberOrNull(value: bigint | null): number | null {
  return value == null ? null : toNumber(value);
}

export function toBigIntOrNull(value: number | null): bigint | null {
  return value == null ? null : toBigInt(value);
}

export type MappedWorldHeader = {
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

export type MappedSpecies = {
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

export type MappedCompatibility = {
  worldId: number;
  speciesLowId: number;
  speciesHighId: number;
  fertility: number;
};

export type MappedTerritory = {
  id: number;
  worldId: number;
  slug: string;
  name: string;
  foodAbundance: number;
  danger: number;
  capacity: number;
};

export type MappedTerritoryLink = {
  worldId: number;
  fromId: number;
  toId: number;
  travelTicks: number;
};

export type MappedTerritoryModifier = {
  id: number;
  worldId: number;
  territoryId: number;
  kind: ModifierKind;
  amount: number;
  startTick: number;
  endTick: number;
  sourceInfluenceId: number | null;
};

export type MappedLineage = {
  id: number;
  worldId: number;
  founderCreatureId: number | null;
  speciesId: number;
  name: string;
  foundedTick: number;
  playerFavor: number;
};

export type MappedCreature = {
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
};

export type MappedRelationship = {
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

export type MappedMemory = {
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

export type MappedWorldEvent = {
  id: number;
  worldId: number;
  tick: number;
  kind: EventKind;
  actorId: number | null;
  subjectId: number | null;
  territoryId: number | null;
  lineageId: number | null;
  summary: string;
  payload: EventPayload;
};

export type MappedInfluence = {
  id: number;
  worldId: number;
  kind: InfluenceKind;
  issuedAtTick: number;
  payload: InfluencePayload;
  applied: boolean;
};

export type MappedDiscovery = {
  lineageId: number;
  territoryId: number;
};

function asNumberRecord(value: unknown): Record<string, number> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected number record json");
  }
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new Error(`expected number at ${key}`);
    }
    out[key] = entry;
  }
  return out;
}

function asRuleset(value: unknown): Ruleset {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected ruleset json");
  }
  return value as Ruleset;
}

function asMemoryPayload(value: unknown): MemoryPayload {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected memory payload");
  }
  return value as MemoryPayload;
}

function asEventPayload(value: unknown): EventPayload {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected event payload");
  }
  return value as EventPayload;
}

function asInfluencePayload(value: unknown): InfluencePayload {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected influence payload");
  }
  return value as InfluencePayload;
}

export function mapWorldHeader(row: World): MappedWorldHeader {
  return {
    id: toNumber(row.id),
    name: row.name,
    seed: toNumber(row.seed),
    schemaVersion: row.schemaVersion,
    rulesetVersion: row.rulesetVersion,
    lastTick: toNumber(row.lastTick),
    clockAtMs: row.clockAt.getTime(),
    nextCreatureId: toNumber(row.nextCreatureId),
    nextMemoryId: toNumber(row.nextMemoryId),
    nextRelationshipId: toNumber(row.nextRelationshipId),
    nextEventId: toNumber(row.nextEventId),
    nextLineageId: toNumber(row.nextLineageId),
    nextModifierId: toNumber(row.nextModifierId),
    nextTerritoryId: toNumber(row.nextTerritoryId),
    nextInfluenceId: toNumber(row.nextInfluenceId),
  };
}

export function mapRuleset(row: World): Ruleset {
  return asRuleset(row.ruleset);
}

export function mapSpecies(row: Species): MappedSpecies {
  return {
    id: toNumber(row.id),
    worldId: toNumber(row.worldId),
    slug: row.slug,
    displayName: row.displayName,
    diet: row.diet,
    maturityDays: row.maturityDays,
    baseLifespanDays: row.baseLifespanDays,
    gestationDays: row.gestationDays,
    juvenileDays: row.juvenileDays,
    baseCuriosity: row.baseCuriosity,
    baseAggression: row.baseAggression,
    baseLoyalty: row.baseLoyalty,
    baseSociability: row.baseSociability,
    baseBravery: row.baseBravery,
    baseRiskTaking: row.baseRiskTaking,
    colorHex: row.colorHex,
  };
}

export function mapCompatibility(
  row: SpeciesCompatibility,
): MappedCompatibility {
  return {
    worldId: toNumber(row.worldId),
    speciesLowId: toNumber(row.speciesLowId),
    speciesHighId: toNumber(row.speciesHighId),
    fertility: row.fertility,
  };
}

export function mapTerritory(row: Territory): MappedTerritory {
  return {
    id: toNumber(row.id),
    worldId: toNumber(row.worldId),
    slug: row.slug,
    name: row.name,
    foodAbundance: row.foodAbundance,
    danger: row.danger,
    capacity: row.capacity,
  };
}

export function mapTerritoryLink(row: TerritoryLink): MappedTerritoryLink {
  return {
    worldId: toNumber(row.worldId),
    fromId: toNumber(row.fromId),
    toId: toNumber(row.toId),
    travelTicks: row.travelTicks,
  };
}

export function mapTerritoryModifier(
  row: TerritoryModifier,
): MappedTerritoryModifier {
  return {
    id: toNumber(row.id),
    worldId: toNumber(row.worldId),
    territoryId: toNumber(row.territoryId),
    kind: row.kind,
    amount: row.amount,
    startTick: toNumber(row.startTick),
    endTick: toNumber(row.endTick),
    sourceInfluenceId: toNumberOrNull(row.sourceInfluenceId),
  };
}

export function mapLineage(row: Lineage): MappedLineage {
  return {
    id: toNumber(row.id),
    worldId: toNumber(row.worldId),
    founderCreatureId: toNumberOrNull(row.founderCreatureId),
    speciesId: toNumber(row.speciesId),
    name: row.name,
    foundedTick: toNumber(row.foundedTick),
    playerFavor: row.playerFavor,
  };
}

export function mapCreature(row: Creature): MappedCreature {
  return {
    id: toNumber(row.id),
    worldId: toNumber(row.worldId),
    name: row.name,
    nameGivenByPlayer: row.nameGivenByPlayer,
    speciesId: toNumber(row.speciesId),
    gender: row.gender,
    status: row.status,
    birthTick: toNumber(row.birthTick),
    deathTick: toNumberOrNull(row.deathTick),
    deathCause: row.deathCause,
    territoryId: toNumber(row.territoryId),
    lineageId: toNumber(row.lineageId),
    motherId: toNumberOrNull(row.motherId),
    fatherId: toNumberOrNull(row.fatherId),
    generation: row.generation,
    geneStrength: row.geneStrength,
    geneSpeed: row.geneSpeed,
    geneIntelligence: row.geneIntelligence,
    geneCuriosity: row.geneCuriosity,
    geneSociability: row.geneSociability,
    genesExtra: asNumberRecord(row.genesExtra),
    traitCuriosity: row.traitCuriosity,
    traitAggression: row.traitAggression,
    traitLoyalty: row.traitLoyalty,
    traitSociability: row.traitSociability,
    traitBravery: row.traitBravery,
    traitRiskTaking: row.traitRiskTaking,
    personalityExtra: asNumberRecord(row.personalityExtra),
    hunger: row.hunger,
    thirst: row.thirst,
    fatigue: row.fatigue,
    discomfort: row.discomfort,
    unsafety: row.unsafety,
    loneliness: row.loneliness,
    health: row.health,
    currentGoal: row.currentGoal,
    currentAction: row.currentAction,
    actionTargetKind: row.actionTargetKind,
    actionTargetId: toNumberOrNull(row.actionTargetId),
    actionStartedTick: toNumberOrNull(row.actionStartedTick),
    actionEndsTick: toNumberOrNull(row.actionEndsTick),
    gestationSireId: toNumberOrNull(row.gestationSireId),
    gestationEndTick: toNumberOrNull(row.gestationEndTick),
    mateCooldownUntilTick: toNumberOrNull(row.mateCooldownUntilTick),
  };
}

export function mapRelationship(row: Relationship): MappedRelationship {
  return {
    id: toNumber(row.id),
    worldId: toNumber(row.worldId),
    creatureAId: toNumber(row.creatureAId),
    creatureBId: toNumber(row.creatureBId),
    score: row.score,
    friendship: row.friendship,
    romance: row.romance,
    trust: row.trust,
    cooperation: row.cooperation,
    avoidance: row.avoidance,
    conflict: row.conflict,
    metTick: toNumber(row.metTick),
    lastInteractionTick: toNumber(row.lastInteractionTick),
    interactionCount: row.interactionCount,
  };
}

export function mapMemory(row: Memory): MappedMemory {
  return {
    id: toNumber(row.id),
    worldId: toNumber(row.worldId),
    creatureId: toNumber(row.creatureId),
    tick: toNumber(row.tick),
    kind: row.kind,
    importance: row.importance,
    emotionalValue: row.emotionalValue,
    initialStrength: row.initialStrength,
    subjectCreatureId: toNumberOrNull(row.subjectCreatureId),
    territoryId: toNumberOrNull(row.territoryId),
    payload: asMemoryPayload(row.payload),
    archived: row.archived,
  };
}

export function mapWorldEvent(row: WorldEvent): MappedWorldEvent {
  return {
    id: toNumber(row.id),
    worldId: toNumber(row.worldId),
    tick: toNumber(row.tick),
    kind: row.kind,
    actorId: toNumberOrNull(row.actorId),
    subjectId: toNumberOrNull(row.subjectId),
    territoryId: toNumberOrNull(row.territoryId),
    lineageId: toNumberOrNull(row.lineageId),
    summary: row.summary,
    payload: asEventPayload(row.payload),
  };
}

export function mapInfluence(row: PlayerInfluence): MappedInfluence {
  return {
    id: toNumber(row.id),
    worldId: toNumber(row.worldId),
    kind: row.kind,
    issuedAtTick: toNumber(row.issuedAtTick),
    payload: asInfluencePayload(row.payload),
    applied: row.applied,
  };
}

/**
 * Discoveries are not a table. Rebuild the hot set from immutable DISCOVERY
 * events so a relaunch does not depend on RAM left over from the previous
 * process.
 */
export function discoveriesFromEvents(
  events: readonly MappedWorldEvent[],
): MappedDiscovery[] {
  const seen = new Set<string>();
  const out: MappedDiscovery[] = [];
  const ordered = [...events].sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    return a.id - b.id;
  });
  for (const event of ordered) {
    if (event.kind !== "DISCOVERY") continue;
    if (event.lineageId == null || event.territoryId == null) {
      throw new Error("discovery event missing lineage or territory");
    }
    const key = `${event.lineageId}:${event.territoryId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      lineageId: event.lineageId,
      territoryId: event.territoryId,
    });
  }
  return out;
}

/** Explicit-id insert payload for a world header. Ids are never serial. */
export function worldHeaderToDb(header: MappedWorldHeader, ruleset: Ruleset) {
  return {
    id: toBigInt(header.id),
    name: header.name,
    seed: toBigInt(header.seed),
    schemaVersion: header.schemaVersion,
    rulesetVersion: header.rulesetVersion,
    ruleset,
    createdAt: new Date(header.clockAtMs),
    clockAt: new Date(header.clockAtMs),
    lastTick: toBigInt(header.lastTick),
    nextCreatureId: toBigInt(header.nextCreatureId),
    nextMemoryId: toBigInt(header.nextMemoryId),
    nextRelationshipId: toBigInt(header.nextRelationshipId),
    nextEventId: toBigInt(header.nextEventId),
    nextLineageId: toBigInt(header.nextLineageId),
    nextModifierId: toBigInt(header.nextModifierId),
    nextTerritoryId: toBigInt(header.nextTerritoryId),
    nextInfluenceId: toBigInt(header.nextInfluenceId),
  };
}

export function creatureToDb(row: MappedCreature) {
  return {
    id: toBigInt(row.id),
    worldId: toBigInt(row.worldId),
    name: row.name,
    nameGivenByPlayer: row.nameGivenByPlayer,
    speciesId: toBigInt(row.speciesId),
    gender: row.gender,
    status: row.status,
    birthTick: toBigInt(row.birthTick),
    deathTick: toBigIntOrNull(row.deathTick),
    deathCause: row.deathCause,
    territoryId: toBigInt(row.territoryId),
    lineageId: toBigInt(row.lineageId),
    motherId: toBigIntOrNull(row.motherId),
    fatherId: toBigIntOrNull(row.fatherId),
    generation: row.generation,
    geneStrength: row.geneStrength,
    geneSpeed: row.geneSpeed,
    geneIntelligence: row.geneIntelligence,
    geneCuriosity: row.geneCuriosity,
    geneSociability: row.geneSociability,
    genesExtra: row.genesExtra,
    traitCuriosity: row.traitCuriosity,
    traitAggression: row.traitAggression,
    traitLoyalty: row.traitLoyalty,
    traitSociability: row.traitSociability,
    traitBravery: row.traitBravery,
    traitRiskTaking: row.traitRiskTaking,
    personalityExtra: row.personalityExtra,
    hunger: row.hunger,
    thirst: row.thirst,
    fatigue: row.fatigue,
    discomfort: row.discomfort,
    unsafety: row.unsafety,
    loneliness: row.loneliness,
    health: row.health,
    currentGoal: row.currentGoal,
    currentAction: row.currentAction,
    actionTargetKind: row.actionTargetKind,
    actionTargetId: toBigIntOrNull(row.actionTargetId),
    actionStartedTick: toBigIntOrNull(row.actionStartedTick),
    actionEndsTick: toBigIntOrNull(row.actionEndsTick),
    gestationSireId: toBigIntOrNull(row.gestationSireId),
    gestationEndTick: toBigIntOrNull(row.gestationEndTick),
    mateCooldownUntilTick: toBigIntOrNull(row.mateCooldownUntilTick),
  };
}
