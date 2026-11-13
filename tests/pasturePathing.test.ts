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

  it("keeps positions that sat outside the old 22-unit fence when they are in the new bounds", () => {
    const kept = clampPresencePosition("pasture", 30, 0, 0);
    expect(kept.x).toBeCloseTo(30, 5);
    expect(kept.z).toBeCloseTo(0, 5);
    expect(blocked({ x: kept.x, z: kept.z }, obstacles)).toBeNull();
    const edge = clampPresencePosition("pasture", 22, 0, 8);
    expect(edge.x).toBeCloseTo(22, 5);
    expect(edge.z).toBeCloseTo(8, 5);
  });

  it("spreads seeded poses across the enlarged pasture", () => {
    const poses = Array.from({ length: 40 }, (_, i) =>
      seedPose("0xseed" + i, i, PASTURE_ZONE, obstacles),
    );
    const xs = poses.map((p) => p.x);
    const zs = poses.map((p) => p.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(40);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(40);
    for (const pose of poses) {
      expect(pose.x).toBeGreaterThanOrEqual(PASTURE_ZONE.bounds.minX);
      expect(pose.x).toBeLessThanOrEqual(PASTURE_ZONE.bounds.maxX);
      expect(pose.z).toBeGreaterThanOrEqual(PASTURE_ZONE.bounds.minZ);
      expect(pose.z).toBeLessThanOrEqual(PASTURE_ZONE.bounds.maxZ);
      expect(blocked(pose, obstacles)).toBeNull();
    }
  });

  it("keeps a click on the paddock fence outside the rail", () => {
    const hit = resolveClickTarget({ x: -32, z: 18 }, PASTURE_ZONE, obstacles);
    expect(Math.abs(hit.x + 32)).toBeGreaterThan(0.3);
  });

  it("walks from Pond Pier to Treasure Dig around the lily pond", () => {
    const starts = [
      { x: 29, z: -13 },
      { x: 27, z: -12.5 },
      { x: 30, z: -16 },
      { x: 26.45, z: -14.33 },
    ];
    const goal = { x: 8, z: -28 };
    for (const start of starts) {
      let pos = resolveClickTarget(start, PASTURE_ZONE, obstacles);
      let arrived = false;
      let stuck = 0;
      for (let i = 0; i < 500; i++) {
        const before = pos;
        const step = stepToward(pos, goal, 0.16, 6, PASTURE_ZONE, obstacles);
        pos = step.pos;
        arrived = step.arrived;
        expect(blocked(pos, obstacles)).toBeNull();
        const moved = Math.hypot(pos.x - before.x, pos.z - before.z);
        stuck = moved < 1e-4 ? stuck + 1 : 0;
        expect(stuck).toBeLessThan(8);
        if (arrived) break;
      }
      expect(arrived).toBe(true);
      const walkable = resolveClickTarget(goal, PASTURE_ZONE, obstacles);
      expect(Math.hypot(pos.x - walkable.x, pos.z - walkable.z)).toBeLessThan(
        0.5,
      );
    }
  });
});

function walkToGoal(
  start: { x: number; z: number },
  goal: { x: number; z: number },
  obstacles: ReturnType<typeof obstaclesForZone>,
) {
  let pos = resolveClickTarget(start, PASTURE_ZONE, obstacles);
  const dest = resolveClickTarget(goal, PASTURE_ZONE, obstacles);
  let arrived = false;
  let stuck = 0;
  for (let i = 0; i < 900; i++) {
    const before = pos;
    const step = stepToward(pos, dest, 0.16, 6, PASTURE_ZONE, obstacles);
    pos = step.pos;
    expect(blocked(pos, obstacles)).toBeNull();
    const moved = Math.hypot(pos.x - before.x, pos.z - before.z);
    stuck = moved < 1e-4 ? stuck + 1 : 0;
    expect(stuck).toBeLessThan(8);
    arrived = step.arrived;
    if (arrived) break;
  }
  expect(arrived).toBe(true);
  expect(Math.hypot(pos.x - dest.x, pos.z - dest.z)).toBeLessThan(0.6);
  return pos;
}

describe("pasture route audit", () => {
  const obstacles = obstaclesForZone(PASTURE_ZONE);
  const pois = [
    { id: "spawn", ...PASTURE_ZONE.spawn },
    { id: "old-oak", x: -18, z: -20 },
    ...PASTURE_ZONE.stations
      .filter((station) => station.kind !== "info")
      .map((station) => ({
        id: station.id,
        x: station.position.x,
        z: station.position.z,
      })),
  ];

  it("snaps a walk into the Old Oak onto a reachable rim", () => {
    const rim = resolveClickTarget({ x: -18, z: -20 }, PASTURE_ZONE, obstacles);
    expect(blocked(rim, obstacles)).toBeNull();
    expect(Math.hypot(rim.x + 18, rim.z + 20)).toBeGreaterThan(1);
  });

  it("walks from spawn and Treasure Dig to the Old Oak without stalling mid-south", () => {
    for (const start of [
      { x: 0, z: 6 },
      { x: 8, z: -28 },
    ]) {
      const pos = walkToGoal(start, { x: -18, z: -20 }, obstacles);
      // The previous greedy detour could pin a walker around (2.35, -21.99).
      expect(Math.hypot(pos.x - 2.35, pos.z + 21.99)).toBeGreaterThan(8);
      expect(Math.hypot(pos.x + 18, pos.z + 20)).toBeLessThan(2.5);
    }
  });

  it("walks between every station, area, spawn, and the Old Oak", () => {
    for (const a of pois) {
      for (const b of pois) {
        if (a.id === b.id) continue;
        walkToGoal(a, b, obstacles);
      }
    }
    expect(pois.length).toBeGreaterThanOrEqual(11);
  });
});
