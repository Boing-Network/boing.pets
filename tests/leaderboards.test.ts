import { describe, expect, it } from "vitest";
import { DAY } from "../src/core";
import {
  attemptLeaderboardScore,
  fishingCatchScore,
  LEADERBOARDS,
  racingFinishScore,
  rankLeaderboard,
  weekKey,
  weekRange,
  winnerOf,
} from "../src/content/leaderboards";

describe("weekly activity leaderboards", () => {
  it("uses the same 7-day UTC buckets as weekly quests", () => {
    const start = 20 * 7 * DAY;
    expect(weekKey(start)).toBe("w:20");
    expect(weekKey(start + 7 * DAY - 1)).toBe("w:20");
    expect(weekKey(start + 7 * DAY)).toBe("w:21");
    const current = weekRange(start + DAY, "current");
    const previous = weekRange(start + DAY, "previous");
    expect(current.key).toBe("w:20");
    expect(previous.key).toBe("w:19");
    expect(current.end - current.start).toBe(7 * DAY);
    expect(previous.end).toBe(current.start);
  });

  it("scores races by finish time and catches by rarity", () => {
    expect(
      racingFinishScore(
        { tapElapsedMs: [800, 1500, 2410] },
        { rarity: "place-2" },
      ),
    ).toBe(2410);
    expect(racingFinishScore(null, { rarity: "place-1" })).toBe(100_000);
    expect(fishingCatchScore({ rarity: "epic", rewardBoinglets: 20 })).toBe(
      4020,
    );
    expect(
      fishingCatchScore({ rarity: "rare", rewardBoinglets: 12, score: 99 }),
    ).toBe(99);
    expect(
      attemptLeaderboardScore("racing", { tapElapsedMs: [1200] }, {}),
    ).toBe(1200);
    expect(attemptLeaderboardScore("garden", {}, { rarity: "common" })).toBe(
      null,
    );
  });

  it("keeps each wallet's best score and ranks ties stably", () => {
    const ranked = rankLeaderboard(
      [
        { owner: "0xb", score: 200, label: "B" },
        { owner: "0xa", score: 100, label: "A slow" },
        { owner: "0xa", score: 80, label: "A fast" },
        { owner: "0xc", score: 80, label: "C" },
      ],
      "lower",
    );
    expect(ranked.map((row) => row.owner)).toEqual(["0xa", "0xc", "0xb"]);
    expect(ranked[0]?.score).toBe(80);
    expect(winnerOf(ranked)?.owner).toBe("0xa");
    expect(LEADERBOARDS).toHaveLength(2);
  });
});
