import { dayOf } from "../core";
import { ACTIVITY_IDS, type ActivityId } from "./attempts";

export const DAILY_STREAK_BONUS_ID = "daily_streak_bonus";
export const DAILY_STREAK_RIBBON_ID = "daily_streak_ribbon";
export const STREAK_COSMETIC_ID = "hat-ribbon";
export const STREAK_COSMETIC_MIN_DAYS = 7;
export const DAILY_QUEST_LOOKBACK_DAYS = 60;

export type DailyActivityGoal = {
  id: string;
  activity: ActivityId;
  title: string;
  description: string;
  href: string;
};

const GOAL_COPY: Record<
  ActivityId,
  { title: string; description: string; href: string }
> = {
  fishing: {
    title: "Pond Catch",
    description: "Claim a successful fishing attempt at the Pond Pier.",
    href: "/fishing.html",
  },
  mining: {
    title: "Quarry Run",
    description: "Claim a successful mining attempt at the Crystal Quarry.",
    href: "/mining.html",
  },
  racing: {
    title: "Track Dash",
    description: "Claim a successful race at the Race Track.",
    href: "/racing.html",
  },
  treasure: {
    title: "Treasure Dig",
    description: "Claim a successful treasure hunt south of spawn.",
    href: "/treasure.html",
  },
  garden: {
    title: "Garden Water",
    description: "Claim a successful garden attempt at the Garden Beds.",
    href: "/garden.html",
  },
  cook: {
    title: "Kitchen Special",
    description: "Claim a successful cooking attempt at the Pasture Kitchen.",
    href: "/kitchen.html",
  },
};

export type ClaimedActivitiesByDay = ReadonlyMap<string, ReadonlySet<string>>;

export function dayKeyForDay(day: number): string {
  return "d:" + String(day);
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function rotatingDailyGoalsAt(day: number): DailyActivityGoal[] {
  const items = ACTIVITY_IDS.slice();
  const rand = mulberry32(day ^ 0x9e3779b9);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const current = items[i]!;
    items[i] = items[j]!;
    items[j] = current;
  }
  return items.slice(0, 3).map((activity) => ({
    id: "daily_play_" + activity,
    activity,
    ...GOAL_COPY[activity],
  }));
}

export function rotatingDailyGoals(now: number): DailyActivityGoal[] {
  return rotatingDailyGoalsAt(dayOf(now));
}

export function isGoalDayComplete(
  day: number,
  claimed: ClaimedActivitiesByDay,
): boolean {
  const set = claimed.get(dayKeyForDay(day));
  if (!set) return false;
  return rotatingDailyGoalsAt(day).every((goal) => set.has(goal.activity));
}

/** Consecutive completed UTC days, including today when all three goals are done. */
export function computeDailyQuestStreak(
  now: number,
  claimed: ClaimedActivitiesByDay,
): number {
  const today = dayOf(now);
  const start = isGoalDayComplete(today, claimed) ? today : today - 1;
  let streak = 0;
  for (let day = start; day > start - DAILY_QUEST_LOOKBACK_DAYS; day--) {
    if (!isGoalDayComplete(day, claimed)) break;
    streak += 1;
  }
  return streak;
}

export function streakBonusReward(streak: number): {
  rewardBoinglets: number;
  cosmeticId: string | null;
} {
  if (streak < 1) return { rewardBoinglets: 0, cosmeticId: null };
  const rewardBoinglets = 10 + 5 * Math.min(streak - 1, 6);
  return {
    rewardBoinglets,
    cosmeticId: streak >= STREAK_COSMETIC_MIN_DAYS ? STREAK_COSMETIC_ID : null,
  };
}

export type DailyQuestView = {
  dayKey: string;
  goals: Array<DailyActivityGoal & { complete: boolean }>;
  completeCount: number;
  allComplete: boolean;
  streak: number;
  bonus: {
    id: typeof DAILY_STREAK_BONUS_ID;
    title: string;
    rewardBoinglets: number;
    cosmeticId: string | null;
    eligible: boolean;
    claimed: boolean;
  };
};

export function buildDailyQuestView(input: {
  now: number;
  claimedByDay: ClaimedActivitiesByDay;
  bonusClaimedForDay: boolean;
  ribbonAlreadyOwned: boolean;
}): DailyQuestView {
  const day = dayOf(input.now);
  const dayKey = dayKeyForDay(day);
  const claimed = input.claimedByDay.get(dayKey) ?? new Set<string>();
  const goals = rotatingDailyGoalsAt(day).map((goal) => ({
    ...goal,
    complete: claimed.has(goal.activity),
  }));
  const completeCount = goals.filter((goal) => goal.complete).length;
  const allComplete = completeCount === goals.length;
  const streak = computeDailyQuestStreak(input.now, input.claimedByDay);
  const reward = streakBonusReward(streak);
  const cosmeticId =
    reward.cosmeticId && !input.ribbonAlreadyOwned ? reward.cosmeticId : null;
  return {
    dayKey,
    goals,
    completeCount,
    allComplete,
    streak,
    bonus: {
      id: DAILY_STREAK_BONUS_ID,
      title:
        streak > 1
          ? String(streak) + "-day streak bonus"
          : "Daily streak bonus",
      rewardBoinglets: reward.rewardBoinglets,
      cosmeticId,
      eligible:
        allComplete && reward.rewardBoinglets > 0 && !input.bonusClaimedForDay,
      claimed: input.bonusClaimedForDay,
    },
  };
}

export function collectClaimedActivitiesByDay(
  rows: Array<{ activity: string; day_key: string }>,
): Map<string, Set<string>> {
  const claimed = new Map<string, Set<string>>();
  for (const row of rows) {
    let set = claimed.get(row.day_key);
    if (!set) {
      set = new Set();
      claimed.set(row.day_key, set);
    }
    set.add(row.activity);
  }
  return claimed;
}
