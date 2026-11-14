/** One-time first-play explainers for each pasture activity area. */

import type { ActivityStationKind } from "./stationInteract";
import { ACTIVITY_STATION_KINDS } from "./stationInteract";

export const ACTIVITY_TIPS_STORAGE_KEY = "boing-pets-activity-tips-v1";

export type ActivityTip = {
  kind: ActivityStationKind;
  title: string;
  body: string;
};

export const ACTIVITY_TIPS: Record<ActivityStationKind, ActivityTip> = {
  mine: {
    kind: "mine",
    title: "Crystal Yard",
    body: "Tap in time with the vein pulses. Misses use an attempt, but you only sign if you want to keep the crystals.",
  },
  fish: {
    kind: "fish",
    title: "The Canal",
    body: "Cast, then hook when the float hits the window. Misses skip the signature; sign only to keep a catch.",
  },
  treasure: {
    kind: "treasure",
    title: "Dig Site",
    body: "Memorize the glowing tile, then dig. A wrong tile uses an attempt with no signature.",
  },
  garden: {
    kind: "garden",
    title: "City Garden",
    body: "Hold to water, and release in the hit window. Sign only if you want to keep the harvest.",
  },
  cook: {
    kind: "cook",
    title: "Street Kitchen",
    body: "Watch the recipe flash, then tap ingredients in that order. Sign only if you want to keep the dish.",
  },
  race: {
    kind: "race",
    title: "Skate Park",
    body: "Hit the beats to stay on the track. Sign only if you want the finish reward.",
  },
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type SeenActivityTips = Partial<Record<ActivityStationKind, true>>;

function store(
  storage: StorageLike | null = typeof localStorage === "undefined"
    ? null
    : localStorage,
): StorageLike | null {
  return storage;
}

export function parseSeenActivityTips(raw: unknown): SeenActivityTips {
  if (!raw || typeof raw !== "object") return {};
  const seen: SeenActivityTips = {};
  for (const kind of ACTIVITY_STATION_KINDS) {
    if ((raw as Record<string, unknown>)[kind] === true) seen[kind] = true;
  }
  return seen;
}

export function loadSeenActivityTips(
  storage?: StorageLike | null,
): SeenActivityTips {
  const db = store(storage);
  if (!db) return {};
  try {
    return parseSeenActivityTips(
      JSON.parse(db.getItem(ACTIVITY_TIPS_STORAGE_KEY) || "null"),
    );
  } catch {
    return {};
  }
}

export function hasSeenActivityTip(
  kind: ActivityStationKind,
  storage?: StorageLike | null,
): boolean {
  return loadSeenActivityTips(storage)[kind] === true;
}

export function markActivityTipSeen(
  kind: ActivityStationKind,
  storage?: StorageLike | null,
): SeenActivityTips {
  const db = store(storage);
  const next = { ...loadSeenActivityTips(db), [kind]: true as const };
  if (db) {
    try {
      db.setItem(ACTIVITY_TIPS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode or quota — keep the in-memory result only.
    }
  }
  return next;
}

export function activityTipFor(kind: ActivityStationKind): ActivityTip {
  return ACTIVITY_TIPS[kind];
}
