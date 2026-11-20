import {
  ActionTargetKind,
  CreatureStatus,
  Diet,
  Gender,
  Goal,
  type GeneticProfile,
  type Ruleset,
} from "@boing-pets/contract";
import { createFounderLineage } from "../family/lineage";
import { generateName } from "../genetics/inherit";
import { discoveryEvent, founderBirthEvent } from "../history/events";
import { assertInteger, clamp } from "../math";
import { rngInt } from "../rng";
import { RULESET_V1 } from "../ruleset";
import { LINK_CATALOG, SPECIES, TERRITORY_CATALOG } from "./catalog";
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
const SCHEMA_VERSION = 1;
const RULESET_VERSION = 1;

const GENE_SALTS = [0, 1, 2, 3, 4] as const;
/** Trait index order: curiosity, aggression, loyalty, sociability, bravery, risk taking. */
const TRAIT_SALT_BASE = 5;

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

function geneticProfile(creature: CreatureRow): GeneticProfile {
  return {
    strength: creature.geneStrength,
    speed: creature.geneSpeed,
    intelligence: creature.geneIntelligence,
    curiosity: creature.geneCuriosity,
    sociability: creature.geneSociability,
    extra: { ...creature.genesExtra },
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
    diet: Diet.HERBIVORE,
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
  // Ascending species id. Ids 1–3 were in slug order under their old names
  // (fernfox, mossback, pebblehare), so the original 12 founders keep their ids.
  const founderSpecies = [...SPECIES].sort((a, b) => a.id - b.id);

  for (const catalog of founderSpecies) {
    const home = territoryBySlug.get(catalog.home);
    if (!home) throw new Error("founder home");
    for (let index = 0; index < ruleset.founderCountPerSpecies; index += 1) {
      const creatureId = take("creature");
      const lineageId = take("lineage");
      const spread = ruleset.worldgenGeneSpread;
      const jitter = ruleset.worldgenTraitJitter;
      const gene = (salt: number) =>
        assertInteger(
          clamp(
            500 +
              rngInt(seed, 0, "worldgen", creatureId, salt, -spread, spread),
            0,
            1000,
          ),
          "gene",
        );
      const trait = (salt: number, base: number) =>
        assertInteger(
          clamp(
            base +
              rngInt(seed, 0, "worldgen", creatureId, salt, -jitter, jitter),
            0,
            1000,
          ),
          "trait",
        );
      const name = generateName(seed, 0, creatureId, usedNames);
      usedNames.add(name);
      const gender = index % 2 === 0 ? Gender.FEMALE : Gender.MALE;
      const creature: CreatureRow = {
        id: creatureId,
        worldId: WORLD_ID,
        name,
        nameGivenByPlayer: false,
        speciesId: catalog.id,
        gender,
        status: CreatureStatus.ALIVE,
        birthTick: 0,
        deathTick: null,
        deathCause: null,
        territoryId: home.id,
        lineageId,
        motherId: null,
        fatherId: null,
        generation: 0,
        geneStrength: gene(GENE_SALTS[0]),
        geneSpeed: gene(GENE_SALTS[1]),
        geneIntelligence: gene(GENE_SALTS[2]),
        geneCuriosity: gene(GENE_SALTS[3]),
        geneSociability: gene(GENE_SALTS[4]),
        genesExtra: {},
        traitCuriosity: trait(TRAIT_SALT_BASE + 0, catalog.baseCuriosity),
        traitAggression: trait(TRAIT_SALT_BASE + 1, catalog.baseAggression),
        traitLoyalty: trait(TRAIT_SALT_BASE + 2, catalog.baseLoyalty),
        traitSociability: trait(TRAIT_SALT_BASE + 3, catalog.baseSociability),
        traitBravery: trait(TRAIT_SALT_BASE + 4, catalog.baseBravery),
        traitRiskTaking: trait(TRAIT_SALT_BASE + 5, catalog.baseRiskTaking),
        personalityExtra: {},
        hunger: assertInteger(clamp(300, 0, 1000), "hunger"),
        thirst: assertInteger(clamp(300, 0, 1000), "thirst"),
        fatigue: assertInteger(clamp(200, 0, 1000), "fatigue"),
        discomfort: assertInteger(clamp(100, 0, 1000), "discomfort"),
        unsafety: assertInteger(
          clamp(Math.floor(home.danger / 5), 0, 1000),
          "unsafety",
        ),
        loneliness: assertInteger(clamp(200, 0, 1000), "loneliness"),
        health: assertInteger(clamp(850, 0, 1000), "health"),
        currentGoal: Goal.IDLE,
        currentAction: null,
        actionTargetKind: ActionTargetKind.NONE,
        actionTargetId: null,
        actionStartedTick: null,
        actionEndsTick: null,
        gestationSireId: null,
        gestationEndTick: null,
        mateCooldownUntilTick: null,
      };
      const lineage = createFounderLineage({
        id: lineageId,
        worldId: WORLD_ID,
        founderCreatureId: creatureId,
        speciesId: catalog.id,
        founderName: name,
        foundedTick: 0,
      });
      const genes = geneticProfile(creature);
      events.push(
        founderBirthEvent({
          id: take("event"),
          worldId: WORLD_ID,
          creatureId,
          lineageId,
          speciesId: catalog.id,
          territoryId: home.id,
          name,
          lineageStem: name,
          territoryName: home.name,
          genes,
        }),
        discoveryEvent({
          id: take("event"),
          worldId: WORLD_ID,
          tick: 0,
          creatureId,
          lineageId,
          territoryId: home.id,
          name,
          lineageName: lineage.name,
          territoryName: home.name,
        }),
      );
      creatures.push(creature);
      lineages.push(lineage);
      discoveries.push({ lineageId, territoryId: home.id });
    }
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
