/**
 * M17 scale rehearsal worldgen: a seeded world with exactly N living founders.
 * Same catalog and founder formulas as createWorld; not used for normal boot.
 */
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
import type { CreateWorldResult } from "./create-world";

const WORLD_ID = 1;
const WORLD_NAME = "Scale Rehearsal";
const SCHEMA_VERSION = 1;
const RULESET_VERSION = 1;

const GENE_SALTS = [0, 1, 2, 3, 4] as const;
const TRAIT_SALT_BASE = 5;

type SpeciesCatalog = {
  id: number;
  slug: string;
  displayName: string;
  home: string;
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

const SPECIES: SpeciesCatalog[] = [
  {
    id: 1,
    slug: "fernfox",
    displayName: "Fernfox",
    home: "meadow",
    maturityDays: 90,
    baseLifespanDays: 900,
    gestationDays: 18,
    juvenileDays: 16,
    baseCuriosity: 700,
    baseAggression: 350,
    baseLoyalty: 500,
    baseSociability: 600,
    baseBravery: 550,
    baseRiskTaking: 650,
    colorHex: "#E07A3D",
  },
  {
    id: 2,
    slug: "mossback",
    displayName: "Mossback",
    home: "thicket",
    maturityDays: 140,
    baseLifespanDays: 1400,
    gestationDays: 30,
    juvenileDays: 28,
    baseCuriosity: 300,
    baseAggression: 250,
    baseLoyalty: 750,
    baseSociability: 400,
    baseBravery: 400,
    baseRiskTaking: 200,
    colorHex: "#6B8F71",
  },
  {
    id: 3,
    slug: "pebblehare",
    displayName: "Pebblehare",
    home: "ridge",
    maturityDays: 70,
    baseLifespanDays: 700,
    gestationDays: 14,
    juvenileDays: 12,
    baseCuriosity: 550,
    baseAggression: 200,
    baseLoyalty: 400,
    baseSociability: 500,
    baseBravery: 300,
    baseRiskTaking: 500,
    colorHex: "#C2B280",
  },
];

/**
 * Same food/danger as the MVP catalog. Capacity is raised so a 5,000-creature
 * seed is not instantly overcrowded into permanent SEEK_SHELTER (formulas
 * unchanged — this is scale fixture data only).
 */
const SCALE_TERRITORY_CAPACITY = 2000;

const TERRITORY_CATALOG = [
  {
    slug: "meadow",
    name: "Meadow",
    foodAbundance: 700,
    danger: 200,
    capacity: SCALE_TERRITORY_CAPACITY,
  },
  {
    slug: "thicket",
    name: "Thicket",
    foodAbundance: 500,
    danger: 450,
    capacity: SCALE_TERRITORY_CAPACITY,
  },
  {
    slug: "ridge",
    name: "Ridge",
    foodAbundance: 350,
    danger: 700,
    capacity: SCALE_TERRITORY_CAPACITY,
  },
] as const;

const LINK_CATALOG = [
  { from: "meadow", to: "thicket", travelTicks: 6 },
  { from: "thicket", to: "meadow", travelTicks: 6 },
  { from: "thicket", to: "ridge", travelTicks: 8 },
  { from: "ridge", to: "thicket", travelTicks: 8 },
] as const;

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

/** Split `livingCount` across species in slug order; earlier species get the remainder. */
export function livingCountsPerSpecies(
  livingCount: number,
  speciesCount: number,
): number[] {
  if (livingCount < 1) throw new Error("livingCount");
  if (speciesCount < 1) throw new Error("speciesCount");
  const base = Math.floor(livingCount / speciesCount);
  const rem = livingCount % speciesCount;
  return Array.from(
    { length: speciesCount },
    (_, index) => base + (index < rem ? 1 : 0),
  );
}

/**
 * Pure scale worldgen. Produces exactly `livingCount` ALIVE founders at tick 0.
 * Default 5,000 for the M17 rehearsal. Seeded and deterministic like createWorld.
 */
export function createScaleWorld(
  seed: number,
  livingCount = 5000,
): CreateWorldResult {
  if (!Number.isInteger(livingCount) || livingCount < 1) {
    throw new Error("livingCount");
  }

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
  const founderSpecies = [...SPECIES].sort((a, b) =>
    a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0,
  );
  const perSpecies = livingCountsPerSpecies(livingCount, founderSpecies.length);

  for (
    let speciesIndex = 0;
    speciesIndex < founderSpecies.length;
    speciesIndex += 1
  ) {
    const catalog = founderSpecies[speciesIndex]!;
    const home = territoryBySlug.get(catalog.home);
    if (!home) throw new Error("founder home");
    const count = perSpecies[speciesIndex]!;
    for (let index = 0; index < count; index += 1) {
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
