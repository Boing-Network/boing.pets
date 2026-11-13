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
      fallbackLabel: "Mine desk",
      title: "Crystal Quarry",
      eyebrow: "PASTURE AREA",
      prompt: "Press E to mine",
      actionLabel: "Mine",
    },
    fish: {
      kind: "fish",
      activity: "fishing",
      hash: "fish",
      fallbackPath: "/fishing.html",
      fallbackLabel: "Fishing desk",
      title: "Pond Pier",
      eyebrow: "PASTURE AREA",
      prompt: "Press E to fish",
      actionLabel: "Fish",
    },
    treasure: {
      kind: "treasure",
      activity: "treasure",
      hash: "dig",
      fallbackPath: "/treasure.html",
      fallbackLabel: "Treasure desk",
      title: "Treasure Dig",
      eyebrow: "PASTURE AREA",
      prompt: "Press E to dig",
      actionLabel: "Dig",
    },
    garden: {
      kind: "garden",
      activity: "garden",
      hash: "crops",
      fallbackPath: "/garden.html",
      fallbackLabel: "Garden desk",
      title: "Garden Beds",
      eyebrow: "PASTURE AREA",
      prompt: "Press E to tend the garden",
      actionLabel: "Tend garden",
    },
    cook: {
      kind: "cook",
      activity: "cook",
      hash: "cook",
      fallbackPath: "/kitchen.html",
      fallbackLabel: "Kitchen desk",
      title: "Pasture Kitchen",
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
      title: "Race Track",
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
