import { describe, expect, it } from "vitest";
import {
  chainStatusDescription,
  chainStatusLabel,
  claimResultForActivity,
  formatRewardBreakdown,
} from "../src/ui/rewardBreakdown";

describe("formatRewardBreakdown", () => {
  it("shows a base-only claim and remaining attempts", () => {
    const view = formatRewardBreakdown({
      activity: "fishing",
      reward: {
        name: "Ripple Minnow",
        rarity: "common",
        rewardBoinglets: 4,
        itemId: "fish-ripple",
      },
      remaining: 2,
    });
    expect(view.activityTitle).toBe("Fishing");
    expect(view.itemName).toBe("Ripple Minnow");
    expect(view.totalBoinglets).toBe(4);
    expect(view.lines).toEqual([{ key: "base", label: "Base", value: "+4ℬ" }]);
    expect(view.extras).toEqual([
      { key: "remaining", label: "Attempts left today", value: "2" },
    ]);
    expect(view.summary).toContain("Ripple Minnow");
    expect(view.summary).toContain("2 attempts remaining");
  });

  it("breaks down party, variety, streak Sparkles, and XP", () => {
    const view = formatRewardBreakdown({
      activity: "mining",
      reward: {
        name: "Spark Ore",
        rarity: "uncommon",
        rewardBoinglets: 10,
        itemId: "ore-spark",
      },
      party_bonus: { percent: 0.2, amount: 2 },
      variety_awarded: 5,
      streak_sparkles: 3,
      xp: 8,
      remaining: 1,
    });
    expect(view.activityTitle).toBe("Mining");
    expect(view.totalBoinglets).toBe(17);
    expect(view.lines).toEqual([
      { key: "base", label: "Base", value: "+10ℬ" },
      { key: "party", label: "Party +20%", value: "+2ℬ" },
      { key: "variety", label: "Variety day", value: "+5ℬ" },
      { key: "sparkles", label: "Streak Sparkles", value: "+3 Sparkles" },
      { key: "total", label: "Total Boinglets", value: "+17ℬ" },
    ]);
    expect(view.extras.map((e) => e.key)).toEqual(["xp", "remaining"]);
    expect(view.summary).toContain("+17 Boinglets");
    expect(view.summary).toContain("+3 Sparkles");
    expect(view.summary).toContain("+8 XP");
    expect(view.summary).toContain("1 attempt remaining");
  });

  it("omits zero party, variety, and sparkles lines", () => {
    const view = formatRewardBreakdown({
      activity: "cook",
      reward: {
        name: "Sprout Salad",
        rewardBoinglets: 8,
        itemId: "food-snack",
      },
      party_bonus: { percent: 0.1, amount: 0 },
      variety_awarded: 0,
    });
    expect(view.lines.map((l) => l.key)).toEqual(["base"]);
    expect(view.extras).toEqual([]);
  });

  it("keeps the claimed activity when a payload names a different one", () => {
    const view = formatRewardBreakdown(
      claimResultForActivity(
        {
          activity: "fishing",
          reward: {
            name: "Silver Minnow",
            rewardBoinglets: 4,
            itemId: "fish-minnow",
          },
        },
        "mining",
      ),
    );
    expect(view.activityTitle).toBe("Mining");
    expect(view.totalBoinglets).toBe(4);
    expect(view.lines).toEqual([{ key: "base", label: "Base", value: "+4ℬ" }]);
  });
});

describe("reward chain status", () => {
  it("labels pending and confirmed states", () => {
    expect(chainStatusLabel("pending")).toBe("On-chain: pending");
    expect(chainStatusLabel("confirmed")).toBe("On-chain: confirmed");
    expect(chainStatusLabel("failed")).toBe("On-chain: failed");
    expect(chainStatusDescription("pending")).toMatch(/confirm/i);
    expect(chainStatusDescription("confirmed")).toMatch(/inventory/i);
    expect(chainStatusDescription("failed")).toMatch(/try/i);
  });
});
