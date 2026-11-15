/**
 * Camera-relative city locomotion.
 *
 * Movement is expressed in the camera frame, and the body turns to face that
 * direction. The camera yaw must stay put while a direction is held. If it
 * chased the body, the turn would rotate the camera, which would rotate the
 * input, and a held key would orbit instead of traveling straight.
 * Yaw eases behind the body only after the stick is released and speed has
 * bled off, when nothing is sampling it for movement.
 */

import type { WorldZoneConfig } from "../world/config/zones";
import { cameraBehindYaw } from "./camera";
import { STICK_DEADZONE, stickWorldDelta } from "./mobileControls";
import { approachVec, expApproachAngle } from "./motion";
import { stepToward, type Obstacle, type Vec2 } from "./pathing";
import { STREET_BODY_MOVE_SPEED } from "./streetBodyAnim";

/** Run cap. The gait switches to run at STREET_BODY_RUN_SPEED (3.2). */
export const CITY_MOVE_SPEED = 5.2;
/** m/s² toward the stick. Full run in about a quarter second. */
export const CITY_MOVE_ACCEL = 22;
/** m/s² when the stick is released. Stop in about a third of a second. */
export const CITY_MOVE_DECEL = 16;
/** Body turn, 1/seconds. Short-way, frame-rate independent. */
export const CITY_TURN_RATE = 8.5;
/** Idle-only camera align, slower than the body turn. */
export const CITY_CAM_ALIGN_RATE = 2.6;
/** Keep the camera locked until the coast is almost done. */
export const CITY_CAM_LOCK_SPEED = 0.08;
/** Largest integration step. Longer frames are split so collision stays stable. */
export const CITY_MAX_STEP_DT = 0.05;
/** A tab-switch hitch must not fast-forward the character across the block. */
export const CITY_MAX_FRAME_DT = 0.25;

export type LocoState = {
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  camYaw: number;
};

export type LocoStep = LocoState & {
  moving: boolean;
  speed: number;
  stickHeld: boolean;
};

export function normalizeStick(
  x: number,
  y: number,
  deadzone = STICK_DEADZONE,
): { x: number; y: number; mag: number } {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0, mag: 0 };
  const mag = Math.hypot(x, y);
  if (!(mag > 0) || mag < deadzone) return { x: 0, y: 0, mag: 0 };
  const clamped = Math.min(1, mag);
  return { x: (x / mag) * clamped, y: (y / mag) * clamped, mag: clamped };
}

/**
 * While `lock` is set, yaw is returned unchanged. Otherwise it eases (or, with
 * reduced motion, snaps) to sit behind the body.
 */
export function nextControlYaw(
  camYaw: number,
  petYaw: number,
  lock: boolean,
  dt: number,
  reducedMotion = false,
  alignRate = CITY_CAM_ALIGN_RATE,
): number {
  if (lock || !(dt > 0)) return camYaw;
  const behind = cameraBehindYaw(petYaw);
  if (reducedMotion) return behind;
  return expApproachAngle(camYaw, behind, alignRate, dt);
}

export function stepCityLocomotion(
  state: LocoState,
  stickX: number,
  stickY: number,
  dt: number,
  zone: WorldZoneConfig,
  obstacles: Obstacle[],
  opts?: {
    maxSpeed?: number;
    accel?: number;
    decel?: number;
    turnRate?: number;
    reducedMotion?: boolean;
  },
): LocoStep {
  const maxSpeed = opts?.maxSpeed ?? CITY_MOVE_SPEED;
  const accel = opts?.accel ?? CITY_MOVE_ACCEL;
  const decel = opts?.decel ?? CITY_MOVE_DECEL;
  const turnRate = opts?.turnRate ?? CITY_TURN_RATE;
  const reduced = !!opts?.reducedMotion;
  const stick = normalizeStick(stickX, stickY);
  const stickHeld = stick.mag > 0;
  // Sample movement from the yaw we already have. Aligning first would
  // couple this step's direction to the body's turn.
  const camYaw = state.camYaw;
  const wish = stickWorldDelta(stick.x, stick.y, camYaw);
  const desired = { x: wish.x * maxSpeed, z: wish.z * maxSpeed };
  const prev = { x: state.vx, z: state.vz };
  let vel = approachVec(prev, desired, dt, accel, decel);
  // Average the step so a speed ramp travels the same distance at 20fps and 144fps.
  const stepVx = (prev.x + vel.x) * 0.5;
  const stepVz = (prev.z + vel.z) * 0.5;
  let x = state.x;
  let z = state.z;
  let yaw = state.yaw;

  const faceToward = (target: number) => {
    yaw = reduced ? target : expApproachAngle(yaw, target, turnRate, dt);
  };

  if (dt > 0 && (stickHeld || Math.hypot(vel.x, vel.z) > 1e-4)) {
    const speedNow = Math.hypot(stepVx, stepVz);
    if (speedNow > 1e-4) {
      const dirX = stepVx / speedNow;
      const dirZ = stepVz / speedNow;
      const stepped = stepToward(
        { x, z },
        { x: x + dirX, z: z + dirZ },
        dt,
        speedNow,
        zone,
        obstacles,
      );
      const movedX = stepped.pos.x - x;
      const movedZ = stepped.pos.z - z;
      const moved = Math.hypot(movedX, movedZ);
      x = stepped.pos.x;
      z = stepped.pos.z;
      if (moved > 1e-4) {
        const mag = Math.hypot(vel.x, vel.z);
        vel = { x: (movedX / moved) * mag, z: (movedZ / moved) * mag };
      }
    }
    const face =
      stickHeld && stick.mag > 0
        ? Math.atan2(wish.x, wish.z)
        : Math.atan2(vel.x, vel.z);
    if (Number.isFinite(face)) faceToward(face);
  }

  const speed = Math.hypot(vel.x, vel.z);
  const lockCam = stickHeld || speed > CITY_CAM_LOCK_SPEED;
  return {
    x,
    z,
    yaw,
    vx: vel.x,
    vz: vel.z,
    camYaw: nextControlYaw(camYaw, yaw, lockCam, dt, reduced),
    moving: speed > STREET_BODY_MOVE_SPEED,
    speed,
    stickHeld,
  };
}

export function simulateCityLocomotion(
  state: LocoState,
  stickX: number,
  stickY: number,
  dt: number,
  zone: WorldZoneConfig,
  obstacles: Obstacle[],
  opts?: Parameters<typeof stepCityLocomotion>[6],
): LocoStep {
  const idle = (): LocoStep => ({
    ...state,
    moving: Math.hypot(state.vx, state.vz) > STREET_BODY_MOVE_SPEED,
    speed: Math.hypot(state.vx, state.vz),
    stickHeld: false,
  });
  if (!(dt > 0)) return idle();
  let remaining = Math.min(dt, CITY_MAX_FRAME_DT);
  let current: LocoStep = idle();
  while (remaining > 1e-6) {
    const stepDt = Math.min(CITY_MAX_STEP_DT, remaining);
    current = stepCityLocomotion(
      current,
      stickX,
      stickY,
      stepDt,
      zone,
      obstacles,
      opts,
    );
    remaining -= stepDt;
  }
  return current;
}

export function wishDirection(
  stickX: number,
  stickY: number,
  camYaw: number,
): Vec2 {
  const stick = normalizeStick(stickX, stickY, 0);
  return stickWorldDelta(stick.x, stick.y, camYaw);
}
