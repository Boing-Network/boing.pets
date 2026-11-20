/**
 * Pure RNG. The result is a function of `(seed, tick, domain, subjectId, salt)`.
 * Nothing in the snapshot stores a cursor.
 */

const MASK = (1n << 64n) - 1n;

export const RNG_DOMAINS = [
  "worldgen",
  "name",
  "genetics",
  "personality",
  "forage",
  "contest",
  "move",
] as const;

export type RngDomain = (typeof RNG_DOMAINS)[number];

export function splitmix64(x: bigint): bigint {
  x = (x + 0x9e3779b97f4a7c15n) & MASK;
  let z = x;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return (z ^ (z >> 31n)) & MASK;
}

export function fnv1a64(s: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (const ch of s) {
    h ^= BigInt(ch.charCodeAt(0));
    h = (h * 0x100000001b3n) & MASK;
  }
  return h;
}

export function rngInt(
  seed: number,
  tick: number,
  domain: RngDomain,
  subjectId: number,
  salt: number,
  min: number,
  max: number,
): number {
  if (max < min) throw new Error("rngInt");
  let x = BigInt(seed);
  x = splitmix64(x ^ BigInt(tick));
  x = splitmix64(x ^ fnv1a64(domain));
  x = splitmix64(x ^ BigInt(subjectId));
  x = splitmix64(x ^ BigInt(salt));
  const span = BigInt(max - min + 1);
  return min + Number(x % span);
}
