/**
 * Seasons: the year turns on the world's own clock, and each material has a
 * season when it is plentiful and one when it is scarce. Like the item
 * catalog this is code, not ruleset, so existing worlds pick it up.
 *
 * Everything here is a pure function of the tick: no state, no events.
 */
import { GATHER_RULES, ItemSlug, type ItemSlug as ItemSlugT } from "./items";

export const Season = {
  SPRING: "SPRING",
  SUMMER: "SUMMER",
  AUTUMN: "AUTUMN",
  WINTER: "WINTER",
} as const;
export type Season = (typeof Season)[keyof typeof Season];

/** In the order the year runs. Tick 0 is the first day of spring. */
export const SEASON_ORDER: readonly Season[] = [
  Season.SPRING,
  Season.SUMMER,
  Season.AUTUMN,
  Season.WINTER,
];

export const SEASON_NAMES: Readonly<Record<Season, string>> = {
  SPRING: "Spring",
  SUMMER: "Summer",
  AUTUMN: "Autumn",
  WINTER: "Winter",
};

/**
 * A season lasts a week of world days, so a year is 28 days. In its good
 * season a territory holds `plentifulCap` units to gather; in its bad one
 * only `scarceCap`; otherwise `GATHER_RULES.stockCap`.
 */
export const SEASON_RULES = {
  daysPerSeason: 7,
  plentifulCap: 16,
  scarceCap: 8,
} as const;

export type SeasonClock = {
  season: Season;
  /** 1-based year since the world began. */
  year: number;
  /** 1-based day within the season. */
  day: number;
  /** Whole days until the next season starts (1 on the last day). */
  daysLeft: number;
  next: Season;
};

export function seasonAt(tick: number, ticksPerDay: number): SeasonClock {
  const perDay = Math.max(1, Math.floor(ticksPerDay));
  const dayIndex = Math.floor(Math.max(0, tick) / perDay);
  const perSeason = SEASON_RULES.daysPerSeason;
  const seasonIndex = Math.floor(dayIndex / perSeason);
  const at = seasonIndex % SEASON_ORDER.length;
  const day = (dayIndex % perSeason) + 1;
  return {
    season: SEASON_ORDER[at] as Season,
    year: Math.floor(seasonIndex / SEASON_ORDER.length) + 1,
    day,
    daysLeft: perSeason - day + 1,
    next: SEASON_ORDER[(at + 1) % SEASON_ORDER.length] as Season,
  };
}

/**
 * When each material is plentiful and when it is scarce. Autumn is the
 * harvest: nothing is scarce then. Winter is hard on what grows, kind to
 * what is mined or opens at night.
 */
export const RESOURCE_SEASONS: Readonly<
  Partial<Record<ItemSlugT, { plentiful: Season; scarce: Season }>>
> = {
  [ItemSlug.CLOVER]: { plentiful: Season.SPRING, scarce: Season.WINTER },
  [ItemSlug.THORNBERRY]: { plentiful: Season.SUMMER, scarce: Season.SPRING },
  [ItemSlug.GLOWMOSS]: { plentiful: Season.AUTUMN, scarce: Season.SUMMER },
  [ItemSlug.AMBER_RESIN]: { plentiful: Season.AUTUMN, scarce: Season.WINTER },
  [ItemSlug.CRYSTAL_SHARD]: { plentiful: Season.WINTER, scarce: Season.SPRING },
  [ItemSlug.MOONPETAL]: { plentiful: Season.WINTER, scarce: Season.SUMMER },
};

export type Abundance = "plentiful" | "normal" | "scarce";

export function abundanceOf(resource: string, season: Season): Abundance {
  const row = RESOURCE_SEASONS[resource as ItemSlugT];
  if (row == null) return "normal";
  if (row.plentiful === season) return "plentiful";
  if (row.scarce === season) return "scarce";
  return "normal";
}

/** Units a territory can hold of `resource` in `season`. */
export function stockCapFor(resource: string, season: Season): number {
  switch (abundanceOf(resource, season)) {
    case "plentiful":
      return SEASON_RULES.plentifulCap;
    case "scarce":
      return SEASON_RULES.scarceCap;
    default:
      return GATHER_RULES.stockCap;
  }
}

/**
 * How good a creature is at finding materials while it forages, 0..1000:
 * mostly wits, with speed and curiosity. Tonics and breeding both move it.
 */
export function foragingSkill(genes: {
  intelligence: number;
  speed: number;
  curiosity: number;
}): number {
  const raw = Math.floor(
    (2 * genes.intelligence + genes.speed + genes.curiosity) / 4,
  );
  return Math.min(1000, Math.max(0, raw));
}

export const FORAGING_RULES = {
  /** Chance per successful forage at skill 0, per mille. */
  baseChancePerMille: 100,
  /** Added per 5 points of skill, so skill 500 is the old flat 300. */
  skillPerChance: 5,
  skillPerChanceTimes: 2,
  keenAtLeast: 650,
  poorBelow: 350,
} as const;

/** Chance per mille that a successful forage also finds a material. */
export function lootChancePerMille(genes: {
  intelligence: number;
  speed: number;
  curiosity: number;
}): number {
  return (
    FORAGING_RULES.baseChancePerMille +
    Math.floor(
      (foragingSkill(genes) * FORAGING_RULES.skillPerChanceTimes) /
        FORAGING_RULES.skillPerChance,
    )
  );
}

export type ForagingGrade = "keen" | "fair" | "poor";

export function foragingGrade(skill: number): ForagingGrade {
  if (skill >= FORAGING_RULES.keenAtLeast) return "keen";
  if (skill < FORAGING_RULES.poorBelow) return "poor";
  return "fair";
}
