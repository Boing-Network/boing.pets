/**
 * Per-species world scale: creatures are built in creature-local units and
 * sized here so they sit under canopy height in the world.
 */
/** World-space scale so creatures sit under canopy height, not toy tokens. */
export const SPECIES_WORLD_SCALE: Record<string, number> = {
  "fire-fox": 2.55,
  "moss-stag": 3.25,
  "lantern-moth": 2.15,
  "glow-tortoise": 2.9,
  "moon-hare": 2.8,
  "crag-ram": 3.0,
  "thistle-hog": 3.1,
  "barrow-badger": 2.6,
  "field-nightjar": 1.75,
  "shade-lynx": 2.9,
  "dusk-raccoon": 2.45,
  "slate-marmot": 2.5,
  "gloam-bat": 1.8,
  "silver-deer": 3.1,
  "dew-shrew": 1.45,
  "reed-heron": 2.0,
  "ember-newt": 1.9,
  "hollow-squirrel": 2.3,
  "ash-wolf": 3.0,
  "stone-pika": 2.3,
  "crag-owl": 2.2,
  "clover-vole": 1.85,
  "amber-kestrel": 1.8,
  "thorn-porcupine": 2.4,
  "briar-weasel": 2.1,
  "ledge-goat": 3.3,
  "mist-swift": 1.9,
  "opal-dormouse": 2.1,
  "hush-owl": 1.9,
  "lumen-frog": 1.8,
  "reed-muskrat": 2.3,
  "elder-bear": 3.4,
  "acorn-jay": 1.75,
  "rime-cat": 3.0,
  "gale-chough": 2.2,
  "candle-hedgehog": 2.5,
  "veil-marten": 2.4,
  "tarn-eagle": 1.8,
  "halo-loris": 2.4,
  "wisp-otter": 2.6,
  "saddle-tapir": 3.1,
  "aurora-yak": 3.15,
};

export function worldScaleForSkin(skinId: string, selected: boolean): number {
  const base = SPECIES_WORLD_SCALE[skinId] ?? 3.4;
  return selected ? base * 1.06 : base;
}
