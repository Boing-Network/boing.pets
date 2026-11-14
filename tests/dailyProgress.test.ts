import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ATTEMPT_DAILY_CAP,
  type ActivityId,
} from "../src/content/attempts";
import {
  areaProgressForStation,
  buildDailyProgress,
  formatAreaLine,
  formatAreaTries,
  formatDailyChipTitle,
} from "../src/pasture3d/dailyProgress";

describe("daily progress HUD", () => {
  it("formats per-area tries and quest tags", () => {
    expect(formatAreaTries({ label: "Cook", used: 2, cap: 5 })).toBe(
      "Cook 2/5",
    );
    const progress = buildDailyProgress({
      dailies: {
        goals: [
          {
            id: "daily_play_cook",
            activity: "cook",
            title: "Kitchen Special",
            description: "Cook",
            href: "/kitchen.html",
            complete: false,
          },
          {
            id: "daily_play_mining",
            activity: "mining",
            title: "Quarry Run",
            description: "Mine",
            href: "/mining.html",
            complete: true,
          },
          {
            id: "daily_play_fishing",
            activity: "fishing",
            title: "Pond Catch",
            description: "Fish",
            href: "/fishing.html",
            complete: false,
          },
        ],
        completeCount: 1,
        allComplete: false,
        streak: 2,
      },
      attempts: {
        cook: {
          activity: "cook",
          attemptsUsed: 2,
          dailyCap: 5,
          remaining: 3,
        },
        mining: {
          activity: "mining",
          attemptsUsed: 3,
          dailyCap: 3,
          remaining: 0,
        },
      },
    });
    expect(formatDailyChipTitle(progress)).toBe("Daily 1/3");
    const cook = progress.areas.find((area) => area.activity === "cook")!;
    expect(formatAreaLine(cook)).toBe("Cook 2/5 · quest");
    const mine = progress.areas.find((area) => area.activity === "mining")!;
    expect(formatAreaLine(mine)).toBe("Mine 3/3 · quest done");
    const fish = progress.areas.find((area) => area.activity === "fishing")!;
    expect(formatAreaLine(fish)).toBe(
      "Fish 0/" + ACTIVITY_ATTEMPT_DAILY_CAP + " · quest",
    );
    const race = progress.areas.find((area) => area.activity === "racing")!;
    expect(race.quest).toBe(false);
    expect(formatAreaLine(race)).toBe("Race 0/" + ACTIVITY_ATTEMPT_DAILY_CAP);
    expect(areaProgressForStation(progress, "cook")?.label).toBe("Cook");
    expect(areaProgressForStation(progress, "craft")).toBeNull();
    expect(progress.areas.map((area) => area.activity)).toEqual([
      "fishing",
      "mining",
      "racing",
      "treasure",
      "garden",
      "cook",
    ] satisfies ActivityId[]);
  });
});
