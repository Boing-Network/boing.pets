import { describe, expect, it } from "vitest";
import {
  FRAME_BUDGET_MS,
  createFrameSampler,
  summarizeFrameTimes,
} from "../src/pasture3d/frameStats";
import { meadowFencePieces } from "../src/pasture3d/meadowDecor";
import { MEADOW_FENCES } from "../src/pasture3d/meadowLayout";
import { meadowHeight } from "../src/pasture3d/meadowHeight";

describe("frame time sampler", () => {
  it("averages a window and counts frames over the 60fps budget", () => {
    const summary = summarizeFrameTimes([8, 10, 16, 20, 24]);
    expect(summary.samples).toBe(5);
    expect(summary.avgMs).toBeCloseTo(15.6, 5);
    expect(summary.maxMs).toBe(24);
    expect(summary.overBudget).toBe(
      [8, 10, 16, 20, 24].filter((ms) => ms > FRAME_BUDGET_MS).length,
    );
  });

  it("keeps a rolling window of recent ticks", () => {
    const sampler = createFrameSampler(3);
    sampler.tick(1000);
    sampler.tick(1010);
    sampler.tick(1020);
    sampler.tick(1040);
    sampler.tick(1050);
    const summary = sampler.summary();
    expect(summary.samples).toBe(3);
    expect(summary.avgMs).toBeCloseTo((10 + 20 + 10) / 3, 5);
    expect(summary.maxMs).toBe(20);
  });
});

describe("instanced meadow fences", () => {
  it("merges each rail into shared top, bottom, and post pieces", () => {
    const pieces = meadowFencePieces();
    const tops = pieces.filter((row) => row.kind === "rail-top");
    const bottoms = pieces.filter((row) => row.kind === "rail-bottom");
    const posts = pieces.filter((row) => row.kind === "post");
    expect(tops.length).toBe(MEADOW_FENCES.length);
    expect(bottoms.length).toBe(MEADOW_FENCES.length);
    expect(posts.length).toBeGreaterThanOrEqual(MEADOW_FENCES.length * 2);
    for (const [i, rail] of MEADOW_FENCES.entries()) {
      const midX = (rail.x1 + rail.x2) / 2;
      const midZ = (rail.z1 + rail.z2) / 2;
      const y = meadowHeight(midX, midZ);
      expect(tops[i]?.x).toBeCloseTo(midX, 5);
      expect(tops[i]?.z).toBeCloseTo(midZ, 5);
      expect(tops[i]?.y).toBeCloseTo(y + 0.7, 5);
      expect(bottoms[i]?.y).toBeCloseTo(y + 0.42, 5);
    }
  });
});
