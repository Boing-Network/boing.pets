import { describe, expect, it } from "vitest";
import {
  MEADOW_TREE_SPOTS,
  PASTURE_GROUND_RADIUS,
  pastureGroundRadius,
} from "../src/pasture3d/meadowLayout";
import { obstaclesForZone } from "../src/pasture3d/pathing";
import { PASTURE_ZONE } from "../src/world/config/zones";

describe("enlarged pasture layout", () => {
  const obstacles = obstaclesForZone(PASTURE_ZONE);

  it("covers the walkable square with terrain and keeps trees in bounds", () => {
    const { bounds } = PASTURE_ZONE;
    expect(PASTURE_GROUND_RADIUS).toBe(pastureGroundRadius(bounds));
    expect(PASTURE_GROUND_RADIUS).toBeGreaterThan(
      Math.hypot(bounds.maxX, bounds.maxZ),
    );
    expect(MEADOW_TREE_SPOTS.length).toBeGreaterThanOrEqual(20);
    for (const [x, z] of MEADOW_TREE_SPOTS) {
      expect(x).toBeGreaterThanOrEqual(bounds.minX);
      expect(x).toBeLessThanOrEqual(bounds.maxX);
      expect(z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(z).toBeLessThanOrEqual(bounds.maxZ);
      expect(
        obstacles.some(
          (o) => o.id !== "meadow-tree" && Math.hypot(o.x - x, o.z - z) < 2.4,
        ),
      ).toBe(false);
    }
  });
});
