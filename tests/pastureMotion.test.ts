import { describe, expect, it } from "vitest";
import {
  approachSpeed,
  desiredWalkSpeed,
  lerpAngle,
  retarget,
  shortestAngleDelta,
} from "../src/pasture3d/motion";
import { meadowHeight, PASTURE_FLATTEN } from "../src/pasture3d/meadowHeight";
import { stepToward } from "../src/pasture3d/pathing";
import { PASTURE_ZONE } from "../src/world/config/zones";

describe("pasture motion", () => {
  it("lerps yaw the short way across the +/-pi wrap", () => {
    const from = 3.0;
    const to = -3.0;
    expect(Math.abs(shortestAngleDelta(from, to))).toBeLessThan(Math.PI);
    const mid = lerpAngle(from, to, 0.5);
    expect(Math.abs(mid)).toBeGreaterThan(2.5);
  });

  it("eases speed down near the destination and accelerates toward a cap", () => {
    expect(desiredWalkSpeed(0.04, 5)).toBe(0);
    expect(desiredWalkSpeed(0.4, 5)).toBeLessThan(desiredWalkSpeed(4, 5));
    expect(desiredWalkSpeed(8, 5)).toBe(5);
    expect(approachSpeed(0, 5, 0.1, 10, 14)).toBeCloseTo(1, 5);
    expect(approachSpeed(5, 0, 0.1, 10, 14)).toBeCloseTo(3.6, 5);
  });

  it("retargets mid-walk immediately and arrives at the new point", () => {
    let pos = { x: 0, z: 0 };
    let target = { x: 8, z: 0 };
    for (let i = 0; i < 4; i++) {
      pos = stepToward(pos, target, 0.16, 6, PASTURE_ZONE, []).pos;
    }
    expect(pos.x).toBeGreaterThan(1);
    expect(pos.x).toBeLessThan(5);
    target = retarget(target, { x: 0, z: 6 });
    let arrived = false;
    for (let i = 0; i < 80; i++) {
      const step = stepToward(pos, target, 0.16, 6, PASTURE_ZONE, []);
      pos = step.pos;
      arrived = step.arrived;
      if (arrived) break;
    }
    expect(arrived).toBe(true);
    expect(pos.x).toBeCloseTo(0, 1);
    expect(pos.z).toBeCloseTo(6, 1);
  });
});

describe("meadow height", () => {
  it("is level across the walkable paddock, including reserved spots", () => {
    expect(Math.abs(meadowHeight(0, 0))).toBeLessThan(0.05);
    expect(Math.abs(meadowHeight(-24, 18))).toBeLessThan(0.05);
    expect(Math.abs(meadowHeight(14, 14))).toBeLessThan(0.05);
    expect(Math.abs(meadowHeight(0, 20) - meadowHeight(0.7, 20))).toBeLessThan(
      0.08,
    );
    expect(Math.abs(meadowHeight(26, 26))).toBeLessThan(0.05);
    expect(PASTURE_FLATTEN.length).toBeGreaterThan(3);
  });
});
