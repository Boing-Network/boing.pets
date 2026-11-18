/**
 * Unsaved token placement. Positions are a pure presentation hash of
 * (worldSeed, creatureId) so reloads do not jitter tokens.
 *
 * slot = splitmix64(worldSeed XOR creatureId)
 * angle = (slot % 360) / 360 * tau
 * radius = ((slot >> 9) % 1000) / 1000 * territoryVisualRadius
 */

const MASK = (1n << 64n) - 1n;
const TAU = Math.PI * 2;

export function splitmix64(x: bigint): bigint {
  x = (x + 0x9e3779b97f4a7c15n) & MASK;
  let z = x;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return (z ^ (z >> 31n)) & MASK;
}

export type TokenOffset = {
  x: number;
  z: number;
  angle: number;
  radius: number;
  slot: bigint;
};

export function tokenOffset(
  worldSeed: number,
  creatureId: number,
  territoryVisualRadius: number,
): TokenOffset {
  const slot = splitmix64(BigInt(worldSeed) ^ BigInt(creatureId));
  const angle = (Number(slot % 360n) / 360) * TAU;
  const radius = (Number((slot >> 9n) % 1000n) / 1000) * territoryVisualRadius;
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    angle,
    radius,
    slot,
  };
}

/**
 * RELOCATE lerp: discarded on reload. Progress is
 * (viewTick - actionStartedTick) / (actionEndsTick - actionStartedTick).
 */
export function relocateProgress(
  viewTick: number,
  actionStartedTick: number | null,
  actionEndsTick: number | null,
): number {
  if (
    actionStartedTick == null ||
    actionEndsTick == null ||
    actionEndsTick <= actionStartedTick
  ) {
    return 1;
  }
  const t =
    (viewTick - actionStartedTick) / (actionEndsTick - actionStartedTick);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
