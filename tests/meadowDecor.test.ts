import { describe, expect, it } from "vitest";
import { collectMeadowDecor } from "../src/pasture3d/meadowDecor";
import {
  DECOR_BASE_Y_TOLERANCE,
  POND_PATH_OUTSET,
  POND_PIER_LABEL_LOCAL,
  POND_WATER_LIFT,
  ellipseRimPoint,
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
    const pondLand = PASTURE_ZONE.landmarks.find(
      (item) => item.id === "lily-pond",
    )!;
    expect(pond.x).toBeCloseTo(pondLand.position.x, 5);
    expect(pond.z).toBeCloseTo(pondLand.position.z, 5);
    expect(pond.rx).toBeCloseTo(pondLand.width / 2, 5);
    expect(pond.rz).toBeCloseTo(pondLand.depth / 2, 5);
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

  it("ends dirt trails at the pond rim or pier, never in the water", () => {
    const pier = PASTURE_ZONE.landmarks.find((item) => item.id === "pond-pier");
    if (!pier) throw new Error("missing pier");
    let rimHits = 0;
    for (const path of PASTURE_ZONE.paths) {
      for (const point of path) {
        expect(inPondFootprint(point.x, point.z, 0)).toBe(false);
        const rim = ellipseRimPoint(pond, point.x, point.z, POND_PATH_OUTSET);
        const onRim = Math.hypot(point.x - rim.x, point.z - rim.z) < 0.05;
        const atPier =
          Math.hypot(point.x - pier.position.x, point.z - pier.position.z) <
          0.2;
        if (onRim || atPier) rimHits += 1;
      }
    }
    expect(rimHits).toBeGreaterThanOrEqual(3);
    // Shop-front path in front of The Drop should stay a worn trail.
    expect(pasturePathWear(12, -6)).toBeGreaterThan(0.5);
  });

  it("places pond-area labels off the water and the pier deck", () => {
    const pondLand = PASTURE_ZONE.landmarks.find(
      (item) => item.id === "lily-pond",
    );
    const pierLand = PASTURE_ZONE.landmarks.find(
      (item) => item.id === "pond-pier",
    );
    if (!pondLand || !pierLand) throw new Error("missing pond labels");
    const baseY = pondLand.height >= 1 ? pondLand.height + 1.8 : 1.15;
    const off = pondLand.labelOffset ?? { x: 0, y: 0, z: 0 };
    const lx = pondLand.position.x + off.x;
    const ly = baseY + off.y;
    const lz = pondLand.position.z + off.z;
    expect(ly).toBeGreaterThan(1.8);
    expect(inPondFootprint(lx, lz, 0.4)).toBe(false);
    expect(lx).toBeLessThan(pond.x - pond.rx);
    const pierLabelZ = pierLand.position.z + POND_PIER_LABEL_LOCAL.z;
    expect(POND_PIER_LABEL_LOCAL.y).toBeGreaterThan(2.6);
    expect(pierLabelZ).toBeGreaterThan(pierLand.position.z + 1);
    expect(
      inPondFootprint(
        pierLand.position.x + POND_PIER_LABEL_LOCAL.x,
        pierLabelZ,
        0,
      ),
    ).toBe(false);
  });
});
