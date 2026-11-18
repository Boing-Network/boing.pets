/**
 * Blended inheritance, mutation, personality at birth, and syllable names.
 * Every gene takes a mutation roll; delta may still be zero.
 */
import {
  Gender,
  type GeneMutation,
  type GeneticProfile,
  type Ruleset,
} from "@boing-pets/contract";
import { assertInteger, clamp, divRound } from "../math";
import { rngInt } from "../rng";
import type { CreatureRow, SpeciesRow } from "../types";

const NAME_SYLLABLES = [
  "bri",
  "fen",
  "mos",
  "pel",
  "ari",
  "sol",
  "kae",
  "lun",
  "tor",
  "vess",
  "nima",
  "oak",
  "quill",
  "wren",
  "ith",
  "sae",
  "dorr",
  "pax",
  "elio",
  "mira",
] as const;

/** MVP gene columns in inheritance order. */
export const MVP_GENES = [
  "strength",
  "speed",
  "intelligence",
  "curiosity",
  "sociability",
] as const;

export type MvpGene = (typeof MVP_GENES)[number];

const TRAIT_ORDER = [
  "curiosity",
  "aggression",
  "loyalty",
  "sociability",
  "bravery",
  "riskTaking",
] as const;

type TraitKey = (typeof TRAIT_ORDER)[number];

const GENE_FIELD: Record<MvpGene, keyof CreatureRow> = {
  strength: "geneStrength",
  speed: "geneSpeed",
  intelligence: "geneIntelligence",
  curiosity: "geneCuriosity",
  sociability: "geneSociability",
};

const TRAIT_FIELD: Record<TraitKey, keyof CreatureRow> = {
  curiosity: "traitCuriosity",
  aggression: "traitAggression",
  loyalty: "traitLoyalty",
  sociability: "traitSociability",
  bravery: "traitBravery",
  riskTaking: "traitRiskTaking",
};

function geneOf(creature: CreatureRow, gene: MvpGene): number {
  return creature[GENE_FIELD[gene]] as number;
}

function traitOf(creature: CreatureRow, trait: TraitKey): number {
  return creature[TRAIT_FIELD[trait]] as number;
}

function speciesBase(species: SpeciesRow, trait: TraitKey): number {
  switch (trait) {
    case "curiosity":
      return species.baseCuriosity;
    case "aggression":
      return species.baseAggression;
    case "loyalty":
      return species.baseLoyalty;
    case "sociability":
      return species.baseSociability;
    case "bravery":
      return species.baseBravery;
    case "riskTaking":
      return species.baseRiskTaking;
    default: {
      const never: never = trait;
      return never;
    }
  }
}

/**
 * One mutation roll per gene. Rare and minor share the roll so they cannot
 * stack. Magnitude uses salt `geneIndex + 32`; even → negative, odd → positive.
 */
export function mutationDelta(
  seed: number,
  birthTick: number,
  childId: number,
  geneIndex: number,
  rules: Ruleset,
): { delta: number; rare: boolean } {
  const roll = rngInt(
    seed,
    birthTick,
    "genetics",
    childId,
    geneIndex,
    0,
    rules.mutationRollMax,
  );
  if (roll >= rules.minorMutationBelow) return { delta: 0, rare: false };

  const rare = roll < rules.rareMutationBelow;
  const magSalt = geneIndex + 32;
  const magnitude = rare
    ? rngInt(
        seed,
        birthTick,
        "genetics",
        childId,
        magSalt,
        rules.rareMutationMagMin,
        rules.rareMutationMagMax,
      )
    : rngInt(
        seed,
        birthTick,
        "genetics",
        childId,
        magSalt,
        1,
        rules.minorMutationMag,
      );
  // Second roll, same salt: 0 even → negative, 1 odd → positive.
  const signBit = rngInt(seed, birthTick, "genetics", childId, magSalt, 0, 1);
  const sign = signBit === 0 ? -1 : 1;
  return { delta: sign * magnitude, rare };
}

export type InheritedGenes = {
  genes: GeneticProfile;
  mutations: GeneMutation[];
};

/**
 * Blend each MVP gene and every `rules.extraGenes` key present on both parents.
 * A key on only one parent is not copied.
 */
export function inheritGenes(
  seed: number,
  birthTick: number,
  childId: number,
  mother: CreatureRow,
  father: CreatureRow,
  rules: Ruleset,
): InheritedGenes {
  const mutations: GeneMutation[] = [];
  const genes: GeneticProfile = {
    strength: 0,
    speed: 0,
    intelligence: 0,
    curiosity: 0,
    sociability: 0,
    extra: {},
  };

  for (let i = 0; i < MVP_GENES.length; i += 1) {
    const gene = MVP_GENES[i]!;
    const base = divRound(geneOf(mother, gene) + geneOf(father, gene), 2);
    const { delta, rare } = mutationDelta(seed, birthTick, childId, i, rules);
    const value = assertInteger(clamp(base + delta, 0, 1000), gene);
    genes[gene] = value;
    if (delta !== 0) mutations.push({ gene, delta, rare });
  }

  let extraIndex = MVP_GENES.length;
  for (const key of rules.extraGenes) {
    const motherValue = mother.genesExtra[key];
    const fatherValue = father.genesExtra[key];
    if (motherValue === undefined || fatherValue === undefined) {
      extraIndex += 1;
      continue;
    }
    const base = divRound(motherValue + fatherValue, 2);
    const { delta, rare } = mutationDelta(
      seed,
      birthTick,
      childId,
      extraIndex,
      rules,
    );
    const value = assertInteger(clamp(base + delta, 0, 1000), key);
    genes.extra[key] = value;
    if (delta !== 0) mutations.push({ gene: key, delta, rare });
    extraIndex += 1;
  }

  return { genes, mutations };
}

export type InheritedPersonality = {
  curiosity: number;
  aggression: number;
  loyalty: number;
  sociability: number;
  bravery: number;
  riskTaking: number;
  extra: Record<string, number>;
};

/**
 * Parental mean blended with the species base, jittered, then nudged by genes.
 */
export function inheritPersonality(
  seed: number,
  birthTick: number,
  childId: number,
  mother: CreatureRow,
  father: CreatureRow,
  species: SpeciesRow,
  genes: GeneticProfile,
  rules: Ruleset,
): InheritedPersonality {
  const jitter = rules.personalityJitter;
  const traits: InheritedPersonality = {
    curiosity: 0,
    aggression: 0,
    loyalty: 0,
    sociability: 0,
    bravery: 0,
    riskTaking: 0,
    extra: {},
  };

  for (let i = 0; i < TRAIT_ORDER.length; i += 1) {
    const trait = TRAIT_ORDER[i]!;
    const parental = divRound(
      traitOf(mother, trait) + traitOf(father, trait),
      2,
    );
    const blended = divRound(parental + speciesBase(species, trait), 2);
    const roll = rngInt(
      seed,
      birthTick,
      "personality",
      childId,
      i,
      -jitter,
      jitter,
    );
    traits[trait] = assertInteger(clamp(blended + roll, 0, 1000), trait);
  }

  traits.curiosity = assertInteger(
    clamp(
      traits.curiosity +
        divRound(genes.curiosity - 500, rules.traitGeneDivisor),
      0,
      1000,
    ),
    "curiosity",
  );
  traits.sociability = assertInteger(
    clamp(
      traits.sociability +
        divRound(genes.sociability - 500, rules.traitGeneDivisor),
      0,
      1000,
    ),
    "sociability",
  );
  traits.bravery = assertInteger(
    clamp(
      traits.bravery +
        divRound(genes.strength - 500, rules.traitGeneDivisorMinor),
      0,
      1000,
    ),
    "bravery",
  );
  traits.riskTaking = assertInteger(
    clamp(
      traits.riskTaking +
        divRound(genes.speed - 500, rules.traitGeneDivisorMinor),
      0,
      1000,
    ),
    "riskTaking",
  );
  traits.aggression = assertInteger(
    clamp(
      traits.aggression -
        divRound(genes.intelligence - 500, rules.traitGeneDivisorMinor),
      0,
      1000,
    ),
    "aggression",
  );

  return traits;
}

/** Three syllable rolls. Collision appends `-${creatureId}`. */
export function generateName(
  seed: number,
  tick: number,
  creatureId: number,
  used: ReadonlySet<string>,
): string {
  if (NAME_SYLLABLES.length !== 20) throw new Error("name syllable table");
  const parts = [0, 1, 2].map((salt) => {
    const index = rngInt(seed, tick, "name", creatureId, salt, 0, 19);
    const syllable = NAME_SYLLABLES[index];
    if (syllable === undefined) throw new Error("name syllable");
    return syllable;
  });
  const raw = parts.join("");
  let name = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (used.has(name)) name = `${name}-${creatureId}`;
  return name;
}

/** Child gender: genetics salt 16, 0 female / 1 male. */
export function rollGender(
  seed: number,
  birthTick: number,
  childId: number,
): Gender {
  const roll = rngInt(seed, birthTick, "genetics", childId, 16, 0, 1);
  return roll === 0 ? Gender.FEMALE : Gender.MALE;
}

export function geneticProfileFromGenes(genes: GeneticProfile): GeneticProfile {
  return {
    strength: genes.strength,
    speed: genes.speed,
    intelligence: genes.intelligence,
    curiosity: genes.curiosity,
    sociability: genes.sociability,
    extra: { ...genes.extra },
  };
}
