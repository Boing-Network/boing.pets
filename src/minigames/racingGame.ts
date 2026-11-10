/** Rhythm tap: hit N beats within windows. */

export interface RacingPublic {
  /** Beat offsets from start (ms) — shown as flashes. */
  beatsMs: number[];
  windowMs: number;
}

export type RacingSecret = RacingPublic;

export interface RacingInput {
  tapElapsedMs: number[];
}

export function makeRacingSecret(seed: string): RacingSecret {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const count = 3;
  const beatsMs: number[] = [];
  let t = 800 + (h % 400);
  for (let i = 0; i < count; i++) {
    beatsMs.push(t);
    t += 700 + ((h >> (i * 3)) % 500);
  }
  return { beatsMs, windowMs: 180 };
}

export function validateRacingTaps(
  secret: RacingSecret,
  input: RacingInput,
  toleranceMs: number,
): boolean {
  if (input.tapElapsedMs.length !== secret.beatsMs.length) return false;
  for (let i = 0; i < secret.beatsMs.length; i++) {
    const delta = Math.abs(input.tapElapsedMs[i]! - secret.beatsMs[i]!);
    if (delta > secret.windowMs + toleranceMs) return false;
  }
  return true;
}
