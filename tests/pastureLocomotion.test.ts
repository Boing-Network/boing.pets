import { describe, expect, it } from "vitest";
import { cameraBehindYaw } from "../src/pasture3d/camera";
import { keyboardStick } from "../src/pasture3d/keyboardShortcuts";
import {
  CITY_MOVE_ACCEL,
  CITY_MOVE_DECEL,
  CITY_MOVE_SPEED,
  nextControlYaw,
  normalizeStick,
  simulateCityLocomotion,
  wishDirection,
  type LocoState,
  type LocoStep,
} from "../src/pasture3d/locomotion";
import { stickWorldDelta } from "../src/pasture3d/mobileControls";
import { lerpAngle, shortestAngleDelta } from "../src/pasture3d/motion";
import { obstaclesForZone, type Obstacle } from "../src/pasture3d/pathing";
import { PASTURE_SPAWN_YAW } from "../src/pasture3d/yardFacing";
import { PASTURE_ZONE, type WorldZoneConfig } from "../src/world/config/zones";
import { releaseHeldInput } from "../src/world/hooks/usePlayerControls";

const OPEN: WorldZoneConfig = {
  ...PASTURE_ZONE,
  bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
  landmarks: [],
  stations: [],
};
const CLEAR: Obstacle[] = [];

function hold(
  stick: { x: number; y: number },
  seconds: number,
  origin: LocoState,
  dt = 1 / 60,
  zone: WorldZoneConfig = OPEN,
  obstacles: Obstacle[] = CLEAR,
) {
  let state: LocoStep = {
    ...origin,
    moving: false,
    speed: 0,
    stickHeld: false,
  };
  const samples: LocoStep[] = [];
  let elapsed = 0;
  while (elapsed < seconds - 1e-9) {
    const stepDt = Math.min(dt, seconds - elapsed);
    state = simulateCityLocomotion(
      state,
      stick.x,
      stick.y,
      stepDt,
      zone,
      obstacles,
    );
    samples.push(state);
    elapsed += stepDt;
  }
  return { state, samples };
}

function crossTrack(samples: LocoState[], dir: { x: number; z: number }) {
  const origin = samples[0];
  if (!origin) return 0;
  let max = 0;
  const len = Math.hypot(dir.x, dir.z) || 1;
  const dx = dir.x / len;
  const dz = dir.z / len;
  for (const sample of samples) {
    const ox = sample.x - origin.x;
    const oz = sample.z - origin.z;
    const along = ox * dx + oz * dz;
    const cx = ox - dx * along;
    const cz = oz - dz * along;
    max = Math.max(max, Math.hypot(cx, cz));
  }
  return max;
}

describe("city locomotion", () => {
  const spawn: LocoState = {
    x: 0,
    z: 8,
    yaw: PASTURE_SPAWN_YAW,
    vx: 0,
    vz: 0,
    camYaw: 0,
  };

  it("normalizes diagonals and ignores a deadzone", () => {
    const diagonal = normalizeStick(1, 1);
    expect(diagonal.mag).toBeCloseTo(1, 5);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 5);
    const keys = keyboardStick({
      forward: true,
      back: false,
      left: true,
      right: false,
    });
    expect(Math.hypot(keys.x, keys.y)).toBeCloseTo(1, 5);
    expect(normalizeStick(0.05, 0).mag).toBe(0);
    expect(normalizeStick(Number.NaN, 1).mag).toBe(0);
  });

  it("accelerates up to the run cap and coasts to a stop in a straight line", () => {
    const running = hold({ x: 0, y: 1 }, 0.12, spawn);
    const speed = running.state.speed;
    expect(speed).toBeGreaterThan(1.5);
    expect(speed).toBeLessThan(CITY_MOVE_SPEED);
    expect(speed).toBeCloseTo(
      Math.min(CITY_MOVE_SPEED, CITY_MOVE_ACCEL * 0.12),
      1,
    );

    const full = hold({ x: 0, y: 1 }, 1, spawn);
    expect(full.state.speed).toBeCloseTo(CITY_MOVE_SPEED, 1);
    expect(full.state.z).toBeLessThan(spawn.z - 3);

    const coast = hold({ x: 0, y: 0 }, 0.2, full.state);
    expect(coast.state.speed).toBeLessThan(full.state.speed);
    expect(coast.state.speed).toBeCloseTo(
      Math.max(0, CITY_MOVE_SPEED - CITY_MOVE_DECEL * 0.2),
      1,
    );
    expect(coast.state.z).toBeLessThan(full.state.z);
    expect(Math.abs(coast.state.x - full.state.x)).toBeLessThan(0.05);
    expect(
      coast.samples.every((sample) => sample.camYaw === full.state.camYaw),
    ).toBe(true);

    const stopped = hold({ x: 0, y: 0 }, 1, full.state);
    expect(stopped.state.speed).toBe(0);
    expect(stopped.state.z).toBeLessThan(full.state.z - 0.4);
  });

  it("keeps every held direction straight even when facing starts off-camera", () => {
    const misaligned: LocoState = { ...spawn, yaw: 0, camYaw: 0 };
    const sticks = [
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 1, y: 1 },
    ];
    for (const stick of sticks) {
      const run = hold(stick, 3, misaligned);
      const wish = wishDirection(stick.x, stick.y, misaligned.camYaw);
      expect(crossTrack(run.samples, wish)).toBeLessThan(0.08);
      expect(run.samples.every((sample) => sample.camYaw === 0)).toBe(true);
      const moved = Math.hypot(run.state.x - spawn.x, run.state.z - spawn.z);
      expect(moved).toBeGreaterThan(10);
      expect(run.state.speed).toBeLessThanOrEqual(CITY_MOVE_SPEED + 1e-6);
    }
  });

  it("matches a long hold at 20fps and 144fps", () => {
    const slow = hold({ x: 0, y: 1 }, 2, spawn, 1 / 20);
    const fast = hold({ x: 0, y: 1 }, 2, spawn, 1 / 144);
    expect(slow.state.x).toBeCloseTo(fast.state.x, 1);
    expect(slow.state.z).toBeCloseTo(fast.state.z, 1);
    expect(
      Math.abs(shortestAngleDelta(slow.state.yaw, fast.state.yaw)),
    ).toBeLessThan(0.05);
  });

  it("does not fast-forward through a hitch longer than a quarter second", () => {
    const hitch = simulateCityLocomotion(spawn, 0, 1, 2, OPEN, CLEAR);
    const quarter = simulateCityLocomotion(spawn, 0, 1, 0.25, OPEN, CLEAR);
    expect(hitch.z).toBeCloseTo(quarter.z, 4);
    expect(spawn.z - hitch.z).toBeLessThan(CITY_MOVE_SPEED * 0.25);
  });

  it("eases the camera behind the body only after the stick is released", () => {
    const strafing = hold({ x: 1, y: 0 }, 1.2, spawn);
    expect(strafing.samples.every((sample) => sample.camYaw === 0)).toBe(true);
    const behind = cameraBehindYaw(strafing.state.yaw);
    expect(Math.abs(shortestAngleDelta(0, behind))).toBeGreaterThan(1);
    const settled = hold({ x: 0, y: 0 }, 1.4, strafing.state);
    expect(
      Math.abs(
        shortestAngleDelta(
          settled.state.camYaw,
          cameraBehindYaw(settled.state.yaw),
        ),
      ),
    ).toBeLessThan(0.2);
    expect(nextControlYaw(0.4, 1, true, 1)).toBe(0.4);
  });

  it("keeps a manual look yaw while the pointer is locked", () => {
    const aimed = simulateCityLocomotion(
      { ...spawn, camYaw: 0.8, yaw: PASTURE_SPAWN_YAW, vx: 0, vz: 0 },
      0,
      0,
      0.5,
      OPEN,
      CLEAR,
      { lockCamera: true },
    );
    expect(aimed.camYaw).toBe(0.8);
    const released = simulateCityLocomotion(aimed, 0, 0, 1.2, OPEN, CLEAR);
    expect(Math.abs(released.camYaw - 0.8)).toBeGreaterThan(0.2);
  });

  it("stays on the Yard avenue while holding W or D", () => {
    const obstacles = obstaclesForZone(PASTURE_ZONE);
    const south = hold(
      { x: 0, y: 1 },
      3,
      spawn,
      1 / 60,
      PASTURE_ZONE,
      obstacles,
    );
    expect(Math.abs(south.state.x)).toBeLessThan(0.6);
    expect(south.state.z).toBeLessThan(0);
    expect(
      south.samples.every((sample) => Math.abs(sample.camYaw) < 1e-6),
    ).toBe(true);

    const east = hold(
      { x: 1, y: 0 },
      2.5,
      { ...spawn, x: 0, z: 0, yaw: PASTURE_SPAWN_YAW, camYaw: 0, vx: 0, vz: 0 },
      1 / 60,
      PASTURE_ZONE,
      obstacles,
    );
    expect(east.state.x).toBeGreaterThan(8);
    expect(Math.abs(east.state.z)).toBeLessThan(0.8);
    expect(east.samples.every((sample) => sample.camYaw === 0)).toBe(true);
  });

  it("shows why chasing the body yaw makes a strafe orbit", () => {
    let x = 0;
    let z = 8;
    let yaw = PASTURE_SPAWN_YAW;
    let camYaw = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 4 * 60; i++) {
      camYaw = lerpAngle(camYaw, yaw + Math.PI, 1 - Math.pow(0.12, dt));
      const dir = stickWorldDelta(1, 0, camYaw);
      const moveYaw = Math.atan2(dir.x, dir.z);
      yaw = lerpAngle(yaw, moveYaw, 1 - Math.pow(0.0008, dt));
      x += dir.x * CITY_MOVE_SPEED * dt;
      z += dir.z * CITY_MOVE_SPEED * dt;
    }
    const net = Math.hypot(x, z - 8);
    const traveled = 4 * CITY_MOVE_SPEED;
    expect(net).toBeLessThan(traveled * 0.45);
  });

  it("releases keyboard and stick together", () => {
    const state = {
      forward: true,
      back: false,
      left: true,
      right: false,
      interact: true,
      stickX: 0.8,
      stickY: -0.4,
    };
    releaseHeldInput(state);
    expect(state).toEqual({
      forward: false,
      back: false,
      left: false,
      right: false,
      interact: false,
      stickX: 0,
      stickY: 0,
    });
  });
});
