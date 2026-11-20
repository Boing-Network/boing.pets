/**
 * The 21 species as anatomy parameter sets. Muted night coats (they live
 * under moonlight), natural proportions, and one restrained glow each, the
 * world's bioluminescent thread, instead of toy neon.
 */
import type { SpeciesSlug } from "@boing-pets/contract";
import {
  GRAIN,
  type PatternFn,
  type PatternResult,
  type Vec3,
  type CreatureBuilder,
} from "./builder";
import {
  bat,
  bird,
  moth,
  newt,
  quadruped,
  tortoise,
  type Anatomy,
  type QuadFrame,
} from "./plans";

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** A soft glow patch: `glow` within `r` of `at` (creature-local). */
function glowSpot(
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

function patterns(...fns: PatternFn[]): PatternFn {
  return (p, n, part) => {
    let out: PatternResult | null = null;
    for (const fn of fns) {
      const r = fn(p, n, part);
      if (r) out = { ...(out ?? {}), ...r };
    }
    return out;
  };
}

/** Branching antlers from the crown, mossy tips with a faint glow. */
function antlers(size: number, color: string, glow: string | null) {
  return (b: CreatureBuilder, at: QuadFrame) => {
    b.part("head", at.headPivot);
    const hr = at.spec.head.r;
    for (const side of [1, -1]) {
      const base = add(at.headPivot, [
        side * hr[0] * 0.45,
        at.cranium[1] + hr[1] * 0.8,
        at.cranium[2] - hr[2] * 0.1,
      ]);
      const beam1 = add(base, [side * size * 0.35, size * 0.55, -size * 0.15]);
      const beam2 = add(beam1, [side * size * 0.2, size * 0.5, -size * 0.2]);
      const beam3 = add(beam2, [side * size * 0.05, size * 0.35, size * 0.05]);
      const paint = { color, grain: GRAIN.scale };
      b.tube(base, beam1, size * 0.05, size * 0.04, paint, 7);
      b.tube(beam1, beam2, size * 0.04, size * 0.03, paint, 7);
      b.tube(beam2, beam3, size * 0.03, size * 0.018, paint, 7);
      const tines: [Vec3, Vec3][] = [
        [beam1, add(beam1, [side * size * 0.05, size * 0.3, size * 0.22])],
        [beam2, add(beam2, [side * size * 0.02, size * 0.28, size * 0.2])],
        [beam2, add(beam2, [side * size * 0.25, size * 0.2, -size * 0.1])],
      ];
      for (const [from, to] of tines) {
        b.tube(from, to, size * 0.028, size * 0.014, paint, 6);
        if (glow) {
          b.ellipsoid(
            to,
            [size * 0.03, size * 0.03, size * 0.03],
            { color: "#53624a", grain: GRAIN.fur, glow, glowStrength: 0.35 },
            [0, 0, 0],
            8,
          );
        }
      }
    }
  };
}

/** Ram horns: a thick ridged spiral back and around the ear. */
function curlHorns(size: number, color: string, glint: string) {
  return (b: CreatureBuilder, at: QuadFrame) => {
    b.part("head", at.headPivot);
    const hr = at.spec.head.r;
    for (const side of [1, -1]) {
      let prev = add(at.headPivot, [
        side * hr[0] * 0.5,
        at.cranium[1] + hr[1] * 0.75,
        at.cranium[2] - hr[2] * 0.05,
      ]);
      const steps = 9;
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const a = t * Math.PI * 1.6;
        const rad = size * (0.55 - t * 0.2);
        const next = add(at.headPivot, [
          side * (hr[0] * 0.65 + t * size * 0.35),
          at.cranium[1] + hr[1] * 0.4 + Math.cos(a) * rad,
          at.cranium[2] - hr[2] * 0.25 - Math.sin(a) * rad * 0.9,
        ]);
        const r0 = size * 0.16 * (1 - (t - 1 / steps) * 0.7);
        const r1 = size * 0.16 * (1 - t * 0.7);
        b.tube(
          prev,
          next,
          r0,
          r1,
          {
            color,
            grain: GRAIN.scale,
            glow: i === 4 ? glint : undefined,
            glowStrength: 0.2,
          },
          10,
        );
        prev = next;
      }
    }
  };
}

const QUAD_SPECIES = {
  "fire-fox": quadruped({
    coat: { back: "#93512d", belly: "#d6c9b3", dark: "#231b17" },
    gait: "trot",
    legH: 0.15,
    bodyLen: 0.2,
    chest: [0.068, 0.075, 0.1],
    rump: [0.064, 0.068, 0.09],
    legR: 0.016,
    foot: "paw",
    socks: 0.55,
    neck: { len: 0.09, pitch: 0.75, r: 0.045 },
    head: {
      r: [0.052, 0.048, 0.06],
      snoutLen: 0.075,
      snoutR: 0.024,
      eyeshine: "#c9a050",
    },
    ears: { kind: "pointed", len: 0.075, w: 0.028, tilt: 0.3 },
    tail: { kind: "bushy", len: 0.3, r: 0.042, lift: -0.25, tip: "#e2d8c6" },
    pattern: patterns(
      (p, n, part) =>
        part === "head" && n.z > 0.2 && p.y < 0.36
          ? { color: "#e2d6c2", mix: 0.7 }
          : null,
      glowSpot([0, 0.2, 0.2], 0.05, "#e08a3c", 0.32, ["body"]),
    ),
  }),
  "moss-stag": quadruped({
    coat: { back: "#56553f", belly: "#b8ae98", dark: "#29231d" },
    gait: "walk",
    legH: 0.3,
    bodyLen: 0.26,
    chest: [0.085, 0.1, 0.12],
    rump: [0.08, 0.095, 0.11],
    rumpLift: 0.01,
    legR: 0.016,
    foot: "hoof",
    socks: 0.2,
    neck: { len: 0.17, pitch: 1.0, r: 0.045 },
    head: {
      r: [0.045, 0.05, 0.07],
      snoutLen: 0.08,
      snoutR: 0.03,
      snoutDrop: 0.025,
      eyeshine: "#7fc0c0",
    },
    ears: { kind: "long", len: 0.075, w: 0.028, tilt: 1.15 },
    tail: { kind: "short", len: 0.06, r: 0.028, lift: 0.4, tip: "#d8d0c0" },
    extras: antlers(0.24, "#6a5a44", "#6bc8d8"),
    pattern: (p, n, part) =>
      part === "body" && n.y > 0.55 && valueish(p) > 0.62
        ? { color: "#4e6a46", mix: 0.55 }
        : null,
  }),
  "moon-hare": quadruped({
    coat: { back: "#8b857b", belly: "#dcd6cb", dark: "#2b2722" },
    gait: "hop",
    legH: 0.06,
    bodyLen: 0.12,
    chest: [0.055, 0.065, 0.075],
    rump: [0.068, 0.078, 0.085],
    rumpLift: 0.02,
    legR: 0.012,
    foot: "paw",
    hindFold: 1,
    neck: { len: 0.05, pitch: 1.0, r: 0.035 },
    head: {
      r: [0.04, 0.042, 0.052],
      snoutLen: 0.03,
      snoutR: 0.022,
      snoutDrop: 0.012,
      eyeshine: "#b8d4ff",
    },
    ears: { kind: "long", len: 0.15, w: 0.022, tilt: 0.12 },
    tail: { kind: "short", len: 0.045, r: 0.025, lift: 0.9, tip: "#ece6da" },
    pattern: (p, _n, part) =>
      part === "head" && p.y > 0.33
        ? { color: "#3a3630", mix: 0.6, glow: "#b8d4ff", glowStrength: 0.18 }
        : null,
  }),
  "crag-ram": quadruped({
    coat: { back: "#7d7366", belly: "#c4baa8", dark: "#2f2a25" },
    gait: "walk",
    legH: 0.18,
    bodyLen: 0.22,
    chest: [0.1, 0.1, 0.12],
    rump: [0.095, 0.1, 0.11],
    legR: 0.02,
    foot: "hoof",
    socks: 0.35,
    neck: { len: 0.08, pitch: 0.7, r: 0.055 },
    head: {
      r: [0.048, 0.055, 0.065],
      snoutLen: 0.06,
      snoutR: 0.032,
      snoutDrop: 0.03,
    },
    ears: { kind: "pointed", len: 0.04, w: 0.02, tilt: 1.3 },
    tail: { kind: "short", len: 0.06, r: 0.028, lift: -0.4 },
    extras: curlHorns(0.11, "#857760", "#9fc4ff"),
    pattern: (p, n, part) =>
      part === "body"
        ? { color: "#d0c6b2", mix: 0.25 * valueish(p) + (n.y > 0.5 ? 0.1 : 0) }
        : null,
  }),
  "thistle-hog": quadruped({
    coat: { back: "#4b4038", belly: "#776858", dark: "#1e1915" },
    gait: "trot",
    legH: 0.08,
    bodyLen: 0.2,
    chest: [0.08, 0.09, 0.12],
    rump: [0.075, 0.08, 0.1],
    rumpLift: -0.01,
    legR: 0.016,
    foot: "hoof",
    socks: 0.6,
    neck: { len: 0.04, pitch: 0.25, r: 0.07 },
    head: {
      r: [0.055, 0.055, 0.07],
      snoutLen: 0.08,
      snoutR: 0.03,
      snoutDrop: 0.03,
    },
    ears: { kind: "pointed", len: 0.04, w: 0.022, tilt: 0.6 },
    tail: { kind: "thin", len: 0.08, r: 0.008, lift: -0.8 },
    extras: (b, at) => {
      // Bristle crest along the spine, thistle-violet tips.
      b.part("body");
      for (let i = 0; i < 9; i += 1) {
        const t = i / 8;
        const z = at.chest[2] + 0.05 - t * (at.chest[2] - at.rump[2] + 0.06);
        const y = at.chest[1] + at.spec.chest[1] * (0.95 - t * 0.12);
        b.cone(
          [0, y - 0.01, z],
          [0, y + 0.045 - t * 0.012, z - 0.02],
          0.014,
          {
            color: "#2c241e",
            grain: GRAIN.fur,
            glow: "#d070c0",
            glowStrength: 0.12,
          },
          0.45,
          6,
        );
      }
    },
  }),
  "barrow-badger": quadruped({
    coat: { back: "#6a665f", belly: "#2a2724", dark: "#1b1a18" },
    gait: "waddle",
    legH: 0.06,
    bodyLen: 0.2,
    chest: [0.085, 0.075, 0.12],
    rump: [0.09, 0.075, 0.11],
    legR: 0.02,
    foot: "paw",
    socks: 0.9,
    splay: 0.12,
    neck: { len: 0.04, pitch: 0.2, r: 0.055 },
    head: {
      r: [0.045, 0.042, 0.06],
      snoutLen: 0.06,
      snoutR: 0.022,
      snoutDrop: 0.02,
      eyeshine: "#c9b27a",
    },
    ears: { kind: "round", len: 0.022, w: 0.016 },
    tail: { kind: "short", len: 0.05, r: 0.022, lift: -0.2 },
    pattern: (p, n, part) => {
      if (part !== "head") return null;
      const stripe = Math.abs(Math.abs(p.x) - 0.022);
      if (stripe < 0.011 && n.y > -0.2) return { color: "#1b1a18", mix: 0.95 };
      if (n.y > -0.3) return { color: "#ddd8cd", mix: 0.85 };
      return null;
    },
  }),
  "shade-lynx": quadruped({
    coat: { back: "#7b7163", belly: "#cfc6b6", dark: "#24211d" },
    gait: "walk",
    legH: 0.2,
    bodyLen: 0.2,
    chest: [0.07, 0.08, 0.1],
    rump: [0.07, 0.08, 0.095],
    rumpLift: 0.015,
    legR: 0.02,
    foot: "paw",
    neck: { len: 0.07, pitch: 0.6, r: 0.048 },
    head: {
      r: [0.055, 0.05, 0.05],
      snoutLen: 0.025,
      snoutR: 0.028,
      snoutDrop: 0.015,
      eyeshine: "#9fd0c8",
    },
    ears: { kind: "tufted", len: 0.055, w: 0.024, tilt: 0.25 },
    tail: { kind: "short", len: 0.08, r: 0.02, lift: -0.3, tip: "#24211d" },
    extras: (b, at) => {
      b.part("head", at.headPivot);
      for (const side of [1, -1]) {
        b.cone(
          add(at.headPivot, [
            side * 0.035,
            at.cranium[1] - 0.02,
            at.cranium[2],
          ]),
          add(at.headPivot, [
            side * 0.075,
            at.cranium[1] - 0.05,
            at.cranium[2] - 0.02,
          ]),
          0.022,
          "belly",
          0.5,
        );
      }
    },
    pattern: (p, n, part) =>
      part === "body" &&
      n.y > -0.2 &&
      Math.sin(p.x * 120) * Math.sin(p.z * 110) > 0.75
        ? { color: "#4a4238", mix: 0.5 }
        : null,
  }),
  "dusk-raccoon": quadruped({
    coat: { back: "#6d6862", belly: "#a39d94", dark: "#1f1d1b" },
    gait: "waddle",
    legH: 0.07,
    bodyLen: 0.17,
    chest: [0.07, 0.075, 0.09],
    rump: [0.08, 0.085, 0.1],
    rumpLift: 0.02,
    legR: 0.016,
    foot: "paw",
    socks: 0.5,
    neck: { len: 0.04, pitch: 0.4, r: 0.05 },
    head: {
      r: [0.05, 0.045, 0.05],
      snoutLen: 0.045,
      snoutR: 0.018,
      snoutDrop: 0.015,
      eyeshine: "#b7a5e0",
    },
    ears: { kind: "round", len: 0.03, w: 0.02 },
    tail: { kind: "ringed", len: 0.17, r: 0.03, lift: -0.15, tip: "#1f1d1b" },
    pattern: (p, n, part) => {
      if (part !== "head") return null;
      const mask = p.y > 0.2 && p.y < 0.245 && n.z > -0.2;
      if (mask) return { color: "#1a1817", mix: 0.92 };
      if (n.z > 0.3) return { color: "#d8d2c6", mix: 0.65 };
      return null;
    },
  }),
  "slate-marmot": quadruped({
    coat: { back: "#776855", belly: "#a89478", dark: "#3a2f25" },
    gait: "bound",
    legH: 0.04,
    bodyLen: 0.15,
    chest: [0.07, 0.07, 0.085],
    rump: [0.085, 0.08, 0.1],
    rumpLift: 0.01,
    legR: 0.016,
    foot: "paw",
    socks: 0.4,
    hindFold: 0.4,
    neck: { len: 0.03, pitch: 0.7, r: 0.045 },
    head: {
      r: [0.045, 0.04, 0.045],
      snoutLen: 0.025,
      snoutR: 0.024,
      snoutDrop: 0.012,
      eyeshine: "#e0b070",
    },
    ears: { kind: "round", len: 0.018, w: 0.013 },
    tail: { kind: "bushy", len: 0.08, r: 0.02, lift: -0.2, tip: "#3a2f25" },
  }),
  "silver-deer": quadruped({
    coat: { back: "#868176", belly: "#e0dbd0", dark: "#3c352d" },
    gait: "walk",
    legH: 0.27,
    bodyLen: 0.22,
    chest: [0.07, 0.085, 0.1],
    rump: [0.07, 0.085, 0.1],
    rumpLift: 0.01,
    legR: 0.013,
    foot: "hoof",
    neck: { len: 0.15, pitch: 1.05, r: 0.035 },
    head: {
      r: [0.038, 0.042, 0.06],
      snoutLen: 0.065,
      snoutR: 0.024,
      snoutDrop: 0.02,
      eyeshine: "#c6d8f2",
    },
    ears: { kind: "long", len: 0.08, w: 0.03, tilt: 1.0 },
    tail: { kind: "short", len: 0.05, r: 0.022, lift: 0.3, tip: "#e8e2d6" },
    pattern: (p, n, part) =>
      part === "body" &&
      n.y > 0.1 &&
      n.y < 0.8 &&
      Math.sin(p.x * 140 + p.z * 60) * Math.sin(p.z * 130) > 0.82
        ? { color: "#c9cdd2", mix: 0.6, glow: "#c6d8f2", glowStrength: 0.12 }
        : null,
  }),
  "dew-shrew": quadruped({
    coat: { back: "#584c42", belly: "#a2968a", dark: "#231e1a" },
    gait: "scurry",
    legH: 0.025,
    bodyLen: 0.08,
    chest: [0.04, 0.038, 0.05],
    rump: [0.045, 0.042, 0.055],
    legR: 0.008,
    foot: "paw",
    socks: 0.8,
    neck: { len: 0.015, pitch: 0.2, r: 0.032 },
    head: {
      r: [0.03, 0.028, 0.035],
      snoutLen: 0.05,
      snoutR: 0.012,
      snoutDrop: 0.01,
    },
    ears: { kind: "round", len: 0.012, w: 0.01 },
    tail: { kind: "thin", len: 0.1, r: 0.007, lift: -0.1 },
    info: { breathRate: 2.2 },
    pattern: glowSpot([0, 0.075, 0.16], 0.025, "#9ee0c8", 0.5, ["head"]),
  }),
  "hollow-squirrel": quadruped({
    coat: { back: "#77583f", belly: "#d0bda2", dark: "#2e2219" },
    gait: "bound",
    legH: 0.04,
    bodyLen: 0.1,
    chest: [0.04, 0.045, 0.055],
    rump: [0.05, 0.055, 0.065],
    rumpLift: 0.015,
    legR: 0.01,
    foot: "paw",
    hindFold: 1,
    neck: { len: 0.03, pitch: 1.0, r: 0.028 },
    head: {
      r: [0.032, 0.032, 0.036],
      snoutLen: 0.02,
      snoutR: 0.016,
      snoutDrop: 0.008,
      eyeshine: "#e0a860",
    },
    ears: { kind: "tufted", len: 0.03, w: 0.012, tilt: 0.15 },
    tail: { kind: "plume", len: 0.2, r: 0.035, lift: 0.4, tip: "#c8915a" },
    pattern: glowSpot([0, 0.3, -0.12], 0.04, "#e0a860", 0.18, ["tail"]),
  }),
  "ash-wolf": quadruped({
    coat: { back: "#67635c", belly: "#c4beb2", dark: "#26231f" },
    gait: "trot",
    legH: 0.22,
    bodyLen: 0.26,
    chest: [0.08, 0.095, 0.12],
    rump: [0.07, 0.08, 0.1],
    rumpLift: -0.005,
    legR: 0.02,
    foot: "paw",
    socks: 0.2,
    neck: { len: 0.1, pitch: 0.55, r: 0.06 },
    head: {
      r: [0.055, 0.05, 0.065],
      snoutLen: 0.08,
      snoutR: 0.028,
      snoutDrop: 0.012,
      eyeshine: "#d8c08a",
    },
    ears: { kind: "pointed", len: 0.055, w: 0.026, tilt: 0.25 },
    tail: { kind: "bushy", len: 0.26, r: 0.036, lift: -0.7, tip: "#2c2925" },
    extras: (b, at) => {
      // Neck ruff.
      b.part("body");
      b.ellipsoid(
        add(at.chest, [0, at.spec.chest[1] * 0.5, at.spec.chest[2] * 0.6]),
        [0.075, 0.085, 0.07],
        "coat",
        [0.4, 0, 0],
        16,
      );
    },
    pattern: (p, n, part) =>
      part === "head" && n.z > 0.3 && p.y < 0.5
        ? { color: "#d6d0c4", mix: 0.5 }
        : null,
  }),
  "stone-pika": quadruped({
    coat: { back: "#83786a", belly: "#cdc1ae", dark: "#3a332b" },
    gait: "hop",
    legH: 0.02,
    bodyLen: 0.07,
    chest: [0.045, 0.045, 0.05],
    rump: [0.05, 0.05, 0.055],
    legR: 0.009,
    foot: "paw",
    hindFold: 0.4,
    neck: { len: 0.015, pitch: 0.8, r: 0.035 },
    head: {
      r: [0.035, 0.034, 0.035],
      snoutLen: 0.012,
      snoutR: 0.017,
      snoutDrop: 0.006,
    },
    ears: { kind: "round", len: 0.03, w: 0.022 },
    tail: { kind: "short", len: 0.01, r: 0.01, lift: 0 },
    info: { breathRate: 1.6 },
    pattern: (p, _n, part) =>
      part === "head" && p.y > 0.12
        ? { color: "#d8d0c0", mix: 0.3, glow: "#bfd8ff", glowStrength: 0.12 }
        : null,
  }),
} satisfies Partial<Record<SpeciesSlug, Anatomy>>;

/** Smooth 0–1 mottle from position, for coat patches. */
function valueish(p: { x: number; y: number; z: number }): number {
  return (
    (Math.sin(p.x * 31 + p.z * 17) * Math.sin(p.y * 23 - p.z * 29) + 1) / 2
  );
}

export const ANATOMY: Record<SpeciesSlug, Anatomy> = {
  ...QUAD_SPECIES,
  "lantern-moth": moth({
    coat: { back: "#b5ae9f", belly: "#e2dccd", dark: "#3a3530" },
    wing: "#a49d8e",
    hindWing: "#8a8070",
    glow: "#e8b860",
    span: 0.3,
    pattern: (p, _n, part) => {
      if (part !== "wingL" && part !== "wingR") return null;
      // Eyespot on each forewing.
      const d = Math.hypot(Math.abs(p.x) - 0.2, p.z + 0.03);
      if (d < 0.022)
        return {
          color: "#d8c890",
          mix: 0.9,
          glow: "#e8b860",
          glowStrength: 0.25,
        };
      if (d < 0.04) return { color: "#4a4238", mix: 0.8 };
      return null;
    },
  }),
  "glow-tortoise": tortoise({
    coat: { back: "#56594a", belly: "#a89c7c", dark: "#2a2620" },
    shell: "#434a36",
    seam: "#2a2f22",
    glow: "#7fe0b0",
  }),
  "field-nightjar": bird({
    coat: { back: "#6b5b48", belly: "#9a8870", dark: "#2e261e" },
    gait: "fly",
    body: [0.06, 0.05, 0.11],
    bodyY: 0.2,
    bodyPitch: 0.05,
    neck: { len: 0, r: 0.03, s: 0 },
    head: {
      r: [0.045, 0.04, 0.045],
      bill: { len: 0.015, r: 0.012, color: "#2a231c" },
      eye: 0.014,
      eyeshine: "#e8d49a",
    },
    legs: { len: 0.04, r: 0.005, color: "#4a3e33" },
    wings: { span: 0.3, chord: 0.09, color: "#5f5040" },
    tail: { len: 0.11, w: 0.04 },
    pattern: (p, n, part) => {
      if (
        (part === "wingL" || part === "wingR") &&
        Math.abs(Math.abs(p.x) - 0.22) < 0.02
      ) {
        return {
          color: "#d8ccb0",
          mix: 0.85,
          glow: "#e8d49a",
          glowStrength: 0.12,
        };
      }
      return n.y > -0.2 &&
        valueish({ x: p.x * 3, y: p.y * 3, z: p.z * 3 }) > 0.7
        ? { color: "#3a3026", mix: 0.5 }
        : null;
    },
  }),
  "gloam-bat": bat({
    coat: { back: "#4a4038", belly: "#6e6357", dark: "#1a1715" },
    membrane: "#3a322d",
    glow: "#8fb8e8",
    body: [0.045, 0.04, 0.07],
    span: 0.3,
  }),
  "reed-heron": bird({
    coat: { back: "#7d8790", belly: "#d4d7d8", dark: "#2c3238" },
    gait: "wade",
    body: [0.075, 0.08, 0.15],
    bodyY: 0.52,
    bodyPitch: 0.35,
    neck: { len: 0.24, r: 0.022, s: 1 },
    head: {
      r: [0.028, 0.03, 0.045],
      bill: { len: 0.14, r: 0.012, color: "#a8955a" },
      eye: 0.008,
      eyeColor: "#c8b050",
      crest: 0.08,
    },
    legs: { len: 0.46, r: 0.009, color: "#5a5240" },
    wings: { span: 0, chord: 0, color: "#67717a" },
    tail: { len: 0.08, w: 0.05 },
    pattern: (p, _n, part) =>
      part === "head" && p.z < -0.02
        ? { glow: "#a8d8f0", glowStrength: 0.15 }
        : null,
  }),
  "ember-newt": newt({
    coat: { back: "#3a2e26", belly: "#b8703a", dark: "#1e1714" },
    spots: "#c8703a",
    glow: "#f09050",
  }),
  "crag-owl": bird({
    coat: { back: "#6e6152", belly: "#c8baa2", dark: "#2a231c" },
    gait: "fly",
    body: [0.1, 0.12, 0.1],
    bodyY: 0.22,
    bodyPitch: 0.9,
    neck: { len: 0.03, r: 0.07, s: 0 },
    head: {
      r: [0.08, 0.075, 0.07],
      bill: { len: 0.025, r: 0.012, color: "#3a3530", drop: 0.015 },
      eye: 0.019,
      eyeColor: "#c89038",
      eyeshine: "#f0c060",
      disc: "#b4a68e",
      tufts: 0.045,
    },
    legs: { len: 0.06, r: 0.012, color: "#a89a82" },
    wings: { span: 0.38, chord: 0.16, color: "#5e5244" },
    tail: { len: 0.09, w: 0.07 },
    pattern: (p, n, part) =>
      part === "body" && n.z > 0.2 && Math.sin(p.y * 160) > 0.6
        ? { color: "#6e604e", mix: 0.5 }
        : null,
  }),
};
