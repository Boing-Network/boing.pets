import { describe, expect, it } from "vitest";
import { DAY, dayOf } from "../src/core";
import { ACTIVITY_IDS } from "../src/content/attempts";
import {
  buildDailyQuestView,
  collectClaimedActivitiesByDay,
  computeDailyQuestStreak,
  dayKeyForDay,
  rotatingDailyGoals,
  rotatingDailyGoalsAt,
  streakBonusReward,
  STREAK_COSMETIC_ID,
} from "../src/content/dailyQuests";

const noon = (day: number) => day * DAY + DAY / 2;

describe("daily activity quests", () => {
  it("rotates three unique activities for a UTC day", () => {
    const now = Date.UTC(2026, 10, 13, 15);
    const goals = rotatingDailyGoals(now);
    expect(goals).toHaveLength(3);
    const ids = goals.map((g) => g.activity);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(ACTIVITY_IDS).toContain(id);
    expect(rotatingDailyGoalsAt(dayOf(now))).toEqual(goals);
    expect(rotatingDailyGoals(now + 1)).toEqual(goals);
  });

  it("changes the lineup across days and covers the full activity pool", () => {
    const start = dayOf(Date.UTC(2026, 10, 1));
    const seen = new Set<string>();
    const signatures = new Set<string>();
    for (let d = 0; d < 14; d++) {
      const goals = rotatingDailyGoalsAt(start + d);
      signatures.add(goals.map((g) => g.activity).join(","));
      for (const goal of goals) seen.add(goal.activity);
    }
    expect(signatures.size).toBeGreaterThan(5);
    expect(seen.size).toBe(ACTIVITY_IDS.length);
  });

  it("counts a streak from consecutive completed UTC days", () => {
    const today = dayOf(Date.UTC(2026, 10, 13, 18));
    const rows: Array<{ activity: string; day_key: string }> = [];
    for (const day of [today - 2, today - 1, today]) {
      for (const goal of rotatingDailyGoalsAt(day)) {
        rows.push({ activity: goal.activity, day_key: dayKeyForDay(day) });
      }
    }
    const claimed = collectClaimedActivitiesByDay(rows);
    expect(computeDailyQuestStreak(noon(today), claimed)).toBe(3);
    expect(computeDailyQuestStreak(noon(today + 1), claimed)).toBe(3);
    expect(computeDailyQuestStreak(noon(today + 2), claimed)).toBe(0);
  });

  it("keeps yesterday's streak alive until today is finished", () => {
    const today = dayOf(Date.UTC(2026, 10, 13, 8));
    const rows = rotatingDailyGoalsAt(today - 1).map((goal) => ({
      activity: goal.activity,
      day_key: dayKeyForDay(today - 1),
    }));
    const claimed = collectClaimedActivitiesByDay(rows);
    expect(computeDailyQuestStreak(noon(today), claimed)).toBe(1);
  });

  it("builds today's view and a 7-day streak cosmetic bonus", () => {
    const today = dayOf(Date.UTC(2026, 10, 13, 20));
    const rows: Array<{ activity: string; day_key: string }> = [];
    for (let d = 0; d < 7; d++) {
      const day = today - d;
      for (const goal of rotatingDailyGoalsAt(day)) {
        rows.push({ activity: goal.activity, day_key: dayKeyForDay(day) });
      }
    }
    const view = buildDailyQuestView({
      now: noon(today),
      claimedByDay: collectClaimedActivitiesByDay(rows),
      bonusClaimedForDay: false,
      ribbonAlreadyOwned: false,
    });
    expect(view.allComplete).toBe(true);
    expect(view.completeCount).toBe(3);
    expect(view.streak).toBe(7);
    expect(view.bonus.eligible).toBe(true);
    expect(view.bonus.rewardBoinglets).toBe(
      streakBonusReward(7).rewardBoinglets,
    );
    expect(view.bonus.cosmeticId).toBe(STREAK_COSMETIC_ID);
    const claimed = buildDailyQuestView({
      now: noon(today),
      claimedByDay: collectClaimedActivitiesByDay(rows),
      bonusClaimedForDay: true,
      ribbonAlreadyOwned: true,
    });
    expect(claimed.bonus.eligible).toBe(false);
    expect(claimed.bonus.claimed).toBe(true);
    expect(claimed.bonus.cosmeticId).toBe(null);
  });
});
