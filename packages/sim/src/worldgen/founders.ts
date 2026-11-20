/**
 * Founder construction shared by `createWorld` (tick 0) and
 * `introduceSpecies` (an existing world's `lastTick`). Pure and seed-keyed:
 * the same (seed, tick, ids) always yields the same founders.
 */
import {
  ActionTargetKind,
  CreatureStatus,
  Gender,
  Goal,
  type GeneticProfile,
  type Ruleset,
} from "@boing-pets/contract";
import { placeAt, settleSpot } from "../ai/movement";
import { createFounderLineage } from "../family/lineage";
import { generateName } from "../genetics/inherit";
import { discoveryEvent, founderBirthEvent } from "../history/events";
import { assertInteger, clamp } from "../math";
import { rngInt } from "../rng";
import type {
  CreatureRow,
  DiscoveryRow,
  LineageRow,
  TerritoryRow,
  WorldEvent,
} from "../types";
import type { SpeciesCatalogRow } from "./catalog";

const GENE_SALTS = [0, 1, 2, 3, 4] as const;
/** Trait index order: curiosity, aggression, loyalty, sociability, bravery, risk taking. */
const TRAIT_SALT_BASE = 5;

export type FounderIdKey = "creature" | "lineage" | "event";

export type SpawnedFounders = {
  creatures: CreatureRow[];
  lineages: LineageRow[];
  events: WorldEvent[];
  discoveries: DiscoveryRow[];
};

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
 * `count` founders of one species in its home territory. Even index is
 * FEMALE, odd is MALE. Founders arrive as young adults (just mature at
 * `tick`). Ids are drawn in order: creature, lineage, then two events.
 */
export function spawnFounders(input: {
  seed: number;
  tick: number;
  worldId: number;
  catalog: SpeciesCatalogRow;
  home: TerritoryRow;
  count: number;
  rules: Ruleset;
  usedNames: Set<string>;
  take: (key: FounderIdKey) => number;
}): SpawnedFounders {
  const { seed, tick, worldId, catalog, home, rules, usedNames, take } = input;
  const out: SpawnedFounders = {
    creatures: [],
    lineages: [],
    events: [],
    discoveries: [],
  };
  for (let index = 0; index < input.count; index += 1) {
    const creatureId = take("creature");
    const lineageId = take("lineage");
    const spread = rules.worldgenGeneSpread;
    const jitter = rules.worldgenTraitJitter;
    const gene = (salt: number, centre: number) =>
      assertInteger(
        clamp(
          centre +
            rngInt(seed, tick, "worldgen", creatureId, salt, -spread, spread),
          0,
          1000,
        ),
        "gene",
      );
    const trait = (salt: number, base: number) =>
      assertInteger(
        clamp(
          base +
            rngInt(seed, tick, "worldgen", creatureId, salt, -jitter, jitter),
          0,
          1000,
        ),
        "trait",
      );
    const name = generateName(seed, tick, creatureId, usedNames);
    usedNames.add(name);
    const gender = index % 2 === 0 ? Gender.FEMALE : Gender.MALE;
    const creature: CreatureRow = {
      id: creatureId,
      worldId,
      name,
      nameGivenByPlayer: false,
      speciesId: catalog.id,
      gender,
      status: CreatureStatus.ALIVE,
      // Founders arrive as young adults: just at maturity on `tick`.
      birthTick: tick - catalog.maturityDays * rules.ticksPerDay,
      deathTick: null,
      deathCause: null,
      territoryId: home.id,
      lineageId,
      motherId: null,
      fatherId: null,
      generation: 0,
      geneStrength: gene(GENE_SALTS[0], catalog.genes.strength),
      geneSpeed: gene(GENE_SALTS[1], catalog.genes.speed),
      geneIntelligence: gene(GENE_SALTS[2], catalog.genes.intelligence),
      geneCuriosity: gene(GENE_SALTS[3], catalog.genes.curiosity),
      geneSociability: gene(GENE_SALTS[4], catalog.genes.sociability),
      genesExtra: {},
      traitCuriosity: trait(TRAIT_SALT_BASE + 0, catalog.baseCuriosity),
      traitAggression: trait(TRAIT_SALT_BASE + 1, catalog.baseAggression),
      traitLoyalty: trait(TRAIT_SALT_BASE + 2, catalog.baseLoyalty),
      traitSociability: trait(TRAIT_SALT_BASE + 3, catalog.baseSociability),
      traitBravery: trait(TRAIT_SALT_BASE + 4, catalog.baseBravery),
      traitRiskTaking: trait(TRAIT_SALT_BASE + 5, catalog.baseRiskTaking),
      personalityExtra: {},
      hunger: 300,
      thirst: 300,
      fatigue: 200,
      discomfort: 100,
      unsafety: assertInteger(
        clamp(Math.floor(home.danger / 5), 0, 1000),
        "unsafety",
      ),
      loneliness: 200,
      health: 850,
      currentGoal: Goal.IDLE,
      currentAction: null,
      actionTargetKind: ActionTargetKind.NONE,
      actionTargetId: null,
      actionStartedTick: null,
      actionEndsTick: null,
      gestationSireId: null,
      gestationEndTick: null,
      mateCooldownUntilTick: null,
      spotX: 0,
      spotZ: 0,
      fromSpotX: 0,
      fromSpotZ: 0,
    };
    placeAt(creature, settleSpot(seed, tick, creatureId));
    const lineage = createFounderLineage({
      id: lineageId,
      worldId,
      founderCreatureId: creatureId,
      speciesId: catalog.id,
      founderName: name,
      foundedTick: tick,
    });
    const genes = geneticProfile(creature);
    out.events.push(
      founderBirthEvent({
        id: take("event"),
        worldId,
        tick,
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
        worldId,
        tick,
        creatureId,
        lineageId,
        territoryId: home.id,
        name,
        lineageName: lineage.name,
        territoryName: home.name,
      }),
    );
    out.creatures.push(creature);
    out.lineages.push(lineage);
    out.discoveries.push({ lineageId, territoryId: home.id });
  }
  return out;
}
