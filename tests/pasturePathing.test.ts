import { describe, expect, it } from "vitest";
import { PASTURE_ZONE } from "../src/world/config/zones";
import {
  clampToBounds,
  obstaclesForZone,
  stepToward,
} from "../src/pasture3d/pathing";

describe("pasture pathing", () => {
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

  it("slides around tall landmarks instead of walking through them", () => {
    const obstacles = obstaclesForZone(PASTURE_ZONE);
    expect(obstacles.length).toBeGreaterThan(0);
    const barn = PASTURE_ZONE.landmarks.find(
      (item) => item.id === "snack-barn",
    );
    if (!barn) throw new Error("missing barn landmark");
    const start = { x: barn.position.x - 6, z: barn.position.z };
    const goal = { x: barn.position.x + 6, z: barn.position.z };
    let pos = start;
    for (let i = 0; i < 80; i++) {
      pos = stepToward(pos, goal, 0.16, 6, PASTURE_ZONE, obstacles).pos;
    }
    const hit = obstacles.find(
      (o) => Math.hypot(pos.x - o.x, pos.z - o.z) < o.radius - 0.05,
    );
    expect(hit).toBeUndefined();
  });
});
