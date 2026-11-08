import { dayOf } from "../core";

export const RACE_DAILY_HEAT_CAP = 3;
export const RACE_GO_MIN_MS = 1_800;
export const RACE_GO_MAX_MS = 4_200;
export const RACE_FINISH_WINDOW_MS = 2_200;
/** Place thresholds measured from go_at (ms). */
export const RACE_GOLD_MS = 500;
export const RACE_SILVER_MS = 1_200;

export interface TrackDef {
  id: string;
  name: string;
  blurb: string;
}

export interface RibbonDef {
  id: string;
  name: string;
  place: 1 | 2 | 3;
  rewardBoinglets: number;
}

export const TRACKS: TrackDef[] = [
  {
    id: "track-meadow",
    name: "Meadow Dash",
    blurb: "A soft sprint through the pasture clover.",
  },
  {
    id: "track-plaza",
    name: "Plaza Loop",
    blurb: "Weave the adoption plaza fountain.",
  },
  {
    id: "track-cavern",
    name: "Cavern Sprint",
    blurb: "A crystal-lit burst under the hills.",
  },
];

export const RIBBONS: RibbonDef[] = [
  {
    id: "ribbon-gold",
    name: "Gold Race Ribbon",
    place: 1,
    rewardBoinglets: 22,
  },
  {
    id: "ribbon-silver",
    name: "Silver Race Ribbon",
    place: 2,
    rewardBoinglets: 12,
  },
  {
    id: "ribbon-bronze",
    name: "Bronze Race Ribbon",
    place: 3,
    rewardBoinglets: 6,
  },
];

export function trackById(id: string): TrackDef | undefined {
  return TRACKS.find((t) => t.id === id);
}

export function ribbonByPlace(place: 1 | 2 | 3): RibbonDef {
  return RIBBONS.find((r) => r.place === place)!;
}

export function isRibbonItem(itemId: string): boolean {
  return itemId.startsWith("ribbon-");
}

export function racingDayKey(now: number): string {
  return `d:${dayOf(now)}`;
}

export function pickTrack(seed: string): TrackDef {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TRACKS[h % TRACKS.length]!;
}

export function goDelayMs(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 17 + seed.charCodeAt(i)) >>> 0;
  const span = RACE_GO_MAX_MS - RACE_GO_MIN_MS;
  return RACE_GO_MIN_MS + (h % (span + 1));
}

export function placeFromReaction(deltaMs: number): 1 | 2 | 3 | null {
  if (deltaMs < 0 || deltaMs > RACE_FINISH_WINDOW_MS) return null;
  if (deltaMs <= RACE_GOLD_MS) return 1;
  if (deltaMs <= RACE_SILVER_MS) return 2;
  return 3;
}
