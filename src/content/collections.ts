import type { CareEvent, Pet } from "../core";
import { state } from "../core";
import { CATALOG } from "../economy";
import { SPECIES } from "../core";

export interface CollectionEntry {
  id: string;
  title: string;
  description: string;
  category: "species" | "cosmetic" | "discovery";
}

export const COLLECTION_DEFS: CollectionEntry[] = [
  ...SPECIES.map((species) => ({
    id: `species:${species}`,
    title: species,
    description: `Hatch a ${species}.`,
    category: "species" as const,
  })),
  {
    id: "discovery:stray_home",
    title: "Homecoming",
    description: "Feed your buddy after it has gone scruffy or stray.",
    category: "discovery",
  },
  {
    id: "discovery:streak_7",
    title: "Week of Wobbles",
    description: "Reach a 7-day care streak.",
    category: "discovery",
  },
  ...CATALOG.map((item) => ({
    id: `cosmetic:${item.id}`,
    title: item.name,
    description: `Own the ${item.name} cosmetic.`,
    category: "cosmetic" as const,
  })),
];

export function unlockedCollections(args: {
  pet: Pet | null;
  species: string | null;
  events: CareEvent[];
  inventoryIds: string[];
  now: number;
  sawScruffyFeed?: boolean;
}): string[] {
  const out: string[] = [];
  if (args.species) out.push(`species:${args.species}`);
  if (args.pet) {
    const s = state(args.pet, args.events, args.now);
    if (s.streak >= 7) out.push("discovery:streak_7");
    if (args.sawScruffyFeed) out.push("discovery:stray_home");
  }
  for (const id of args.inventoryIds) out.push(`cosmetic:${id}`);
  return [...new Set(out)];
}
