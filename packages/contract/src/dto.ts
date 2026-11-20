import type {
  Action,
  ActionTargetKind,
  CreatureStatus,
  DeathCause,
  EventKind,
  EventTemplate,
  Gender,
  Goal,
  InfluenceKind,
  MemoryKind,
  MemoryTag,
  MigrationReason,
  RelationshipLabel,
} from "./enums";

export type GeneticProfile = {
  strength: number;
  speed: number;
  intelligence: number;
  curiosity: number;
  sociability: number;
  extra: Record<string, number>;
};

export type PersonalityProfile = {
  curiosity: number;
  aggression: number;
  loyalty: number;
  sociability: number;
  bravery: number;
  riskTaking: number;
  extra: Record<string, number>;
};

/** Deficits. A high number pushes the matching goal. Health is not a need. */
export type Needs = {
  hunger: number;
  thirst: number;
  fatigue: number;
  discomfort: number;
  unsafety: number;
  loneliness: number;
};

export type MemoryPayload = {
  tags: MemoryTag[];
  template: string;
};

export type MemoryView = {
  id: number;
  tick: number;
  kind: MemoryKind;
  importance: number;
  emotionalValue: number;
  strength: number;
  subjectCreatureId: number | null;
  territoryId: number | null;
  payload: MemoryPayload;
};

export type RelationshipView = {
  id: number;
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
  labels: RelationshipLabel[];
};

/**
 * Inspection object exposed by panels and `WorldView`.
 * Territory and the action slot are included so a patch can place and lerp
 * a token. The lerp itself stays in the client and is not saved.
 */
export type CreatureView = {
  id: number;
  name: string;
  ageDays: number;
  speciesId: number;
  gender: Gender;
  status: CreatureStatus;
  genes: GeneticProfile;
  personality: PersonalityProfile;
  memories: MemoryView[];
  relationships: RelationshipView[];
  needs: Needs;
  currentGoal: Goal;
  family: {
    motherId: number | null;
    fatherId: number | null;
    lineageId: number;
    generation: number;
  };
  territoryId: number;
  currentAction: Action | null;
  actionTargetKind: ActionTargetKind;
  actionTargetId: number | null;
  actionStartedTick: number | null;
  actionEndsTick: number | null;
  /**
   * Authoritative position (see `positions.ts`): the current movement leg
   * runs from `fromSpot` (in `territoryId`) to `spot` over the action window.
   * For RELOCATE, `spot` is in the destination territory.
   */
  spotX: number;
  spotZ: number;
  fromSpotX: number;
  fromSpotZ: number;
};

export type GeneMutation = {
  gene: string;
  delta: number;
  rare: boolean;
};

export type BirthEventPayload = {
  template: typeof EventTemplate.BIRTH | typeof EventTemplate.BIRTH_FOUNDER;
  motherId: number | null;
  fatherId: number | null;
  lineageId: number;
  speciesId: number;
  genes: GeneticProfile;
  mutations: GeneMutation[];
  territoryId: number;
};

export type DeathEventPayload = {
  template: typeof EventTemplate.DEATH;
  cause: DeathCause;
  ageDays: number;
  territoryId: number;
  gestationLost: boolean;
};

export type MatingEventPayload = {
  template: typeof EventTemplate.MATING;
  motherId: number;
  fatherId: number;
  territoryId: number;
  relationshipScore: number;
};

export type DiscoveryEventPayload = {
  template: typeof EventTemplate.DISCOVERY;
  creatureId: number;
  territoryId: number;
  lineageId: number;
};

export type MigrationEventPayload = {
  template: typeof EventTemplate.MIGRATION;
  creatureId: number;
  fromTerritoryId: number;
  toTerritoryId: number;
  reason: MigrationReason;
};

export type EventPayload =
  | BirthEventPayload
  | DeathEventPayload
  | MatingEventPayload
  | DiscoveryEventPayload
  | MigrationEventPayload;

export type WorldEventView = {
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

/** Base columns plus the effective stats the client must not recompute. */
export type TerritoryView = {
  id: number;
  slug: string;
  name: string;
  foodAbundance: number;
  danger: number;
  capacity: number;
  food: number;
  effectiveDanger: number;
  population: number;
};

export type TerritoryLinkView = {
  fromId: number;
  toId: number;
  travelTicks: number;
};

export type LineageView = {
  id: number;
  name: string;
  speciesId: number;
  founderCreatureId: number | null;
  foundedTick: number;
  playerFavor: number;
  extinct: boolean;
};

export type WorldView = {
  world: {
    id: number;
    name: string;
    seed: number;
    schemaVersion: number;
    rulesetVersion: number;
    lastTick: number;
    clockAtMs: number;
  };
  creatures: CreatureView[];
  relationships: RelationshipView[];
  territories: TerritoryView[];
  links: TerritoryLinkView[];
  lineages: LineageView[];
  events: WorldEventView[];
};

/** Changed rows only. The client replaces these rows in its cache. */
/**
 * Only the top-level fields of a creature that changed since the previous
 * emit. Nested objects (needs, memories, ...) are replaced whole.
 */
export type CreatureDelta = { id: number } & Partial<Omit<CreatureView, "id">>;

export type WorldPatch = {
  tick: number;
  /** Full rows: creatures the listeners have not seen yet. */
  creatures: CreatureView[];
  /** Changed fields of creatures the listeners already hold. */
  creatureDeltas?: CreatureDelta[];
  relationships: RelationshipView[];
  events: WorldEventView[];
  territories: TerritoryView[];
};

function replaceById<T extends { id: number }>(
  current: T[],
  incoming: readonly T[],
): T[] {
  if (incoming.length === 0) return current;
  const map = new Map(current.map((row) => [row.id, row] as const));
  for (const row of incoming) map.set(row.id, row);
  return [...map.values()].sort((a, b) => a.id - b.id);
}

/**
 * Merge a live patch into a view: full rows replace by id, deltas overlay the
 * row already held. A delta for an unknown creature is skipped (the next
 * keyframe snapshot or a resync heals it) and counted in `skipped`.
 */
export function applyWorldPatch(
  view: WorldView,
  patch: WorldPatch,
): { view: WorldView; skipped: number } {
  const creatures = new Map(view.creatures.map((c) => [c.id, c] as const));
  for (const creature of patch.creatures) creatures.set(creature.id, creature);
  let skipped = 0;
  for (const delta of patch.creatureDeltas ?? []) {
    const current = creatures.get(delta.id);
    if (current == null) {
      skipped += 1;
      continue;
    }
    creatures.set(delta.id, { ...current, ...delta });
  }
  return {
    skipped,
    view: {
      ...view,
      world: { ...view.world, lastTick: patch.tick },
      creatures: [...creatures.values()].sort((a, b) => a.id - b.id),
      relationships: replaceById(view.relationships, patch.relationships),
      events: replaceById(view.events, patch.events),
      territories: replaceById(view.territories, patch.territories),
    },
  };
}

export type CatchupNotable = {
  eventId: number;
  tick: number;
  summary: string;
};

export type CatchupSummary = {
  fromTick: number;
  toTick: number;
  births: number;
  deaths: number;
  matings: number;
  migrations: number;
  discoveries: number;
  notable: CatchupNotable[];
};

export type CatchupReport = {
  id: number;
  worldId: number;
  fromTick: number;
  toTick: number;
  createdAtMs: number;
  summary: CatchupSummary;
};

export type NameCreaturePayload = { creatureId: number; name: string };
export type NameLineagePayload = { lineageId: number; name: string };
export type FavorBloodlinePayload = { lineageId: number };
export type EnrichTerritoryPayload = { territoryId: number };
export type CalmTerritoryPayload = { territoryId: number };

export type InfluenceSubmit =
  | {
      kind: typeof InfluenceKind.NAME_CREATURE;
      payload: NameCreaturePayload;
    }
  | {
      kind: typeof InfluenceKind.NAME_LINEAGE;
      payload: NameLineagePayload;
    }
  | {
      kind: typeof InfluenceKind.FAVOR_BLOODLINE;
      payload: FavorBloodlinePayload;
    }
  | {
      kind: typeof InfluenceKind.ENRICH_TERRITORY;
      payload: EnrichTerritoryPayload;
    }
  | {
      kind: typeof InfluenceKind.CALM_TERRITORY;
      payload: CalmTerritoryPayload;
    };

export type InfluencePayload = InfluenceSubmit["payload"];

export type FamilyQueryResult = {
  children: CreatureView[];
  siblings: CreatureView[];
  ancestors: Array<{ creature: CreatureView; depth: number }>;
  descendants: Array<{ creature: CreatureView; depth: number }>;
};

export type CreatureQueryResult = CreatureView;

export type LineageQueryResult = {
  lineage: LineageView;
  members: CreatureView[];
  extinct: boolean;
};

export type EventsQueryResult = {
  events: WorldEventView[];
};
