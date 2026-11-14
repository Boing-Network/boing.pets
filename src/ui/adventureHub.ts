/** Pure helpers for the Dispatch adventure hub. */

import {
  ADVENTURE_DURATIONS,
  ADVENTURE_EXCLUSIVE_ITEMS,
  ADVENTURE_LOCATIONS,
  ADVENTURE_SLOT_MILESTONES,
  STYLE_LUCK_RARITY_POINTS,
  type AdventureDurationId,
  type AdventureLocationId,
  type AdventurePreview,
  type AdventureStyleSnapshot,
  type StyleSetId,
  adventureDurationById,
  adventureLocationById,
} from "../content/adventures";
import { itemRarity } from "../content/items";
import type { ItemRarity } from "../content/rarities";
import { ITEM_RARITIES } from "../content/rarities";

export type AdventureRunView = {
  id: string;
  locationId: string;
  durationId: string;
  slot: number;
  startedAt: number;
  endsAt: number;
  completedAt: number | null;
  outcome: string | null;
  status: "running" | "ready" | "claimed";
  claimedAt: number | null;
  diminishing: number;
  rewards: AdventureRewardView[];
};

export type AdventureRewardView = {
  id: string;
  kind: string;
  gameItemId: string | null;
  currency: string | null;
  qty: number;
  rarity: string | null;
  duplicate: boolean;
  mintStatus: string;
  mintTx?: string | null;
  ownerCount?: number | null;
};

export type AdventureCollectionItem = {
  id: string;
  name: string;
  rarity: string;
  owned: boolean;
};

export type DispatchFilters = {
  durationId: AdventureDurationId | "all";
  rarity: ItemRarity | "all";
};

export function emptyDispatchFilters(): DispatchFilters {
  return { durationId: "all", rarity: "all" };
}

export function formatAdventureClock(
  at: number,
  zone = "America/New_York",
): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(at));
  } catch {
    return new Date(at).toLocaleString();
  }
}

export function formatCountdown(ms: number): string {
  const remain = Math.max(0, Math.floor(ms));
  const totalSec = Math.floor(remain / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    return `${days}d ${remH}h`;
  }
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function runProgress(run: AdventureRunView, now: number): number {
  const span = Math.max(1, run.endsAt - run.startedAt);
  return Math.min(1, Math.max(0, (now - run.startedAt) / span));
}

export function locationRewardPreview(locationId: string): string {
  return adventureLocationById(locationId)?.theme ?? "";
}

export function previewFor(
  previews: readonly AdventurePreview[],
  locationId: string,
  durationId: string,
): AdventurePreview | undefined {
  return previews.find(
    (row) => row.locationId === locationId && row.durationId === durationId,
  );
}

export function cardMatchesFilters(
  locationId: string,
  durationId: string,
  filters: DispatchFilters,
  preview: AdventurePreview | undefined,
): boolean {
  if (filters.durationId !== "all" && filters.durationId !== durationId)
    return false;
  if (filters.rarity === "all") return true;
  const chance =
    preview?.rarities.find((row) => row.id === filters.rarity)?.chance ?? 0;
  return chance > 0;
}

export function activeRunForLocation(
  runs: readonly AdventureRunView[],
  locationId: string,
): AdventureRunView | undefined {
  return runs.find(
    (run) =>
      run.locationId === locationId &&
      (run.status === "running" || run.status === "ready"),
  );
}

export function readyRunCount(runs: readonly AdventureRunView[]): number {
  return runs.filter((run) => run.status === "ready").length;
}

export function runningRunCount(runs: readonly AdventureRunView[]): number {
  return runs.filter((run) => run.status === "running").length;
}

export function nextReadyAt(
  runs: readonly AdventureRunView[],
  now: number,
): number | null {
  const ends = runs
    .filter((run) => run.status === "running" && run.endsAt > now)
    .map((run) => run.endsAt);
  if (!ends.length) return null;
  return Math.min(...ends);
}

export function lockedSlotMilestones(unlockedSlots: number) {
  return ADVENTURE_SLOT_MILESTONES.filter((row) => row.slots > unlockedSlots);
}

export function stylePointsFromEquipped(equippedIds: readonly string[]): {
  id: string;
  rarity: ItemRarity | null;
  points: number;
}[] {
  return equippedIds.map((id) => {
    const rarity = itemRarity(id);
    return {
      id,
      rarity,
      points: rarity ? STYLE_LUCK_RARITY_POINTS[rarity] : 0,
    };
  });
}

export function luckCompareForLocations(
  snapshot: AdventureStyleSnapshot | null,
  previews: readonly AdventurePreview[],
  durationId: string,
): { locationId: string; name: string; multiplier: number; bonus: number }[] {
  return ADVENTURE_LOCATIONS.map((location) => {
    const preview = previewFor(previews, location.id, durationId);
    return {
      locationId: location.id,
      name: location.name,
      multiplier: preview?.styleLuck.multiplier ?? snapshot?.multiplier ?? 1,
      bonus: preview?.styleLuck.adventureBonus ?? snapshot?.adventureBonus ?? 1,
    };
  });
}

export function durationLabel(id: string): string {
  return adventureDurationById(id)?.name ?? id;
}

export function allDurationIds(): AdventureDurationId[] {
  return ADVENTURE_DURATIONS.map((row) => row.id);
}

export function allLocationIds(): AdventureLocationId[] {
  return ADVENTURE_LOCATIONS.map((row) => row.id);
}

export function exclusiveCollectionFallback(ownedIds: ReadonlySet<string>): {
  found: number;
  total: number;
  items: AdventureCollectionItem[];
} {
  const items = Object.entries(ADVENTURE_EXCLUSIVE_ITEMS).map(([id, row]) => ({
    id,
    name: row.name,
    rarity: row.rarity,
    owned: ownedIds.has(id),
  }));
  return {
    found: items.filter((item) => item.owned).length,
    total: items.length,
    items,
  };
}

export function percentLabel(value: number, digits = 2): string {
  const pct = value * 100;
  if (pct >= 1) return `${pct.toFixed(Math.min(digits, 1))}%`;
  if (pct >= 0.1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
}

export const FILTER_RARITIES: readonly (ItemRarity | "all")[] = [
  "all",
  ...ITEM_RARITIES,
];

export type StyleSetSummary = { id: StyleSetId; active: boolean };
