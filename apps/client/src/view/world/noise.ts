/**
 * Deterministic noise for the presentation world. Nothing here feeds the
 * simulation: the same (seed, x, z) always yields the same landscape so a
 * reload redraws the same hills, rivers and trees.
 */

export function hash32(a: number, b = 0, c = 0): number {
  let h = (a | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = (h + Math.imul(b | 0, 0xc2b2ae35)) | 0;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  h = (h + Math.imul(c | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/** Uniform float in [0, 1) from integer keys. */
export function hash01(a: number, b = 0, c = 0): number {
  return hash32(a, b, c) / 4294967296;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Value noise in [0, 1]. */
export function valueNoise(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash01(seed, x0, z0);
  const b = hash01(seed, x0 + 1, z0);
  const c = hash01(seed, x0, z0 + 1);
  const d = hash01(seed, x0 + 1, z0 + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** Fractal value noise in roughly [-1, 1]. */
export function fbm(
  seed: number,
  x: number,
  z: number,
  octaves: number,
): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += (valueNoise(seed + i * 131, x * freq, z * freq) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Ridged fractal noise in [0, 1]; sharp crests for rocky ground. */
export function ridged(
  seed: number,
  x: number,
  z: number,
  octaves: number,
): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    const n = valueNoise(seed + i * 173, x * freq, z * freq) * 2 - 1;
    const r = 1 - Math.abs(n);
    sum += r * r * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}
