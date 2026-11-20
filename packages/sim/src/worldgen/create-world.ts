import type { Ruleset } from "@boing-pets/contract";
import { POSITIONS_SCHEMA_VERSION } from "../ai/movement";
import { RULESET_V1 } from "../ruleset";
import { LINK_CATALOG, SPECIES, TERRITORY_CATALOG } from "./catalog";
import { spawnFounders } from "./founders";
import type {
  CompatibilityRow,
  CreatureRow,
  DiscoveryRow,
  LineageRow,
  SpeciesRow,
  TerritoryLinkRow,
  TerritoryRow,
  WorldEvent,
  WorldSnapshot,
} from "../types";

const WORLD_ID = 1;
const WORLD_NAME = "Living World";
const SCHEMA_VERSION = POSITIONS_SCHEMA_VERSION;
const RULESET_VERSION = 1;

export type CreateWorldResult = {
  snapshot: WorldSnapshot;
  events: WorldEvent[];
};

type Counters = {
  creature: number;
  memory: number;
  relationship: number;
  event: number;
  lineage: number;
  modifier: number;
  territory: number;
  influence: number;
};

function copyRuleset(rules: Ruleset): Ruleset {
  return {
    ...rules,
    extraGenes: [...rules.extraGenes],
    extraTraits: [...rules.extraTraits],
    timeScales: [...rules.timeScales],
  };
}

/**
 * Pure worldgen. Seed 1 is the founder fixture.
 * Events from this call stay at tick 0. The snapshot's `lastTick` is 0.
 * `clockAtMs` is 0 here; the host stamps wall time when it inserts the row.
 */
export function createWorld(seed: number): CreateWorldResult {
  const ruleset = copyRuleset(RULESET_V1);
  const next: Counters = {
    creature: 1,
    memory: 1,
    relationship: 1,
    event: 1,
    lineage: 1,
    modifier: 1,
    territory: 1,
    influence: 1,
  };
  const take = (key: keyof Counters): number => {
    const id = next[key];
    next[key] = id + 1;
    return id;
  };

  const territories: TerritoryRow[] = TERRITORY_CATALOG.map((row) => ({
    id: take("territory"),
    worldId: WORLD_ID,
    slug: row.slug,
    name: row.name,
    foodAbundance: row.foodAbundance,
    danger: row.danger,
    capacity: row.capacity,
  }));
  const territoryBySlug = new Map(territories.map((row) => [row.slug, row]));

  const links: TerritoryLinkRow[] = LINK_CATALOG.map((row) => {
    const from = territoryBySlug.get(row.from);
    const to = territoryBySlug.get(row.to);
    if (!from || !to) throw new Error("territory link");
    return {
      worldId: WORLD_ID,
      fromId: from.id,
      toId: to.id,
      travelTicks: row.travelTicks,
    };
  });

  const species: SpeciesRow[] = SPECIES.map((row) => ({
    id: row.id,
    worldId: WORLD_ID,
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
  }));

  const compatibility: CompatibilityRow[] = [];
  for (const low of species) {
    for (const high of species) {
      if (low.id > high.id) continue;
      compatibility.push({
        worldId: WORLD_ID,
        speciesLowId: low.id,
        speciesHighId: high.id,
        fertility: low.id === high.id ? 1000 : 0,
      });
    }
  }

  const creatures: CreatureRow[] = [];
  const lineages: LineageRow[] = [];
  const discoveries: DiscoveryRow[] = [];
  const events: WorldEvent[] = [];
  const usedNames = new Set<string>();
  // Ascending species id, `founderCountPerSpecies` (2: one female, one male)
  // founders each, placed in the species' home territory.
  const founderSpecies = [...SPECIES].sort((a, b) => a.id - b.id);

  for (const catalog of founderSpecies) {
    const home = territoryBySlug.get(catalog.home);
    if (!home) throw new Error("founder home");
    const spawned = spawnFounders({
      seed,
      tick: 0,
      worldId: WORLD_ID,
      catalog,
      home,
      count: ruleset.founderCountPerSpecies,
      rules: ruleset,
      usedNames,
      take,
    });
    creatures.push(...spawned.creatures);
    lineages.push(...spawned.lineages);
    events.push(...spawned.events);
    discoveries.push(...spawned.discoveries);
  }

  const snapshot: WorldSnapshot = {
    world: {
      id: WORLD_ID,
      name: WORLD_NAME,
      seed,
      schemaVersion: SCHEMA_VERSION,
      rulesetVersion: RULESET_VERSION,
      lastTick: 0,
      clockAtMs: 0,
      nextCreatureId: next.creature,
      nextMemoryId: next.memory,
      nextRelationshipId: next.relationship,
      nextEventId: next.event,
      nextLineageId: next.lineage,
      nextModifierId: next.modifier,
      nextTerritoryId: next.territory,
      nextInfluenceId: next.influence,
    },
    ruleset,
    species,
    compatibility,
    territories,
    links,
    discoveries,
    modifiers: [],
    lineages,
    creatures,
    relationships: [],
    memories: [],
    pendingInfluences: [],
  };

  return { snapshot, events };
}
