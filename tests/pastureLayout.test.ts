import { describe, expect, it } from "vitest";
import {
  distanceToPasturePath,
  MEADOW_BUSH_SPOTS,
  MEADOW_FENCE_HALF_THICK,
  MEADOW_FENCES,
  MEADOW_TREE_SPOTS,
  PASTURE_GROUND_RADIUS,
  pastureGroundRadius,
} from "../src/pasture3d/meadowLayout";
import { obstaclesForZone } from "../src/pasture3d/pathing";
import { PASTURE_ZONE } from "../src/world/config/zones";

describe("enlarged pasture layout", () => {
  const obstacles = obstaclesForZone(PASTURE_ZONE);
  const solids = obstacles.filter((o) => o.id !== "meadow-tree");

  it("covers the walkable square with terrain and keeps trees in bounds", () => {
    const { bounds } = PASTURE_ZONE;
    expect(PASTURE_GROUND_RADIUS).toBe(pastureGroundRadius(bounds));
    expect(PASTURE_GROUND_RADIUS).toBeGreaterThan(
      Math.hypot(bounds.maxX, bounds.maxZ),
    );
    expect(MEADOW_TREE_SPOTS.length).toBeGreaterThanOrEqual(36);
    expect(MEADOW_BUSH_SPOTS.length).toBeGreaterThanOrEqual(16);
    expect(MEADOW_FENCES.length).toBeGreaterThanOrEqual(4);
    expect(PASTURE_ZONE.paths.length).toBeGreaterThan(4);
    for (const [x, z] of [...MEADOW_TREE_SPOTS, ...MEADOW_BUSH_SPOTS]) {
      expect(x).toBeGreaterThanOrEqual(bounds.minX);
      expect(x).toBeLessThanOrEqual(bounds.maxX);
      expect(z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(z).toBeLessThanOrEqual(bounds.maxZ);
    }
    for (const [x, z] of MEADOW_TREE_SPOTS) {
      expect(solids.some((o) => Math.hypot(o.x - x, o.z - z) < 2.4)).toBe(
        false,
      );
      expect(distanceToPasturePath(x, z)).toBeGreaterThan(2.4);
    }
    for (const rail of MEADOW_FENCES) {
      for (const n of [rail.x1, rail.x2, rail.z1, rail.z2]) {
        expect(Number.isFinite(n)).toBe(true);
      }
      expect(rail.x1).toBeGreaterThanOrEqual(bounds.minX);
      expect(rail.x2).toBeLessThanOrEqual(bounds.maxX);
      expect(rail.z1).toBeGreaterThanOrEqual(bounds.minZ);
      expect(rail.z2).toBeLessThanOrEqual(bounds.maxZ);
    }
  });

  it("treats paddock fences as axis-aligned solids", () => {
    const fences = obstacles.filter((o) => o.id?.startsWith("meadow-fence-"));
    expect(fences.length).toBe(MEADOW_FENCES.length);
    expect(fences.every((o) => o.shape === "aabb")).toBe(true);
    expect(MEADOW_FENCE_HALF_THICK).toBeGreaterThan(0.1);
    const west = fences.find((o) => Math.abs(o.x + 32) < 0.01);
    expect(west).toBeTruthy();
  });
});
