/** Deep-link metadata for daily-activity areas in the public pasture. */

import type { ActivityId } from "../content/attempts";
import type { ActivityStationKind } from "./stationInteract";
import { PASTURE_ZONE } from "../world/config/zones";
import { stationByKind } from "./stationInteract";

export type ActivityAreaMeta = {
  kind: ActivityStationKind;
  activity: ActivityId;
  /** Pasture hash without '#'. Must not collide with HASH_REDIRECTS. */
  hash: string;
  fallbackPath: string;
  fallbackLabel: string;
  title: string;
  eyebrow: string;
  prompt: string;
  actionLabel: string;
};

export const ACTIVITY_AREA_META: Record<ActivityStationKind, ActivityAreaMeta> =
  {
    mine: {
      kind: "mine",
      activity: "mining",
      hash: "mine",
      fallbackPath: "/mining.html",
      fallbackLabel: "Quarry desk",
      title: "Quarry",
      eyebrow: "SKILL",
      prompt: "Press E to train Quarry",
      actionLabel: "Train Quarry",
    },
    fish: {
      kind: "fish",
      activity: "fishing",
      hash: "fish",
      fallbackPath: "/fishing.html",
      fallbackLabel: "Line desk",
      title: "Line",
      eyebrow: "SKILL",
      prompt: "Press E to train Line",
      actionLabel: "Train Line",
    },
    treasure: {
      kind: "treasure",
      activity: "treasure",
      hash: "dig",
      fallbackPath: "/treasure.html",
      fallbackLabel: "Sweep desk",
      title: "Sweep",
      eyebrow: "SKILL",
      prompt: "Press E to train Sweep",
      actionLabel: "Train Sweep",
    },
    garden: {
      kind: "garden",
      activity: "garden",
      hash: "crops",
      fallbackPath: "/garden.html",
      fallbackLabel: "Plot desk",
      title: "Plot",
      eyebrow: "SKILL",
      prompt: "Press E to train Plot",
      actionLabel: "Train Plot",
    },
    cook: {
      kind: "cook",
      activity: "cook",
      hash: "cook",
      fallbackPath: "/kitchen.html",
      fallbackLabel: "Kitchen desk",
      title: "Street Kitchen",
      eyebrow: "PASTURE AREA",
      prompt: "Press E to cook",
      actionLabel: "Cook",
    },
    race: {
      kind: "race",
      activity: "racing",
      hash: "race",
      fallbackPath: "/racing.html",
      fallbackLabel: "Racing desk",
      title: "Skate Park",
      eyebrow: "PASTURE AREA",
      prompt: "Press E to race",
      actionLabel: "Race",
    },
  };

export const ACTIVITY_AREA_LIST: ActivityAreaMeta[] =
  Object.values(ACTIVITY_AREA_META);

export function activityKindForHash(hash: string): ActivityStationKind | null {
  const key = hash.replace(/^#/, "");
  if (!key) return null;
  for (const meta of ACTIVITY_AREA_LIST) {
    if (meta.hash === key) return meta.kind;
  }
  return null;
}

export function activityAreaStation(kind: ActivityStationKind) {
  return stationByKind(PASTURE_ZONE, kind);
}
