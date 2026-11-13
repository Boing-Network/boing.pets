import { describe, expect, it } from "vitest";
import { meadowHeight } from "../src/pasture3d/meadowHeight";
import {
  pastureGroundHeight,
  pastureHopOffset,
  PASTURE_PET_GROUND_LIFT,
  pasturePetY,
} from "../src/pasture3d/pastureGround";
import { PASTURE_ZONE } from "../src/world/config/zones";
import { cameraBehindYaw, cameraOffset } from "../src/pasture3d/camera";

describe("pasture ground height", () => {
  const { minX, maxX, minZ, maxZ } = PASTURE_ZONE.bounds;

  it("keeps the walkable paddock at ground level", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let x = minX; x <= maxX; x += 2) {
      for (let z = minZ; z <= maxZ; z += 2) {
        const y = pastureGroundHeight(x, z);
        expect(y).toBe(meadowHeight(x, z));
        if (y < min) min = y;
        if (y > max) max = y;
        expect(Math.abs(y)).toBeLessThan(0.05);
      }
    }
    expect(max - min).toBeLessThan(0.08);
  });

  it("places pets on or above the terrain on a sampling grid", () => {
    for (let x = minX + 1; x <= maxX - 1; x += 3) {
      for (let z = minZ + 1; z <= maxZ - 1; z += 3) {
        const terrain = meadowHeight(x, z);
        const petY = pasturePetY(x, z);
        expect(petY).toBeGreaterThanOrEqual(terrain);
        expect(petY - terrain).toBeCloseTo(PASTURE_PET_GROUND_LIFT, 8);
        const hopped = petY + pastureHopOffset(0.3, true);
        expect(hopped).toBeGreaterThanOrEqual(terrain);
      }
    }
  });

  it("only hops upward so feet never dip under the floor", () => {
    for (let t = 0; t < Math.PI * 4; t += 0.07) {
      expect(pastureHopOffset(t, false)).toBeGreaterThanOrEqual(0);
      expect(pastureHopOffset(t, true)).toBeGreaterThanOrEqual(0);
      expect(pastureHopOffset(t, true, true)).toBe(0);
    }
    expect(pastureHopOffset(Math.PI / 22, true)).toBeGreaterThan(0.05);
  });

  it("puts the follow camera behind a south-approaching pet", () => {
    // Walking north (+Z) toward a landmark from the south.
    const petYaw = 0;
    const look = { x: -30, y: 1.2, z: 2 };
    const camYaw = cameraBehindYaw(petYaw);
    const cam = cameraOffset(look, 16, camYaw);
    expect(cam.z).toBeLessThan(look.z);
    expect(look.z - cam.z).toBeGreaterThan(8);
  });

  it("keeps the default spawn camera looking south", () => {
    const look = { x: 0, y: 1.2, z: 6 };
    const cam = cameraOffset(look, 18, 0);
    expect(cam.z).toBeGreaterThan(look.z);
  });

  it("allows a gentle roll on the visual apron beyond the fence", () => {
    const { maxX } = PASTURE_ZONE.bounds;
    const ys = [0, 20, -20].map((z) => Math.abs(meadowHeight(maxX + 16, z)));
    expect(Math.max(...ys)).toBeGreaterThan(0.05);
  });
});
