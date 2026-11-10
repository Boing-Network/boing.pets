import { describe, expect, it } from "vitest";
import { meadowHeight } from "../src/pasture3d/meadowHeight";
import {
  buildPasturePathMeshData,
  PATH_LIFT,
  pasturePathWear,
} from "../src/pasture3d/pasturePath";

describe("pasture path wear", () => {
  it("is packed dirt on the trail and grass off to the side", () => {
    expect(pasturePathWear(0, 20)).toBeGreaterThan(0.85);
    expect(pasturePathWear(0, 0)).toBeGreaterThan(0.85);
    expect(pasturePathWear(12, 12)).toBeLessThan(0.1);
  });

  it("builds a height-conforming mesh without empty plank ends", () => {
    const data = buildPasturePathMeshData(48, 40);
    expect(data.indices.length).toBeGreaterThan(100);
    expect(data.positions.length).toBeGreaterThan(100 * 3);
    let minWear = 1;
    let maxWear = 0;
    for (let i = 0; i < data.weaves.length; i++) {
      const wear = data.weaves[i]!;
      expect(wear).toBeGreaterThanOrEqual(0);
      if (wear < minWear) minWear = wear;
      if (wear > maxWear) maxWear = wear;
      const x = data.positions[i * 3]!;
      const y = data.positions[i * 3 + 1]!;
      const z = data.positions[i * 3 + 2]!;
      expect(y).toBeCloseTo(meadowHeight(x, z) + PATH_LIFT, 5);
    }
    expect(minWear).toBeLessThan(0.05);
    expect(maxWear).toBeGreaterThan(0.85);
  });
});
