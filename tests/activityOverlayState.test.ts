import { describe, expect, it } from "vitest";
import {
  claimResultForActivity,
  formatRewardBreakdown,
  type ClaimRewardResult,
} from "../src/ui/rewardBreakdown";
describe("activity overlay result isolation", () => {
  it("keeps the played activity even when the payload names a different one", () => {
    const leaked = claimResultForActivity(
      {
        activity: "fishing",
        reward: {
          name: "Silver Minnow",
          rarity: "common",
          rewardBoinglets: 0,
          itemId: "fish-minnow",
        },
      },
      "mining",
    );
    const view = formatRewardBreakdown(leaked);
    expect(leaked.activity).toBe("mining");
    expect(view.activityTitle).toBe("Mining");
    expect(view.itemName).toBe("Silver Minnow");
    expect(view.totalBoinglets).toBe(0);
  });

  it("renders a mining claim with the quarry title and real Boinglet amount", () => {
    const view = formatRewardBreakdown(
      claimResultForActivity(
        {
          activity: "mining",
          reward: {
            name: "Spark Ore",
            rarity: "uncommon",
            rewardBoinglets: 10,
            itemId: "ore-spark",
          },
          remaining: 2,
        },
        "mining",
      ),
    );
    expect(view.activityTitle).toBe("Mining");
    expect(view.itemName).toBe("Spark Ore");
    expect(view.itemId).toBe("ore-spark");
    expect(view.totalBoinglets).toBe(10);
    expect(view.lines).toEqual([{ key: "base", label: "Base", value: "+10ℬ" }]);
  });

  it("formats each activity with its own title and Boinglet total", () => {
    const cases: Array<[string, string, string, string, number]> = [
      ["fishing", "Fishing", "Silver Minnow", "fish-minnow", 4],
      ["treasure", "Treasure", "Shiny Charm", "charm-shiny", 6],
      ["racing", "Racing", "Finish Ribbon", "ribbon-finish", 5],
      ["garden", "Garden", "Meadow Sprout", "crop-sprout", 3],
      ["cook", "Cooking", "Curb Salad", "food-snack", 8],
    ];
    for (const [activity, title, name, itemId, amount] of cases) {
      const result: ClaimRewardResult = {
        activity: "mining",
        reward: { name, rewardBoinglets: amount, itemId },
      };
      const view = formatRewardBreakdown(
        claimResultForActivity(result, activity),
      );
      expect(view.activityTitle).toBe(title);
      expect(view.itemName).toBe(name);
      expect(view.totalBoinglets).toBe(amount);
      expect(view.lines[0]).toEqual({
        key: "base",
        label: "Base",
        value: `+${amount}ℬ`,
      });
    }
  });
});
