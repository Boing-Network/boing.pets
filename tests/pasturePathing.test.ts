import { describe, expect, it } from "vitest";
import { PASTURE_ZONE, STARTER_TOWN } from "../src/world/config/zones";
import {
  blocked,
  clampPresencePosition,
  clampToBounds,
  isSolidLandmark,
  obstaclesForZone,
  resolveClickTarget,
  seedPose,
  stepToward,
} from "../src/pasture3d/pathing";

describe("pasture pathing", () => {
  const obstacles = obstaclesForZone(PASTURE_ZONE);
  const barn = PASTURE_ZONE.landmarks.find((item) => item.id === "snack-barn");
  if (!barn) throw new Error("missing barn landmark");

  it("clamps movement to zone bounds", () => {
    const clamped = clampToBounds({ x: 99, z: -99 }, PASTURE_ZONE);
    expect(clamped.x).toBe(PASTURE_ZONE.bounds.maxX);
    expect(clamped.z).toBe(PASTURE_ZONE.bounds.minZ);
  });

  it("steps toward a target and arrives", () => {
    let pos = { x: 0, z: 0 };
    let arrived = false;
    for (let i = 0; i < 40; i++) {
      const step = stepToward(pos, { x: 4, z: 0 }, 0.2, 6, PASTURE_ZONE, []);
      pos = step.pos;
      arrived = step.arrived;
      if (arrived) break;
    }
    expect(arrived).toBe(true);
    expect(pos.x).toBeCloseTo(4, 1);
  });

  it("treats the barn and pond as solids but lets pets walk through wildflowers", () => {
    expect(isSolidLandmark(barn)).toBe(true);
    const pond = PASTURE_ZONE.landmarks.find((item) => item.id === "lily-pond");
    const flowers = PASTURE_ZONE.landmarks.find(
      (item) => item.id === "wildflowers",
    );
    if (!pond || !flowers) throw new Error("missing pond or flowers");
    expect(isSolidLandmark(pond)).toBe(true);
    expect(isSolidLandmark(flowers)).toBe(false);
    expect(
      blocked({ x: pond.position.x, z: pond.position.z }, obstacles),
    ).toBeTruthy();
    expect(
      blocked({ x: flowers.position.x, z: flowers.position.z }, obstacles),
    ).toBeNull();
  });

  it("clamps a click inside the barn to a reachable point outside it", () => {
    const inside = { x: barn.position.x, z: barn.position.z };
    const target = resolveClickTarget(inside, PASTURE_ZONE, obstacles);
    expect(blocked(inside, obstacles)).toBeTruthy();
    expect(blocked(target, obstacles)).toBeNull();
    expect(
      Math.hypot(target.x - inside.x, target.z - inside.z),
    ).toBeGreaterThan(1);
  });

  it("routes around the barn instead of walking through it", () => {
    const start = { x: barn.position.x - 6, z: barn.position.z };
    const goal = { x: barn.position.x + 6, z: barn.position.z };
    let pos = start;
    let arrived = false;
    for (let i = 0; i < 160; i++) {
      const step = stepToward(pos, goal, 0.16, 6, PASTURE_ZONE, obstacles);
      pos = step.pos;
      arrived = step.arrived;
      expect(blocked(pos, obstacles)).toBeNull();
      if (arrived) break;
    }
    expect(arrived).toBe(true);
    expect(pos.x).toBeCloseTo(goal.x, 0);
  });

  it("never leaves a step inside landmark geometry, including corners", () => {
    const start = {
      x: barn.position.x - barn.width / 2 - 0.2,
      z: barn.position.z - barn.depth / 2 - 0.2,
    };
    let pos = start;
    for (let i = 0; i < 40; i++) {
      pos = stepToward(
        pos,
        { x: barn.position.x, z: barn.position.z },
        0.16,
        6,
        PASTURE_ZONE,
        obstacles,
      ).pos;
      expect(blocked(pos, obstacles)).toBeNull();
    }
  });

  it("seeds pets outside solids", () => {
    for (let i = 0; i < 12; i++) {
      const pose = seedPose("0xseed" + i, i, PASTURE_ZONE, obstacles);
      expect(blocked(pose, obstacles)).toBeNull();
    }
  });

  it("clamps presence positions the same way on the server", () => {
    const inside = clampPresencePosition(
      "pasture",
      barn.position.x,
      0,
      barn.position.z,
    );
    expect(blocked({ x: inside.x, z: inside.z }, obstacles)).toBeNull();
    const far = clampPresencePosition("pasture", 99, 0, -99);
    expect(far.x).toBe(PASTURE_ZONE.bounds.maxX);
    expect(far.z).toBe(PASTURE_ZONE.bounds.minZ);
    const town = clampPresencePosition(STARTER_TOWN.id, 200, 0, 200);
    expect(town.x).toBe(STARTER_TOWN.bounds.maxX);
  });
});
