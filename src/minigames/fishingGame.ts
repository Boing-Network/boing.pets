/** Timing-bar fishing: click when the needle is in the sweet zone. */

export interface FishingPublic {
  periodMs: number;
  /** Zone start as fraction 0-1 along the bar (visible). */
  zoneStart: number;
  zoneWidth: number;
}

export interface FishingSecret extends FishingPublic {
  /** Phase offset so server can recompute needle from elapsed ms. */
  phase: number;
}

export interface FishingInput {
  /** ms since attempt created_at (client clock aligned to server start). */
  clickElapsedMs: number;
}

export function needleAt(
  elapsedMs: number,
  periodMs: number,
  phase: number,
): number {
  const t = (elapsedMs / periodMs + phase) % 1;
  // Triangle wave 0→1→0
  const x = t < 0.5 ? t * 2 : (1 - t) * 2;
  return x;
}

export function validateFishingClick(
  secret: FishingSecret,
  input: FishingInput,
  playWindowMs: number,
  toleranceMs: number,
): boolean {
  if (input.clickElapsedMs < 200 || input.clickElapsedMs > playWindowMs)
    return false;
  const pos = needleAt(input.clickElapsedMs, secret.periodMs, secret.phase);
  const lo = secret.zoneStart - toleranceMs / secret.periodMs;
  const hi =
    secret.zoneStart + secret.zoneWidth + toleranceMs / secret.periodMs;
  return pos >= lo && pos <= hi;
}

export function makeFishingSecret(seed: string): FishingSecret {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  const periodMs = 1600 + (h % 900);
  const zoneWidth = 0.14 + ((h >>> 8) % 8) / 100;
  const zoneStart = 0.2 + ((h >>> 16) % 50) / 100;
  const phase = ((h >>> 4) % 1000) / 1000;
  return {
    periodMs,
    zoneStart: Math.min(zoneStart, 0.85 - zoneWidth),
    zoneWidth,
    phase,
  };
}
