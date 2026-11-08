/** Config-driven seasonal events — edit here without Worker logic changes. */

export interface SeasonEvent {
  id: string;
  name: string;
  description: string;
  /** Inclusive UTC ms window. */
  startsAt: number;
  endsAt: number;
  limitedCosmetics: string[];
  limitedPetNote?: string;
}

/** Rolling demo windows relative to a fixed epoch so local preview always has one nearby. */
const DAY = 86_400_000;

export const SEASON_EVENTS: SeasonEvent[] = [
  {
    id: "spring-bloom",
    name: "Spring Bloom",
    description: "Pasture flowers everywhere. Limited ribbon cosmetics.",
    startsAt: Date.UTC(2026, 2, 1),
    endsAt: Date.UTC(2026, 3, 15),
    limitedCosmetics: ["hat-ribbon"],
    limitedPetNote: "Blooming antenna accents",
  },
  {
    id: "summer-splash",
    name: "Summer Splash",
    description: "Beach fishing teasers and sandy furniture previews.",
    startsAt: Date.UTC(2026, 5, 1),
    endsAt: Date.UTC(2026, 7, 1),
    limitedCosmetics: ["furn-lamp"],
  },
  {
    id: "halloween-howl",
    name: "Halloween Howl",
    description: "Scruffy-chic frames and mischievous night plaza vibes.",
    startsAt: Date.UTC(2026, 9, 15),
    endsAt: Date.UTC(2026, 10, 5),
    limitedCosmetics: ["frame-gold"],
    limitedPetNote: "Moonlit mischievous pets",
  },
  {
    id: "winter-wobble",
    name: "Winter Wobble",
    description: "Cozy cushions and soft snowfall over Starter Town.",
    startsAt: Date.UTC(2026, 11, 1),
    endsAt: Date.UTC(2027, 0, 10),
    limitedCosmetics: ["furn-cushion"],
  },
  // Always-on preview event so Phase 6 demos work year-round in local testnet.
  {
    id: "testnet-festival",
    name: "Testnet Festival",
    description: "Ongoing preview festival for local/shared testnet builds.",
    startsAt: Date.UTC(2025, 0, 1),
    endsAt: Date.UTC(2030, 0, 1),
    limitedCosmetics: ["hat-antenna"],
    limitedPetNote: "Festival sparkles (cosmetic only)",
  },
];

export function activeEvents(now: number): SeasonEvent[] {
  return SEASON_EVENTS.filter((e) => now >= e.startsAt && now <= e.endsAt);
}

export function eventById(id: string): SeasonEvent | null {
  return SEASON_EVENTS.find((e) => e.id === id) ?? null;
}

/** Helper for docs/tests: length of a day constant. */
export const SEASON_DAY = DAY;
