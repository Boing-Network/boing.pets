import {
  COSMETIC_SLOT_LABELS,
  COSMETIC_SLOTS,
  type EquippedCosmetics,
} from "../../content/cosmetics";
import { itemDisplayName as catalogItemDisplayName } from "../../content/items";

export type PublicPetInfo = {
  species: string;
  personality: string;
  stage: string;
};

export function isOwnBuddy(
  pet: { owner: string },
  owner: string | null | undefined,
): boolean {
  return !!owner && pet.owner === owner;
}

export function publicPetInfo(pet: {
  traits: { species: string; personality: string };
  state: { stage: string };
}): PublicPetInfo {
  return {
    species: pet.traits.species,
    personality: pet.traits.personality,
    stage: pet.state.stage,
  };
}

export function itemDisplayName(itemId: string): string {
  return catalogItemDisplayName(itemId);
}

export function equippedSummary(
  equipped: EquippedCosmetics | undefined,
  nameOf: (id: string) => string = itemDisplayName,
): string {
  const parts: string[] = [];
  for (const slot of COSMETIC_SLOTS) {
    const id = equipped?.[slot];
    if (!id) continue;
    parts.push(`${COSMETIC_SLOT_LABELS[slot]}: ${nameOf(id)}`);
  }
  return parts.length ? parts.join(" · ") : "Nothing equipped yet.";
}

export function buddyChipLabel(opts: {
  connected: boolean;
  hasPet: boolean;
  species?: string | null;
}): string {
  if (!opts.connected) return "Buddy";
  if (!opts.hasPet) return "Hatch";
  return opts.species || "Buddy";
}
