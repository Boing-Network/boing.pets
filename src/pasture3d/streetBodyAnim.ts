/** Procedural idle / walk / run poses for the StreetBody skeleton. */

export type StreetBodyGait = "idle" | "walk" | "run";

/** Player run cap is 5.2; yard wander is 1.35. */
export const STREET_BODY_RUN_SPEED = 3.2;
export const STREET_BODY_MOVE_SPEED = 0.2;

/** Rest-pose arm drop from T-pose, radians about Z (L +, R −). */
export const STREET_BODY_ARM_DROP = Math.PI / 2;

export function streetBodyGait(speed: number, moving: boolean): StreetBodyGait {
  if (!moving || speed < STREET_BODY_MOVE_SPEED) return "idle";
  if (speed >= STREET_BODY_RUN_SPEED) return "run";
  return "walk";
}

export type StreetBodyPose = {
  /** Additional Euler XYZ on top of the bind pose, in radians. */
  hips: readonly [number, number, number];
  spine: readonly [number, number, number];
  chest: readonly [number, number, number];
  neck: readonly [number, number, number];
  head: readonly [number, number, number];
  shoulderL: readonly [number, number, number];
  shoulderR: readonly [number, number, number];
  upperArmL: readonly [number, number, number];
  upperArmR: readonly [number, number, number];
  lowerArmL: readonly [number, number, number];
  lowerArmR: readonly [number, number, number];
  upperLegL: readonly [number, number, number];
  upperLegR: readonly [number, number, number];
  lowerLegL: readonly [number, number, number];
  lowerLegR: readonly [number, number, number];
  footL: readonly [number, number, number];
  footR: readonly [number, number, number];
};

/**
 * Model faces +Z at yaw 0. A negative X rotation on a downward leg swings
 * the foot toward +Z (forward); a positive X rotation swings it back.
 */
export function streetBodyPose(
  gait: StreetBodyGait,
  time: number,
  reducedMotion = false,
): StreetBodyPose {
  const zero = [0, 0, 0] as const;
  if (reducedMotion) {
    return {
      hips: zero,
      spine: zero,
      chest: zero,
      neck: zero,
      head: zero,
      shoulderL: [0, 0, STREET_BODY_ARM_DROP],
      shoulderR: [0, 0, -STREET_BODY_ARM_DROP],
      upperArmL: zero,
      upperArmR: zero,
      lowerArmL: zero,
      lowerArmR: zero,
      upperLegL: zero,
      upperLegR: zero,
      lowerLegL: zero,
      lowerLegR: zero,
      footL: zero,
      footR: zero,
    };
  }

  const idle = gait === "idle";
  const run = gait === "run";
  const omega = idle ? 2.2 : run ? 11 : 7.5;
  const phase = time * omega;
  const swing = Math.sin(phase);
  const breathe = Math.sin(time * 2.2);

  const ampLeg = idle ? 0.04 : run ? 0.88 : 0.62;
  const ampArm = idle ? 0.07 : run ? 0.7 : 0.48;
  const lean = idle ? 0 : run ? 0.16 : 0.09;
  const bob = idle
    ? breathe * 0.016
    : Math.abs(Math.cos(phase)) * (run ? 0.05 : 0.032);

  // Left leg forward at phase 0 (swing = 0… actually sin(0)=0). Use a
  // consistent opposite-phase pairing; tests read left vs right signs at t
  // where sin is clearly positive (time = pi/(2*omega)).
  const leftLegX = -swing * ampLeg;
  const rightLegX = swing * ampLeg;
  const leftKnee = Math.max(0, swing) * (idle ? 0.05 : run ? 0.85 : 0.58);
  const rightKnee = Math.max(0, -swing) * (idle ? 0.05 : run ? 0.85 : 0.58);

  return {
    hips: [lean * 0.4, 0, swing * (idle ? 0.01 : 0.03)],
    spine: [lean * 0.5 + breathe * 0.02, 0, 0],
    chest: [lean * 0.3 + breathe * 0.015 + bob, 0, 0],
    neck: [idle ? breathe * 0.01 : -lean * 0.2, 0, 0],
    head: [idle ? breathe * 0.012 : 0, 0, 0],
    shoulderL: [0, 0, STREET_BODY_ARM_DROP],
    shoulderR: [0, 0, -STREET_BODY_ARM_DROP],
    // Arms opposite the legs.
    upperArmL: [swing * ampArm, 0, 0],
    upperArmR: [-swing * ampArm, 0, 0],
    lowerArmL: [Math.max(0, -swing) * (idle ? 0.05 : 0.34), 0, 0],
    lowerArmR: [Math.max(0, swing) * (idle ? 0.05 : 0.34), 0, 0],
    upperLegL: [leftLegX, 0, 0],
    upperLegR: [rightLegX, 0, 0],
    lowerLegL: [leftKnee, 0, 0],
    lowerLegR: [rightKnee, 0, 0],
    footL: [-leftLegX * 0.25, 0, 0],
    footR: [-rightLegX * 0.25, 0, 0],
  };
}

/** True when the left foot is swinging toward +Z (forward). */
export function leftLegForward(pose: StreetBodyPose): boolean {
  return pose.upperLegL[0] < 0;
}

export function armsOpposeLegs(pose: StreetBodyPose): boolean {
  return (
    Math.sign(pose.upperArmL[0] || 0) !== Math.sign(pose.upperLegL[0] || 0)
  );
}
