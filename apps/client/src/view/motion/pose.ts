/**
 * Presentation pose for a creature at a glance. Meshes read these fields;
 * nothing here is saved or fed back to the sim.
 */
export type CreaturePose = {
  /** Head pitch: negative = nose down. */
  headPitch: number;
  /** Whole-body pitch. */
  bodyPitch: number;
  /** Vertical bob / hover offset in world units before skin scale. */
  bob: number;
  /** Wing flap or stride phase 0…1. */
  gait: number;
  /** How strongly the gait plays (0 idle … 1 full). */
  gaitWeight: number;
  /** Crouch amount for rest/drink. */
  crouch: number;
};

export const NEUTRAL_POSE: CreaturePose = {
  headPitch: 0,
  bodyPitch: 0,
  bob: 0,
  gait: 0,
  gaitWeight: 0,
  crouch: 0,
};

export function mixPose(
  a: CreaturePose,
  b: CreaturePose,
  t: number,
): CreaturePose {
  const u = Math.min(1, Math.max(0, t));
  return {
    headPitch: a.headPitch + (b.headPitch - a.headPitch) * u,
    bodyPitch: a.bodyPitch + (b.bodyPitch - a.bodyPitch) * u,
    bob: a.bob + (b.bob - a.bob) * u,
    gait: b.gait,
    gaitWeight: a.gaitWeight + (b.gaitWeight - a.gaitWeight) * u,
    crouch: a.crouch + (b.crouch - a.crouch) * u,
  };
}
