/**
 * Shared coat, glow and detail helpers for species anatomies. Everything here
 * is creature-local (ground at y = 0, facing +z) and deterministic, so the
 * same species always looks the same.
 *
 * Glow is carried per vertex (`glow.rgb`) and pulses slowly in the shared
 * shader, so these helpers only decide where and how strongly a patch glows.
 */
import {
  GRAIN,
  type CreatureBuilder,
  type Paint,
  type PatternFn,
  type PatternResult,
  type Vec3,
} from "./builder";
import type { QuadFrame } from "./plans";

export const add = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth 0–1 mottle from position, for coat patches. */
export function valueish(p: { x: number; y: number; z: number }): number {
  return (
    (Math.sin(p.x * 31 + p.z * 17) * Math.sin(p.y * 23 - p.z * 29) + 1) / 2
  );
}

/** A soft glow patch: `glow` within `r` of `at` (creature-local). */
export function glowSpot(
  at: Vec3,
  r: number,
  glow: string,
  strength: number,
  parts?: string[],
): PatternFn {
  return (p, _n, part) => {
    if (parts && !parts.includes(part)) return null;
    const d = Math.hypot(p.x - at[0], p.y - at[1], p.z - at[2]);
    if (d > r) return null;
    return { glow, glowStrength: strength * (1 - d / r) };
  };
}

/** Merge several pattern functions; later ones win per field. */
export function patterns(...fns: PatternFn[]): PatternFn {
  return (p, n, part) => {
    let out: PatternResult | null = null;
    for (const fn of fns) {
      const r = fn(p, n, part);
      if (r) out = { ...(out ?? {}), ...r };
    }
    return out;
  };
}

/** Run several `extras` builders in order. */
export function combine(
  ...fns: Array<(b: CreatureBuilder, at: QuadFrame) => void>
): (b: CreatureBuilder, at: QuadFrame) => void {
  return (b, at) => {
    for (const fn of fns) fn(b, at);
  };
}

/**
 * Glow that grows toward the end of a tail that runs back along -z
 * (foxes, wolves, cats). `zFrom` is where the glow starts, `span` how far
 * it takes to reach full strength.
 */
export function tailTipGlow(
  zFrom: number,
  glow: string,
  strength: number,
  span = 0.12,
): PatternFn {
  return (p, _n, part) => {
    if (part !== "tail" || p.z > zFrom) return null;
    const t = Math.min(1, (zFrom - p.z) / span);
    return { glow, glowStrength: strength * t };
  };
}

/**
 * Scattered glow cells (embers, dew, frost, pollen, spores) on `parts`.
 * `threshold` sets how sparse they are (higher = fewer), `facing` hides them
 * on surfaces that face below that normal-y (so dew sits on backs, not bellies).
 */
export function glowSpeckle(
  parts: readonly string[],
  glow: string,
  strength: number,
  freq = 1,
  threshold = 0.5,
  facing = -1,
): PatternFn {
  return (p, n, part) => {
    if (!parts.includes(part) || n.y < facing) return null;
    const cell =
      Math.sin(p.x * 95 * freq + 1.3) *
      Math.sin(p.z * 88 * freq) *
      Math.sin(p.y * 80 * freq + 0.7);
    if (cell < threshold) return null;
    const k = Math.min(1, (cell - threshold) / (1 - threshold) + 0.45);
    return { glow, glowStrength: strength * k };
  };
}

/** Swept-back cheek tufts: breaks up a smooth head (foxes, lynxes, cats). */
export function cheekRuff(size: number, paint: Paint = "coat") {
  return (b: CreatureBuilder, at: QuadFrame): void => {
    b.part("head", at.headPivot);
    const hr = at.spec.head.r;
    for (const side of [1, -1]) {
      const base = add(at.headPivot, [
        side * hr[0] * 0.7,
        at.cranium[1] - hr[1] * 0.25,
        at.cranium[2] + hr[2] * 0.05,
      ]);
      const tip = add(at.headPivot, [
        side * (hr[0] + size * 0.9),
        at.cranium[1] - hr[1] * 0.65,
        at.cranium[2] - hr[2] * 0.25 - size * 0.5,
      ]);
      b.cone(base, tip, size * 0.6, paint, 0.5, 8);
    }
  };
}

export type QuillSpec = {
  rows: number;
  /** Quills per row (across the back, mirrored). */
  across: number;
  len: number;
  r: number;
  color: string;
  glow: string;
  glowStrength: number;
};

/**
 * A field of backswept quills over a quadruped's back and flanks (porcupine).
 * Rows run from the shoulders to the rump; the arc covers the upper body.
 */
export function quillField(q: QuillSpec) {
  return (b: CreatureBuilder, at: QuadFrame): void => {
    b.part("body");
    const [, cy, cz] = at.chest;
    const [, ry0, rz0] = at.rump;
    const c = at.spec.chest;
    const r = at.spec.rump;
    for (let row = 0; row < q.rows; row += 1) {
      const t = q.rows === 1 ? 0.5 : row / (q.rows - 1);
      const z = lerp(cz + c[2] * 0.25, rz0 - r[2] * 0.45, t);
      const y = lerp(cy, ry0, t);
      const rx = lerp(c[0], r[0], t);
      const ry = lerp(c[1], r[1], t);
      for (let i = 0; i < q.across; i += 1) {
        const u = q.across === 1 ? 0 : i / (q.across - 1) - 0.5;
        // Stagger alternate rows so quills overlap like a real coat.
        const a = (u + (row % 2 === 0 ? 0 : 0.5 / q.across)) * 2.5;
        const nx = Math.sin(a);
        const ny = Math.cos(a);
        const base: Vec3 = [rx * nx * 0.92, y + ry * ny * 0.92, z];
        const tip: Vec3 = [
          base[0] + nx * q.len * 0.45,
          base[1] + ny * q.len * 0.55,
          base[2] - q.len * 0.8,
        ];
        b.cone(
          base,
          tip,
          q.r,
          {
            color: q.color,
            grain: GRAIN.fur,
            glow: q.glow,
            glowStrength: q.glowStrength,
          },
          0.5,
          5,
        );
      }
    }
  };
}
