import { DAY, dayOf } from "../core";
import type { ActivityId } from "./attempts";
import { isItemRarity, type ItemRarity } from "./rarities";

export const LEADERBOARD_IDS = ["fastest_race", "best_catch"] as const;
export type LeaderboardId = (typeof LEADERBOARD_IDS)[number];

export const LEADERBOARD_SIZE = 10;

export const RARITY_RANK: Record<ItemRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

export type LeaderboardDef = {
  id: LeaderboardId;
  title: string;
  description: string;
  activity: Extract<ActivityId, "racing" | "fishing">;
  better: "lower" | "higher";
  unit: string;
  rewardBoinglets: number;
  cosmeticId: string;
  questId: string;
};

export const LEADERBOARDS: LeaderboardDef[] = [
  {
    id: "fastest_race",
    title: "Fastest race",
    description: "Lowest finish time on a claimed Race Track run this week.",
    activity: "racing",
    better: "lower",
    unit: "ms",
    rewardBoinglets: 35,
    cosmeticId: "hat-antenna",
    questId: "weekly_board_fastest_race",
  },
  {
    id: "best_catch",
    title: "Best catch",
    description: "Rarest claimed Pond Pier catch this week, then Boinglets.",
    activity: "fishing",
    better: "higher",
    unit: "pts",
    rewardBoinglets: 35,
    cosmeticId: "hat-leaf",
    questId: "weekly_board_best_catch",
  },
];

export function leaderboardById(id: string): LeaderboardDef | null {
  return LEADERBOARDS.find((board) => board.id === id) ?? null;
}

export function weekIndex(now: number): number {
  return Math.floor(dayOf(now) / 7);
}

export function weekKeyForIndex(index: number): string {
  return "w:" + String(index);
}

export function weekKey(now: number): string {
  return weekKeyForIndex(weekIndex(now));
}

export function weekRange(
  now: number,
  which: "current" | "previous",
): {
  key: string;
  start: number;
  end: number;
} {
  const index = weekIndex(now) - (which === "previous" ? 1 : 0);
  const start = index * 7 * DAY;
  return { key: weekKeyForIndex(index), start, end: start + 7 * DAY };
}

export function fishingCatchScore(reward: {
  rarity?: string;
  rewardBoinglets?: number;
  score?: number;
}): number {
  if (typeof reward.score === "number" && Number.isFinite(reward.score))
    return reward.score;
  const rank = isItemRarity(reward.rarity) ? RARITY_RANK[reward.rarity] : 0;
  return rank * 1000 + (reward.rewardBoinglets || 0);
}

export function racingFinishScore(
  input: { tapElapsedMs?: number[] } | null | undefined,
  reward: { rarity?: string; score?: number },
): number {
  if (typeof reward.score === "number" && Number.isFinite(reward.score))
    return reward.score;
  const taps = input?.tapElapsedMs;
  if (Array.isArray(taps) && taps.length) {
    const last = taps[taps.length - 1]!;
    if (Number.isFinite(last) && last >= 0) return Math.round(last);
  }
  const place = Number(String(reward.rarity || "").replace("place-", ""));
  if (place >= 1 && place <= 3) return place * 100_000;
  return Number.MAX_SAFE_INTEGER;
}

export function attemptLeaderboardScore(
  activity: ActivityId,
  input: Record<string, unknown> | null,
  reward: { rarity?: string; rewardBoinglets?: number },
): number | null {
  if (activity === "fishing") return fishingCatchScore(reward);
  if (activity === "racing")
    return racingFinishScore(
      input as { tapElapsedMs?: number[] } | null,
      reward,
    );
  return null;
}

export type LeaderboardEntry = {
  owner: string;
  score: number;
  label: string;
  detail?: string;
};

export function rankLeaderboard(
  rows: LeaderboardEntry[],
  better: "lower" | "higher",
  limit = LEADERBOARD_SIZE,
): Array<LeaderboardEntry & { rank: number }> {
  const sorted = rows.slice().sort((a, b) => {
    if (a.score !== b.score)
      return better === "lower" ? a.score - b.score : b.score - a.score;
    return a.owner.localeCompare(b.owner);
  });
  const bestByOwner = new Map<string, LeaderboardEntry>();
  for (const row of sorted) {
    if (!bestByOwner.has(row.owner)) bestByOwner.set(row.owner, row);
  }
  const unique = [...bestByOwner.values()].sort((a, b) => {
    if (a.score !== b.score)
      return better === "lower" ? a.score - b.score : b.score - a.score;
    return a.owner.localeCompare(b.owner);
  });
  return unique
    .slice(0, limit)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function winnerOf(
  ranked: Array<LeaderboardEntry & { rank: number }>,
): (LeaderboardEntry & { rank: number }) | null {
  return ranked.find((row) => row.rank === 1) ?? null;
}
