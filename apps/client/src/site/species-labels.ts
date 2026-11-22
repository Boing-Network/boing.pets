/**
 * Shared display labels for diet and gait, used by the marketing gallery
 * and the bestiary. Values come from the contract catalog; these are names
 * only, not new stats.
 */
import { Diet, type SpeciesKey } from "@boing-pets/contract";

export const DIET_LABEL: Record<Diet, string> = {
  [Diet.HERBIVORE]: "Herbivore",
  [Diet.OMNIVORE]: "Omnivore",
  [Diet.INSECTIVORE]: "Insectivore",
  [Diet.CARNIVORE]: "Carnivore",
};

export const GAIT_LABEL: Record<SpeciesKey["gait"], string> = {
  walk: "walks",
  trot: "trots",
  hop: "hops",
  bound: "bounds",
  scurry: "scurries",
  waddle: "waddles",
  crawl: "crawls",
  wade: "wades",
  fly: "flies",
};

export const GAIT_NAME: Record<SpeciesKey["gait"], string> = {
  walk: "Walk",
  trot: "Trot",
  hop: "Hop",
  bound: "Bound",
  scurry: "Scurry",
  waddle: "Waddle",
  crawl: "Crawl",
  wade: "Wade",
  fly: "Fly",
};

export function bodyPlanName(plan: SpeciesKey["bodyPlan"]): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
