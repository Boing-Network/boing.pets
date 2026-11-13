import { describe, expect, it } from "vitest";
import { collectMeadowDecor } from "../src/pasture3d/meadowDecor";
import {
  DECOR_BASE_Y_TOLERANCE,
  POND_WATER_LIFT,
  inFenceFootprint,
  inPadFootprint,
  inPathFootprint,
  inPondFootprint,
  isDecorClear,
  lilyPondEllipse,
} from "../src/pasture3d/meadowFootprints";
import { meadowHeight } from "../src/pasture3d/meadowHeight";
import {
  buildPasturePathMeshData,
  pasturePathWear,
} from "../src/pasture3d/pasturePath";
import { PASTURE_ZONE } from "../src/world/config/zones";

const GROUND_KINDS = new Set(["grass", "tall-grass", "flower", "rock"]);

describe("meadow decor sits on the ground and stays off footprints", () => {
  const pond = lilyPondEllipse();
  if (!pond) throw new Error("missing lily pond");

  it("describes an elliptical pond seated just above the floor", () => {
    expect(pond.rx).toBeCloseTo(3.5, 5);
    expect(pond.rz).toBeCloseTo(2.75, 5);
    expect(POND_WATER_LIFT).toBeGreaterThan(0);
    expect(POND_WATER_LIFT).toBeLessThanOrEqual(0.03);
    expect(inPondFootprint(pond.x, pond.z)).toBe(true);
    expect(inPondFootprint(pond.x + pond.rx + 2, pond.z)).toBe(false);
    expect(isDecorClear(pond.x, pond.z)).toBe(false);
    expect(pasturePathWear(pond.x, pond.z)).toBe(0);
    expect(pasturePathWear(pond.x + pond.rx * 0.4, pond.z)).toBe(0);
    const mesh = buildPasturePathMeshData(96, 40);
    let inside = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      if (inPondFootprint(mesh.positions[i]!, mesh.positions[i + 2]!, 0.05)) {
        inside += 1;
      }
    }
    expect(inside).toBe(0);
  });

  it("samples every instance against the ground and water/path/pad footprints", () => {
    const rows = collectMeadowDecor(false);
    expect(rows.length).toBeGreaterThan(1000);
    const kinds = new Set(rows.map((row) => row.kind));
    expect(kinds.has("grass")).toBe(true);
    expect(kinds.has("tall-grass")).toBe(true);

    let pondHits = 0;
    let pathHits = 0;
    let padHits = 0;
    let fenceHits = 0;
    let yOff = 0;
    for (const row of rows) {
      const ground = meadowHeight(row.x, row.z);
      const dy = Math.abs(row.y - ground);
      if (dy > DECOR_BASE_Y_TOLERANCE) yOff += 1;
      const planted = GROUND_KINDS.has(row.kind);
      if (inPondFootprint(row.x, row.z)) pondHits += 1;
      if (planted && inPathFootprint(row.x, row.z)) pathHits += 1;
      if (planted && inPadFootprint(row.x, row.z)) padHits += 1;
      if (planted && inFenceFootprint(row.x, row.z)) fenceHits += 1;
    }
    expect(yOff).toBe(0);
    expect(pondHits).toBe(0);
    expect(pathHits).toBe(0);
    expect(padHits).toBe(0);
    expect(fenceHits).toBe(0);
  });

  it("keeps the apron roll outside the paddock fence", () => {
    const { minX, maxX, minZ, maxZ } = PASTURE_ZONE.bounds;
    for (const [x, z] of [
      [minX + 0.5, 0],
      [maxX - 0.5, 0],
      [0, minZ + 0.5],
      [0, maxZ - 0.5],
      [minX + 1, minZ + 1],
      [maxX - 1, maxZ - 1],
    ] as const) {
      expect(Math.abs(meadowHeight(x, z))).toBeLessThan(0.02);
    }
    expect(Math.abs(meadowHeight(maxX + 16, 0))).toBeGreaterThan(0.05);
  });
});
