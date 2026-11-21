/**
 * Map durable / hot rows into the `WorldView` the renderer caches.
 * Derived fields (age, effective territory stats, relationship labels,
 * memory strength, lineage extinction) are computed here — never in the client.
 */
import {
  CreatureStatus,
  RelationshipLabel,
  type CreatureView,
  type LineageView,
  type MemoryView,
  type RelationshipView,
  type Ruleset,
  type TerritoryEffectView,
  type TerritoryView,
  type WorldEventView,
  type WorldView,
} from "@boing-pets/contract";
import {
  aggregateTerritories,
  resourceStock,
  memoryStrength,
  type CreatureRow,
  type LineageRow,
  type MemoryRow,
  type RelationshipRow,
  type WorldSnapshot,
} from "@boing-pets/sim";

export function relationshipLabels(row: RelationshipRow): RelationshipLabel[] {
  const labels: RelationshipLabel[] = [];
  const inConflict = row.conflict >= 500;
  if (inConflict) {
    labels.push(RelationshipLabel.IN_CONFLICT);
  } else if (row.friendship >= 600 && row.conflict < 200 && row.score >= 200) {
    labels.push(RelationshipLabel.FRIEND);
  }
  if (row.romance >= 400 && row.score >= 300 && row.conflict < 400) {
    labels.push(RelationshipLabel.MATE_POTENTIAL);
  }
  if (row.cooperation >= 500) {
    labels.push(RelationshipLabel.COOPERATIVE);
  }
  if (row.avoidance >= 500 || row.score <= -200) {
    labels.push(RelationshipLabel.AVOIDING);
  }
  return labels;
}

export function toRelationshipView(row: RelationshipRow): RelationshipView {
  return {
    id: row.id,
    creatureAId: row.creatureAId,
    creatureBId: row.creatureBId,
    score: row.score,
    friendship: row.friendship,
    romance: row.romance,
    trust: row.trust,
    cooperation: row.cooperation,
    avoidance: row.avoidance,
    conflict: row.conflict,
    metTick: row.metTick,
    lastInteractionTick: row.lastInteractionTick,
    interactionCount: row.interactionCount,
    labels: relationshipLabels(row),
  };
}

export function toMemoryView(
  row: MemoryRow,
  tick: number,
  ruleset: Ruleset,
): MemoryView {
  return {
    id: row.id,
    tick: row.tick,
    kind: row.kind,
    importance: row.importance,
    emotionalValue: row.emotionalValue,
    strength: memoryStrength(row, tick, ruleset),
    subjectCreatureId: row.subjectCreatureId,
    territoryId: row.territoryId,
    payload: row.payload,
  };
}

function ageDays(
  creature: CreatureRow,
  tick: number,
  ticksPerDay: number,
): number {
  return Math.floor((tick - creature.birthTick) / ticksPerDay);
}

/**
 * Inspection DTO for one creature. Used by `world.snapshot` patches and by
 * `query.creature` / `query.family` (including dead rows absent from the hot set).
 */
export function toCreatureView(
  creature: CreatureRow,
  tick: number,
  ruleset: Ruleset,
  relationships: RelationshipView[],
  memories: MemoryView[],
): CreatureView {
  return {
    id: creature.id,
    name: creature.name,
    ageDays: ageDays(creature, tick, ruleset.ticksPerDay),
    speciesId: creature.speciesId,
    gender: creature.gender,
    status: creature.status,
    genes: {
      strength: creature.geneStrength,
      speed: creature.geneSpeed,
      intelligence: creature.geneIntelligence,
      curiosity: creature.geneCuriosity,
      sociability: creature.geneSociability,
      extra: { ...creature.genesExtra },
    },
    personality: {
      curiosity: creature.traitCuriosity,
      aggression: creature.traitAggression,
      loyalty: creature.traitLoyalty,
      sociability: creature.traitSociability,
      bravery: creature.traitBravery,
      riskTaking: creature.traitRiskTaking,
      extra: { ...creature.personalityExtra },
    },
    memories,
    relationships,
    needs: {
      hunger: creature.hunger,
      thirst: creature.thirst,
      fatigue: creature.fatigue,
      discomfort: creature.discomfort,
      unsafety: creature.unsafety,
      loneliness: creature.loneliness,
    },
    currentGoal: creature.currentGoal,
    family: {
      motherId: creature.motherId,
      fatherId: creature.fatherId,
      lineageId: creature.lineageId,
      generation: creature.generation,
    },
    territoryId: creature.territoryId,
    currentAction: creature.currentAction,
    actionTargetKind: creature.actionTargetKind,
    actionTargetId: creature.actionTargetId,
    actionStartedTick: creature.actionStartedTick,
    actionEndsTick: creature.actionEndsTick,
    spotX: creature.spotX,
    spotZ: creature.spotZ,
    fromSpotX: creature.fromSpotX,
    fromSpotZ: creature.fromSpotZ,
  };
}

function lineageExtinct(
  lineage: LineageRow,
  creatures: CreatureRow[],
): boolean {
  return !creatures.some(
    (c) => c.lineageId === lineage.id && c.status === CreatureStatus.ALIVE,
  );
}

function toLineageView(
  lineage: LineageRow,
  creatures: CreatureRow[],
): LineageView {
  return {
    id: lineage.id,
    name: lineage.name,
    speciesId: lineage.speciesId,
    founderCreatureId: lineage.founderCreatureId,
    foundedTick: lineage.foundedTick,
    playerFavor: lineage.playerFavor,
    extinct: lineageExtinct(lineage, creatures),
  };
}

/** M22 overlays: active effects by kind and the gather stock, when present. */
function territoryItemExtras(
  snapshot: WorldSnapshot,
  territoryId: number,
  tick: number,
): Pick<TerritoryView, "effects" | "resource"> {
  const byKind = new Map<TerritoryEffectView["kind"], TerritoryEffectView>();
  for (const modifier of snapshot.modifiers) {
    if (modifier.territoryId !== territoryId) continue;
    if (modifier.startTick > tick || tick >= modifier.endTick) continue;
    const kind = modifier.kind as TerritoryEffectView["kind"];
    const row = byKind.get(kind) ?? { kind, amount: 0, endTick: 0 };
    row.amount += modifier.amount;
    row.endTick = Math.max(row.endTick, modifier.endTick);
    byKind.set(kind, row);
  }
  const order: TerritoryEffectView["kind"][] = [
    "FOOD",
    "DANGER",
    "COMFORT",
    "HARVEST",
  ];
  const effects = order.flatMap((kind) => {
    const row = byKind.get(kind);
    return row ? [row] : [];
  });
  const stock = resourceStock(snapshot, territoryId, tick + 1);
  return {
    ...(effects.length > 0 ? { effects } : {}),
    ...(stock
      ? { resource: { slug: stock.resource, free: stock.free, cap: stock.cap } }
      : {}),
  };
}

function toTerritoryViews(snapshot: WorldSnapshot): TerritoryView[] {
  const tick = snapshot.world.lastTick;
  const stats = aggregateTerritories(snapshot, tick);
  return snapshot.territories
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((territory) => {
      const effective = stats.get(territory.id);
      if (!effective) {
        throw new Error(`missing territory stats ${territory.id}`);
      }
      return {
        id: territory.id,
        slug: territory.slug,
        name: territory.name,
        foodAbundance: territory.foodAbundance,
        danger: territory.danger,
        capacity: territory.capacity,
        food: effective.food,
        effectiveDanger: effective.danger,
        population: effective.population,
        ...territoryItemExtras(snapshot, territory.id, tick),
      };
    });
}

/**
 * Build the full view DTO the host sends on `world.snapshot`.
 * `events` are recent feed rows (not the hot kernel list).
 */
export function buildWorldView(
  snapshot: WorldSnapshot,
  events: WorldEventView[] = [],
): WorldView {
  const tick = snapshot.world.lastTick;
  const relationshipViews = snapshot.relationships
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(toRelationshipView);

  const relationshipsByCreature = new Map<number, RelationshipView[]>();
  for (const rel of relationshipViews) {
    const forA = relationshipsByCreature.get(rel.creatureAId) ?? [];
    forA.push(rel);
    relationshipsByCreature.set(rel.creatureAId, forA);
    const forB = relationshipsByCreature.get(rel.creatureBId) ?? [];
    forB.push(rel);
    relationshipsByCreature.set(rel.creatureBId, forB);
  }

  const memoriesByCreature = new Map<number, MemoryView[]>();
  for (const memory of snapshot.memories) {
    if (memory.archived) continue;
    const list = memoriesByCreature.get(memory.creatureId) ?? [];
    list.push(toMemoryView(memory, tick, snapshot.ruleset));
    memoriesByCreature.set(memory.creatureId, list);
  }
  for (const list of memoriesByCreature.values()) {
    list.sort((a, b) => a.id - b.id);
  }

  const creatures = snapshot.creatures
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((creature) =>
      toCreatureView(
        creature,
        tick,
        snapshot.ruleset,
        relationshipsByCreature.get(creature.id) ?? [],
        memoriesByCreature.get(creature.id) ?? [],
      ),
    );

  return {
    world: {
      id: snapshot.world.id,
      name: snapshot.world.name,
      seed: snapshot.world.seed,
      schemaVersion: snapshot.world.schemaVersion,
      rulesetVersion: snapshot.world.rulesetVersion,
      lastTick: snapshot.world.lastTick,
      clockAtMs: snapshot.world.clockAtMs,
    },
    creatures,
    relationships: relationshipViews,
    territories: toTerritoryViews(snapshot),
    links: snapshot.links
      .slice()
      .sort((a, b) => a.fromId - b.fromId || a.toId - b.toId)
      .map((link) => ({
        fromId: link.fromId,
        toId: link.toId,
        travelTicks: link.travelTicks,
      })),
    lineages: snapshot.lineages
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((lineage) => toLineageView(lineage, snapshot.creatures)),
    events: events.slice().sort((a, b) => a.tick - b.tick || a.id - b.id),
  };
}
