/**
 * Canonical species identity shared by the kernel, the host, and the client.
 *
 * One name per species everywhere: the kernel slug and display name match the
 * client skin id and label. Biology (lifespan, traits, home territory) lives in
 * `packages/sim/src/worldgen/catalog.ts`; presentation lives in
 * `apps/client/src/view/species-skins.ts`. Both key off these ids and slugs.
 *
 * Ids 1–3 were called fernfox / mossback / pebblehare before the naming pass.
 * Worlds saved with those slugs still load; ids are unchanged, so the client
 * keeps drawing them with the same skins.
 */
import { Diet } from "./enums";

/** How a species moves. The client picks a gait cycle from this. */
export type SpeciesGait =
  | "walk"
  | "trot"
  | "hop"
  | "bound"
  | "scurry"
  | "waddle"
  | "crawl"
  | "wade"
  | "fly";

/** Broad body plan the client builds the procedural mesh from. */
export type SpeciesBodyPlan =
  | "canid"
  | "cervid"
  | "bovid"
  | "lagomorph"
  | "rodent"
  | "mustelid"
  | "felid"
  | "suid"
  | "chelonian"
  | "urodele"
  | "moth"
  | "bat"
  | "owl"
  | "nightjar"
  | "heron"
  | "raptor"
  | "swift"
  | "corvid"
  | "ursid"
  | "anuran";

export type SpeciesKey = {
  id: number;
  slug: string;
  displayName: string;
  /** Home territory slug (founders are placed here). */
  home: string;
  diet: Diet;
  gait: SpeciesGait;
  bodyPlan: SpeciesBodyPlan;
};

/**
 * Ids 1–7 are the original seven and keep their ids and founder order.
 * Ids 8–21 were added by the bestiary expansion: two per territory, so every
 * territory hosts three species. Ids 22–35 are the second expansion: two more
 * per territory, so every territory now hosts five. Never renumber; append only.
 */
export const SPECIES_CATALOG = [
  {
    id: 1,
    slug: "fire-fox",
    displayName: "Fire Fox",
    home: "meadow",
    diet: Diet.OMNIVORE,
    gait: "trot",
    bodyPlan: "canid",
  },
  {
    id: 2,
    slug: "moss-stag",
    displayName: "Moss Stag",
    home: "thicket",
    diet: Diet.HERBIVORE,
    gait: "walk",
    bodyPlan: "cervid",
  },
  {
    id: 3,
    slug: "lantern-moth",
    displayName: "Lantern Moth",
    home: "ridge",
    diet: Diet.HERBIVORE,
    gait: "fly",
    bodyPlan: "moth",
  },
  {
    id: 4,
    slug: "glow-tortoise",
    displayName: "Glow Tortoise",
    home: "fen",
    diet: Diet.HERBIVORE,
    gait: "crawl",
    bodyPlan: "chelonian",
  },
  {
    id: 5,
    slug: "moon-hare",
    displayName: "Moon Hare",
    home: "glade",
    diet: Diet.HERBIVORE,
    gait: "hop",
    bodyPlan: "lagomorph",
  },
  {
    id: 6,
    slug: "crag-ram",
    displayName: "Crag Ram",
    home: "crags",
    diet: Diet.HERBIVORE,
    gait: "walk",
    bodyPlan: "bovid",
  },
  {
    id: 7,
    slug: "thistle-hog",
    displayName: "Thistle Hog",
    home: "grove",
    diet: Diet.OMNIVORE,
    gait: "trot",
    bodyPlan: "suid",
  },
  {
    id: 8,
    slug: "barrow-badger",
    displayName: "Barrow Badger",
    home: "meadow",
    diet: Diet.OMNIVORE,
    gait: "waddle",
    bodyPlan: "mustelid",
  },
  {
    id: 9,
    slug: "field-nightjar",
    displayName: "Field Nightjar",
    home: "meadow",
    diet: Diet.INSECTIVORE,
    gait: "fly",
    bodyPlan: "nightjar",
  },
  {
    id: 10,
    slug: "shade-lynx",
    displayName: "Shade Lynx",
    home: "thicket",
    diet: Diet.CARNIVORE,
    gait: "walk",
    bodyPlan: "felid",
  },
  {
    id: 11,
    slug: "dusk-raccoon",
    displayName: "Dusk Raccoon",
    home: "thicket",
    diet: Diet.OMNIVORE,
    gait: "waddle",
    bodyPlan: "mustelid",
  },
  {
    id: 12,
    slug: "slate-marmot",
    displayName: "Slate Marmot",
    home: "ridge",
    diet: Diet.HERBIVORE,
    gait: "bound",
    bodyPlan: "rodent",
  },
  {
    id: 13,
    slug: "gloam-bat",
    displayName: "Gloam Bat",
    home: "ridge",
    diet: Diet.INSECTIVORE,
    gait: "fly",
    bodyPlan: "bat",
  },
  {
    id: 14,
    slug: "silver-deer",
    displayName: "Silver Deer",
    home: "glade",
    diet: Diet.HERBIVORE,
    gait: "walk",
    bodyPlan: "cervid",
  },
  {
    id: 15,
    slug: "dew-shrew",
    displayName: "Dew Shrew",
    home: "glade",
    diet: Diet.INSECTIVORE,
    gait: "scurry",
    bodyPlan: "rodent",
  },
  {
    id: 16,
    slug: "reed-heron",
    displayName: "Reed Heron",
    home: "fen",
    diet: Diet.CARNIVORE,
    gait: "wade",
    bodyPlan: "heron",
  },
  {
    id: 17,
    slug: "ember-newt",
    displayName: "Ember Newt",
    home: "fen",
    diet: Diet.INSECTIVORE,
    gait: "crawl",
    bodyPlan: "urodele",
  },
  {
    id: 18,
    slug: "hollow-squirrel",
    displayName: "Hollow Squirrel",
    home: "grove",
    diet: Diet.HERBIVORE,
    gait: "bound",
    bodyPlan: "rodent",
  },
  {
    id: 19,
    slug: "ash-wolf",
    displayName: "Ash Wolf",
    home: "grove",
    diet: Diet.CARNIVORE,
    gait: "trot",
    bodyPlan: "canid",
  },
  {
    id: 20,
    slug: "stone-pika",
    displayName: "Stone Pika",
    home: "crags",
    diet: Diet.HERBIVORE,
    gait: "hop",
    bodyPlan: "lagomorph",
  },
  {
    id: 21,
    slug: "crag-owl",
    displayName: "Crag Owl",
    home: "crags",
    diet: Diet.CARNIVORE,
    gait: "fly",
    bodyPlan: "owl",
  },
  {
    id: 22,
    slug: "clover-vole",
    displayName: "Clover Vole",
    home: "meadow",
    diet: Diet.HERBIVORE,
    gait: "scurry",
    bodyPlan: "rodent",
  },
  {
    id: 23,
    slug: "amber-kestrel",
    displayName: "Amber Kestrel",
    home: "meadow",
    diet: Diet.CARNIVORE,
    gait: "fly",
    bodyPlan: "raptor",
  },
  {
    id: 24,
    slug: "thorn-porcupine",
    displayName: "Thorn Porcupine",
    home: "thicket",
    diet: Diet.HERBIVORE,
    gait: "waddle",
    bodyPlan: "rodent",
  },
  {
    id: 25,
    slug: "briar-weasel",
    displayName: "Briar Weasel",
    home: "thicket",
    diet: Diet.CARNIVORE,
    gait: "bound",
    bodyPlan: "mustelid",
  },
  {
    id: 26,
    slug: "ledge-goat",
    displayName: "Ledge Goat",
    home: "ridge",
    diet: Diet.HERBIVORE,
    gait: "walk",
    bodyPlan: "bovid",
  },
  {
    id: 27,
    slug: "mist-swift",
    displayName: "Mist Swift",
    home: "ridge",
    diet: Diet.INSECTIVORE,
    gait: "fly",
    bodyPlan: "swift",
  },
  {
    id: 28,
    slug: "opal-dormouse",
    displayName: "Opal Dormouse",
    home: "glade",
    diet: Diet.OMNIVORE,
    gait: "bound",
    bodyPlan: "rodent",
  },
  {
    id: 29,
    slug: "hush-owl",
    displayName: "Hush Owl",
    home: "glade",
    diet: Diet.INSECTIVORE,
    gait: "fly",
    bodyPlan: "owl",
  },
  {
    id: 30,
    slug: "lumen-frog",
    displayName: "Lumen Frog",
    home: "fen",
    diet: Diet.INSECTIVORE,
    gait: "hop",
    bodyPlan: "anuran",
  },
  {
    id: 31,
    slug: "reed-muskrat",
    displayName: "Reed Muskrat",
    home: "fen",
    diet: Diet.HERBIVORE,
    gait: "waddle",
    bodyPlan: "rodent",
  },
  {
    id: 32,
    slug: "elder-bear",
    displayName: "Elder Bear",
    home: "grove",
    diet: Diet.OMNIVORE,
    gait: "walk",
    bodyPlan: "ursid",
  },
  {
    id: 33,
    slug: "acorn-jay",
    displayName: "Acorn Jay",
    home: "grove",
    diet: Diet.OMNIVORE,
    gait: "fly",
    bodyPlan: "corvid",
  },
  {
    id: 34,
    slug: "rime-cat",
    displayName: "Rime Cat",
    home: "crags",
    diet: Diet.CARNIVORE,
    gait: "walk",
    bodyPlan: "felid",
  },
  {
    id: 35,
    slug: "gale-chough",
    displayName: "Gale Chough",
    home: "crags",
    diet: Diet.OMNIVORE,
    gait: "fly",
    bodyPlan: "corvid",
  },
] as const satisfies readonly SpeciesKey[];

export type SpeciesSlug = (typeof SPECIES_CATALOG)[number]["slug"];

/** Pre-rename kernel slugs, for reading worlds created before the rename. */
export const LEGACY_SPECIES_SLUGS: Readonly<Record<string, SpeciesSlug>> = {
  fernfox: "fire-fox",
  mossback: "moss-stag",
  pebblehare: "lantern-moth",
};

export function speciesKeyForId(id: number): SpeciesKey | null {
  return SPECIES_CATALOG.find((row) => row.id === id) ?? null;
}

export function speciesKeyForSlug(slug: string): SpeciesKey | null {
  const canonical = LEGACY_SPECIES_SLUGS[slug] ?? slug;
  return SPECIES_CATALOG.find((row) => row.slug === canonical) ?? null;
}
