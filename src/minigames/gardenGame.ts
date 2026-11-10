/** Hold-to-water: release inside the fill window. */

export interface GardenPublic {
  /** Ideal hold duration ms. */
  targetHoldMs: number;
  windowMs: number;
}

export type GardenSecret = GardenPublic;

export interface GardenInput {
  holdMs: number;
}

export function makeGardenSecret(seed: string): GardenSecret {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 41 + seed.charCodeAt(i)) >>> 0;
  return {
    targetHoldMs: 900 + (h % 900),
    windowMs: 220,
  };
}

export function validateGardenHold(
  secret: GardenSecret,
  input: GardenInput,
  toleranceMs: number,
): boolean {
  return (
    Math.abs(input.holdMs - secret.targetHoldMs) <=
    secret.windowMs + toleranceMs
  );
}
