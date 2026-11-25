/**
 * What the HUD says about the season and about how well a creature finds
 * materials. Pure; the rules themselves are in `@boing-pets/contract`.
 */
import {
  ITEM_CATALOG,
  ItemCategory,
  SEASON_NAMES,
  SEASON_RULES,
  abundanceOf,
  foragingGrade,
  foragingSkill,
  lootChancePerMille,
  seasonAt,
  type Season,
} from "@boing-pets/contract";

export type SeasonSummary = {
  season: Season;
  /** "Spring, day 3 of 7" */
  title: string;
  /** "Summer in 5 days" */
  next: string;
  /** Display names of materials that are plentiful or scarce now. */
  plentiful: string[];
  scarce: string[];
  /** One sentence on what the season means for gathering. */
  note: string;
};

function list(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function seasonSummary(tick: number, ticksPerDay = 144): SeasonSummary {
  const clock = seasonAt(tick, ticksPerDay);
  const resources = ITEM_CATALOG.filter(
    (def) => def.category === ItemCategory.RESOURCE,
  );
  const named = (kind: "plentiful" | "scarce") =>
    resources
      .filter((def) => abundanceOf(def.slug, clock.season) === kind)
      .map((def) => def.displayName);
  const plentiful = named("plentiful");
  const scarce = named("scarce");
  const parts: string[] = [];
  if (plentiful.length > 0) parts.push(`${list(plentiful)} plentiful`);
  if (scarce.length > 0) parts.push(`${list(scarce)} scarce`);
  return {
    season: clock.season,
    title: `${SEASON_NAMES[clock.season]}, day ${clock.day} of ${SEASON_RULES.daysPerSeason}`,
    next:
      clock.daysLeft === 1
        ? `${SEASON_NAMES[clock.next]} tomorrow`
        : `${SEASON_NAMES[clock.next]} in ${clock.daysLeft} days`,
    plentiful,
    scarce,
    note: parts.length > 0 ? `${parts.join("; ")}.` : "Nothing is scarce.",
  };
}

/** "plentiful" / "scarce" for a material this season, or "" when ordinary. */
export function abundanceLabel(slug: string, season: Season): string {
  const abundance = abundanceOf(slug, season);
  return abundance === "normal" ? "" : abundance;
}

const GRADE_TEXT = {
  keen: "Keen",
  fair: "Fair",
  poor: "Poor",
} as const;

/** "Keen: finds a material about 4 times in 10 forages." */
export function foragingText(genes: {
  intelligence: number;
  speed: number;
  curiosity: number;
}): { grade: string; detail: string } {
  const grade = GRADE_TEXT[foragingGrade(foragingSkill(genes))];
  const inTen = Math.max(1, Math.round(lootChancePerMille(genes) / 100));
  return {
    grade,
    detail: `finds a material about ${inTen} time${inTen === 1 ? "" : "s"} in 10 forages`,
  };
}
