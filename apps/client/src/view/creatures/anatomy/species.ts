/**
 * Species 1–21 as anatomy parameter sets (22–35 live in `species-b.ts`). Muted night coats (they live
 * under moonlight), natural proportions, and one restrained glow each, the
 * world's bioluminescent thread, instead of toy neon.
 */
import type { SpeciesSlug } from "@boing-pets/contract";
import { GRAIN, type Vec3, type CreatureBuilder } from "./builder";
import { ANATOMY_B } from "./species-b";
import { ANATOMY_C } from "./species-c";
import {
  add,
  cheekRuff,
  combine,
  glowSpeckle,
  glowSpot,
  patterns,
  tailTipGlow,
  valueish,
} from "./patterns";
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
            glow: i % 2 === 1 ? glint : undefined,
            glowStrength: 0.3,
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
    waist: 0.55,
    chest: [0.068, 0.075, 0.1],
    rump: [0.064, 0.068, 0.09],
    legR: 0.016,
    foot: "paw",
    socks: 0.55,
    neck: { len: 0.09, pitch: 0.75, r: 0.045 },
    head: {
      r: [0.047, 0.043, 0.054],
      snoutLen: 0.07,
      snoutR: 0.024,
      eyeshine: "#c9a050",
    },
    ears: { kind: "pointed", len: 0.075, w: 0.028, tilt: 0.3 },
    tail: { kind: "bushy", len: 0.3, r: 0.042, lift: -0.55, tip: "#e2d8c6" },
    extras: cheekRuff(0.02),
    pattern: patterns(
      (p, n, part) =>
        part === "head" && n.z > 0.2 && p.y < 0.36
          ? { color: "#e2d6c2", mix: 0.7 }
          : null,
      glowSpot([0, 0.2, 0.2], 0.05, "#e08a3c", 0.32, ["body"]),
      // The pale tail tip burns like a coal, and a few embers drift in the coat.
      tailTipGlow(-0.3, "#e89040", 0.4),
      glowSpeckle(["body"], "#e89040", 0.14, 1.2, 0.55, 0.3),
    ),
  }),
  "moss-stag": quadruped({
    coat: { back: "#56553f", belly: "#b8ae98", dark: "#29231d" },
    gait: "walk",
    legH: 0.27,
    bodyLen: 0.26,
    waist: 0.25,
    chest: [0.085, 0.1, 0.12],
    rump: [0.08, 0.095, 0.11],
    rumpLift: 0.01,
    legR: 0.016,
    foot: "hoof",
    socks: 0.2,
    neck: { len: 0.14, pitch: 0.95, r: 0.05 },
    head: {
      r: [0.045, 0.05, 0.07],
      snoutLen: 0.08,
      snoutR: 0.03,
      snoutDrop: 0.025,
      eyeshine: "#7fc0c0",
    },
    ears: { kind: "long", len: 0.075, w: 0.028, tilt: 1.15 },
    tail: { kind: "short", len: 0.06, r: 0.028, lift: 0.4, tip: "#d8d0c0" },
    extras: combine(antlers(0.24, "#6a5a44", "#6bc8d8"), (b) => {
      // Shaggy neck, thicker than the neck tube, as on a rutting stag.
      b.part("body");
      b.ellipsoid(
        [0, 0.47, 0.237],
        [0.048, 0.085, 0.052],
        "coat",
        [0.62, 0, 0],
        14,
      );
    }),
    pattern: patterns(
      // Lichen patches on the back: green, and faintly cyan-lit.
      (p, n, part) =>
        part === "body" && n.y > 0.55 && valueish(p) > 0.62
          ? { color: "#4e6a46", mix: 0.55, glow: "#6bc8d8", glowStrength: 0.2 }
          : null,
      // Pale rump patch.
      (p, n, part) =>
        part === "body" && p.z < -0.2 && n.z < -0.3
          ? { color: "#d8d0c0", mix: 0.7 }
          : null,
    ),
  }),
  "moon-hare": quadruped({
    coat: { back: "#8b857b", belly: "#dcd6cb", dark: "#2b2722" },
    gait: "hop",
    legH: 0.06,
    bodyLen: 0.12,
    waist: 0.2,
    chest: [0.055, 0.065, 0.075],
    rump: [0.068, 0.078, 0.085],
    rumpLift: 0.02,
    legR: 0.019,
    foot: "paw",
    hindFold: 0.9,
    hindFoot: 0.075,
    neck: { len: 0.05, pitch: 1.0, r: 0.035 },
    head: {
      r: [0.036, 0.038, 0.046],
      snoutLen: 0.028,
      snoutR: 0.022,
      snoutDrop: 0.012,
      eyeshine: "#b8d4ff",
    },
    ears: { kind: "long", len: 0.11, w: 0.022, tilt: 0.12 },
    tail: { kind: "short", len: 0.045, r: 0.025, lift: 0.9, tip: "#ece6da" },
    pattern: patterns(
      // Black-tipped ears that catch the moon.
      (p, _n, part) =>
        part === "head" && p.y > 0.33
          ? { color: "#3a3630", mix: 0.6, glow: "#b8d4ff", glowStrength: 0.34 }
          : null,
      // Grizzled back, the way a hare's coat is ticked with pale hairs.
      (p, n, part) =>
        part === "body" && n.y > 0.4 && valueish(p) > 0.6
          ? { color: "#a29b8f", mix: 0.4 }
          : null,
    ),
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
    ears: { kind: "pointed", len: 0.05, w: 0.024, tilt: 1.3 },
    tail: { kind: "short", len: 0.06, r: 0.028, lift: -0.4 },
    extras: curlHorns(0.11, "#857760", "#9fc4ff"),
    pattern: (p, n, part) =>
      part === "body"
        ? { color: "#d0c6b2", mix: 0.25 * valueish(p) + (n.y > 0.5 ? 0.1 : 0) }
        : null,
  }),
  "thistle-hog": quadruped({
    coat: { back: "#7e6b5a", belly: "#ab9a82", dark: "#2c241d" },
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
    ears: { kind: "pointed", len: 0.055, w: 0.03, tilt: 0.6 },
    tail: { kind: "thin", len: 0.08, r: 0.008, lift: -0.8 },
    extras: (b, at) => {
      // Short tusks curving up from the lower jaw.
      b.part("head", at.headPivot);
      for (const side of [1, -1]) {
        const base = add(at.headPivot, [side * 0.026, -0.018, 0.1]);
        b.cone(
          base,
          add(base, [side * 0.006, 0.03, 0.012]),
          0.006,
          { color: "#e8e0cc", grain: GRAIN.smooth },
          1,
          6,
        );
      }
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
            glowStrength: 0.3,
          },
          0.45,
          6,
        );
      }
    },
  }),
  "barrow-badger": quadruped({
    coat: { back: "#7a766e", belly: "#2e2b28", dark: "#1b1a18" },
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
      r: [0.045, 0.042, 0.052],
      snoutLen: 0.052,
      snoutR: 0.022,
      snoutDrop: 0.02,
      eyeshine: "#c9b27a",
    },
    ears: { kind: "round", len: 0.03, w: 0.02 },
    tail: { kind: "short", len: 0.09, r: 0.026, lift: -0.2 },
    pattern: (p, n, part) => {
      if (part === "body") {
        // Grizzled grey back.
        return n.y > 0.3 && valueish(p) > 0.5
          ? { color: "#a39e94", mix: 0.35 }
          : null;
      }
      if (part !== "head") return null;
      const stripe = Math.abs(Math.abs(p.x) - 0.022);
      if (stripe < 0.011 && n.y > -0.2) return { color: "#1b1a18", mix: 0.95 };
      // The pale face stripes hold a lamp-amber light.
      if (n.y > -0.3) {
        return {
          color: "#ddd8cd",
          mix: 0.85,
          glow: "#c9b27a",
          glowStrength: 0.2,
        };
      }
      return null;
    },
  }),
  "shade-lynx": quadruped({
    coat: { back: "#7b7163", belly: "#cfc6b6", dark: "#24211d" },
    gait: "walk",
    legH: 0.17,
    bodyLen: 0.2,
    waist: 0.55,
    chest: [0.07, 0.08, 0.1],
    rump: [0.07, 0.08, 0.095],
    rumpLift: 0.015,
    legR: 0.02,
    foot: "paw",
    neck: { len: 0.05, pitch: 0.45, r: 0.052 },
    head: {
      r: [0.055, 0.05, 0.05],
      snoutLen: 0.025,
      snoutR: 0.028,
      snoutDrop: 0.015,
      eyeshine: "#9fd0c8",
    },
    ears: { kind: "tufted", len: 0.055, w: 0.024, tilt: 0.25 },
    tail: { kind: "short", len: 0.08, r: 0.02, lift: -0.3, tip: "#24211d" },
    extras: cheekRuff(0.026),
    pattern: patterns(
      (p, n, part) =>
        part === "body" &&
        n.y > -0.2 &&
        Math.sin(p.x * 120) * Math.sin(p.z * 110) > 0.75
          ? { color: "#4a4238", mix: 0.5 }
          : null,
      // Ear tufts catch a cold teal glint.
      (p, _n, part) =>
        part === "head" && p.y > 0.4
          ? { glow: "#9fd0c8", glowStrength: 0.4 }
          : null,
    ),
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
    ears: { kind: "round", len: 0.04, w: 0.024 },
    tail: { kind: "ringed", len: 0.17, r: 0.03, lift: -0.45 },
    pattern: (p, n, part) => {
      if (part !== "head") return null;
      const mask = p.y > 0.2 && p.y < 0.245 && n.z > -0.2;
      // A lavender shimmer rims the mask, top and bottom.
      const rim =
        n.z > -0.2 &&
        ((p.y >= 0.245 && p.y < 0.256) || (p.y > 0.19 && p.y <= 0.2));
      if (rim) return { glow: "#b7a5e0", glowStrength: 0.32 };
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
    tail: { kind: "bushy", len: 0.12, r: 0.02, lift: -0.2, tip: "#3a2f25" },
    pattern: patterns(
      // Slate-grey grizzle over a warm brown coat.
      (p, n, part) =>
        part === "body" && n.y > 0.2 && valueish(p) > 0.55
          ? { color: "#8f8a80", mix: 0.4 }
          : null,
      (p, n, part) =>
        part === "head" && n.z > 0.5 && p.y < 0.17
          ? { color: "#cdbfa5", mix: 0.5 }
          : null,
      // Warm amber whisker pads.
      glowSpot([0.012, 0.165, 0.2], 0.026, "#e0b070", 0.36, ["head"]),
      glowSpot([-0.012, 0.165, 0.2], 0.026, "#e0b070", 0.36, ["head"]),
    ),
  }),
  "silver-deer": quadruped({
    coat: { back: "#868176", belly: "#e0dbd0", dark: "#3c352d" },
    gait: "walk",
    legH: 0.235,
    bodyLen: 0.22,
    waist: 0.35,
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
        ? { color: "#c9cdd2", mix: 0.6, glow: "#c6d8f2", glowStrength: 0.26 }
        : part === "body" && p.z < -0.17 && n.z < -0.3
          ? { color: "#ece8de", mix: 0.7 }
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
    tail: { kind: "thin", len: 0.16, r: 0.007, lift: -0.1 },
    info: { breathRate: 2.2 },
    pattern: patterns(
      glowSpot([0, 0.075, 0.16], 0.025, "#9ee0c8", 0.5, ["head"]),
      // Dew beads on its back.
      glowSpeckle(["body"], "#b8f0e0", 0.3, 1.4, 0.5, 0.3),
    ),
  }),
  "hollow-squirrel": quadruped({
    coat: { back: "#77583f", belly: "#d0bda2", dark: "#2e2219" },
    gait: "bound",
    legH: 0.04,
    bodyLen: 0.1,
    waist: 0.15,
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
    tail: { kind: "plume", len: 0.22, r: 0.034, lift: 0.5 },
    // The plume of the tail warms toward its tip.
    pattern: (p, _n, part) =>
      part === "tail" && p.y > 0.18
        ? {
            glow: "#e0a860",
            glowStrength: 0.15 + Math.min(0.25, (p.y - 0.18) * 2.5),
          }
        : null,
  }),
  "ash-wolf": quadruped({
    coat: { back: "#67635c", belly: "#c4beb2", dark: "#26231f" },
    gait: "trot",
    legH: 0.22,
    bodyLen: 0.26,
    waist: 0.5,
    chest: [0.08, 0.095, 0.12],
    rump: [0.07, 0.08, 0.1],
    rumpLift: -0.005,
    legR: 0.024,
    foot: "paw",
    socks: 0,
    neck: { len: 0.1, pitch: 0.55, r: 0.06 },
    head: {
      r: [0.055, 0.05, 0.065],
      snoutLen: 0.08,
      snoutR: 0.028,
      snoutDrop: 0.012,
      eyeshine: "#d8c08a",
    },
    ears: { kind: "pointed", len: 0.065, w: 0.03, tilt: 0.25 },
    tail: { kind: "bushy", len: 0.26, r: 0.036, lift: -1.0, tip: "#2c2925" },
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
    pattern: patterns(
      (p, n, part) =>
        part === "head" && n.z > 0.3 && p.y < 0.5
          ? { color: "#d6d0c4", mix: 0.5 }
          : null,
      // A darker saddle across the back.
      (p, n, part) =>
        part === "body" && n.y > 0.45
          ? { color: "#3b3834", mix: 0.25 + 0.3 * valueish(p) }
          : null,
      // Ash-gold embers caught in the coat.
      glowSpeckle(["body", "tail"], "#d8a050", 0.22, 1.1, 0.5, 0.3),
    ),
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
        ? { color: "#d8d0c0", mix: 0.3, glow: "#bfd8ff", glowStrength: 0.26 }
        : null,
  }),
} satisfies Partial<Record<SpeciesSlug, Anatomy>>;

export const ANATOMY: Record<SpeciesSlug, Anatomy> = {
  ...QUAD_SPECIES,
  ...ANATOMY_B,
  ...ANATOMY_C,
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
          glowStrength: 0.5,
        };
      if (d < 0.04) return { color: "#4a4238", mix: 0.8 };
      // A thin lantern-light rim along the outer wing edge.
      if (Math.abs(p.x) > 0.255) return { glow: "#e8b860", glowStrength: 0.2 };
      return null;
    },
  }),
  "glow-tortoise": tortoise({
    coat: { back: "#56594a", belly: "#a89c7c", dark: "#2a2620" },
    shell: "#5c5f49",
    seam: "#30352a",
    glow: "#7fe0b0",
  }),
  "field-nightjar": bird({
    coat: { back: "#8e7d65", belly: "#bcab90", dark: "#2e261e" },
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
    wings: { span: 0.37, chord: 0.09, color: "#7e6c54" },
    tail: { len: 0.15, w: 0.04 },
    pattern: (p, n, part) => {
      if (
        (part === "wingL" || part === "wingR") &&
        Math.abs(Math.abs(p.x) - 0.265) < 0.02
      ) {
        return {
          color: "#d8ccb0",
          mix: 0.85,
          glow: "#e8d49a",
          glowStrength: 0.3,
        };
      }
      if (part === "head" && n.y < -0.2 && n.z > 0) {
        return { color: "#e8e0cc", mix: 0.8 };
      }
      return n.y > -0.2 &&
        valueish({ x: p.x * 3, y: p.y * 3, z: p.z * 3 }) > 0.7
        ? { color: "#3a3026", mix: 0.5 }
        : null;
    },
  }),
  "gloam-bat": bat({
    coat: { back: "#6e6155", belly: "#93867a", dark: "#1a1715" },
    membrane: "#51463e",
    glow: "#8fb8e8",
    body: [0.045, 0.04, 0.07],
    span: 0.3,
  }),
  "reed-heron": bird({
    coat: { back: "#7d8790", belly: "#d4d7d8", dark: "#2c3238" },
    gait: "wade",
    body: [0.085, 0.09, 0.17],
    bodyY: 0.44,
    bodyPitch: 0.35,
    neck: { len: 0.26, r: 0.024, s: 1 },
    head: {
      r: [0.028, 0.03, 0.045],
      bill: { len: 0.14, r: 0.012, color: "#a8955a" },
      eye: 0.008,
      eyeColor: "#c8b050",
      crest: 0.08,
    },
    legs: { len: 0.37, r: 0.01, color: "#5a5240" },
    wings: { span: 0, chord: 0, color: "#67717a" },
    tail: { len: 0.1, w: 0.05 },
    pattern: (p, _n, part) =>
      part === "head" && p.z < -0.02
        ? { glow: "#a8d8f0", glowStrength: 0.3 }
        : null,
  }),
  "ember-newt": newt({
    coat: { back: "#3a2e26", belly: "#b8703a", dark: "#1e1714" },
    spots: "#c8703a",
    glow: "#f09050",
  }),
  "crag-owl": bird({
    coat: { back: "#857664", belly: "#d4c7b0", dark: "#2a231c" },
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
      discGlow: "#f0c060",
      tufts: 0.045,
    },
    legs: { len: 0.06, r: 0.012, color: "#a89a82" },
    wings: { span: 0.46, chord: 0.16, color: "#5e5244" },
    tail: { len: 0.13, w: 0.07 },
    pattern: (p, n, part) =>
      part === "body" && n.z > 0.2 && Math.sin(p.y * 160) > 0.6
        ? { color: "#6e604e", mix: 0.5 }
        : null,
  }),
};
