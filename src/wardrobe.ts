import { blake3 } from "@noble/hashes/blake3";

export const SLOTS = ["head", "neck", "body", "back", "feet"] as const;
export type Slot = (typeof SLOTS)[number];
export const RARITIES = ["common", "uncommon", "rare", "epic", "mythic"] as const;
export type Rarity = (typeof RARITIES)[number];

export interface Accessory {
  id: string;
  slot: Slot;
  rarity: Rarity;
  name: string;
  tint: string;
}

/** Fixed catalog. Future minigames grant by these ids. They never accept a free-typed name. */
export const ACCESSORIES: readonly Accessory[] = [
  { id: "twig-cap", slot: "head", rarity: "common", name: "Twig cap", tint: "#8d6b45" },
  { id: "wool-scarf", slot: "neck", rarity: "common", name: "Wool scarf", tint: "#c46b5a" },
  { id: "linen-wrap", slot: "body", rarity: "common", name: "Linen wrap", tint: "#d9d0bf" },
  { id: "satchel", slot: "back", rarity: "common", name: "Little satchel", tint: "#6e5344" },
  { id: "mud-boots", slot: "feet", rarity: "common", name: "Mud boots", tint: "#5c5148" },
  { id: "sprout-crown", slot: "head", rarity: "uncommon", name: "Sprout crown", tint: "#6ea86a" },
  { id: "river-beads", slot: "neck", rarity: "uncommon", name: "River beads", tint: "#6aa0c8" },
  { id: "patched-coat", slot: "body", rarity: "rare", name: "Patched coat", tint: "#3f6ea8" },
  { id: "moon-cape", slot: "back", rarity: "epic", name: "Moon cape", tint: "#7a5ab8" },
  { id: "star-slippers", slot: "feet", rarity: "mythic", name: "Star slippers", tint: "#e0b15a" },
];

const byId = new Map(ACCESSORIES.map((item) => [item.id, item]));

export function accessory(id: string) {
  return byId.get(id) ?? null;
}

export function isSlot(value: string): value is Slot {
  return (SLOTS as readonly string[]).includes(value);
}

/** Forage only ever finds a common piece, and often finds nothing. Rarer ids are for future minigames. */
export function foundWhileForaging(challengeId: string) {
  const bytes = blake3(new TextEncoder().encode(`boing.pets:find:${challengeId}`));
  if (bytes[0] > 110) return null;
  const commons = ACCESSORIES.filter((item) => item.rarity === "common");
  return commons[bytes[1] % commons.length]?.id ?? null;
}

export function rarityRank(rarity: Rarity) {
  return RARITIES.indexOf(rarity);
}
