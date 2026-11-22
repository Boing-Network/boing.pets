/**
 * Species 36–42, the third batch: one more per territory, each a body type
 * the bestiary did not have (hedgehog, marten, eagle, loris, otter, tapir,
 * yak). Same rules as `species.ts` and `species-b.ts`: muted night coats,
 * natural proportions (checked against real animals in
 * `test/anatomy-proportions.test.ts`), and one restrained glow that says
 * something about the animal.
 *
 * Glow palette, to stay distinct from neighbours in the same territory:
 * candle gold (hedgehog spines), silver-lavender (marten bib), storm blue
 * (eagle), warm eyeshine (loris), aqua (otter sheen), moonlit white (tapir
 * saddle), aurora green-to-violet (yak fringe).
 */
import type { SpeciesSlug } from "@boing-pets/contract";
import { GRAIN, type CreatureBuilder } from "./builder";
import { bird, quadruped, type Anatomy, type QuadFrame } from "./plans";
import {
  add,
  combine,
  glowSpeckle,
  patterns,
  quillField,
  valueish,
} from "./patterns";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Aurora palette, cycled along the yak's fringe. */
const AURORA = [
  "#7fffd0",
  "#6ad8ff",
  "#8aa8ff",
  "#b088ff",
  "#8aa8ff",
  "#6ad8ff",
];

/**
 * A yak's long hair skirt: cones hanging from each flank, tinted along an
 * aurora gradient. Reads as the animal's signature without any texture.
 */
function auroraSkirt(perSide: number, hang: number) {
  return (b: CreatureBuilder, at: QuadFrame): void => {
    b.part("body");
    const c = at.spec.chest;
    const r = at.spec.rump;
    for (const side of [1, -1]) {
      for (let i = 0; i < perSide; i += 1) {
        const t = perSide === 1 ? 0.5 : i / (perSide - 1);
        const z = lerp(at.chest[2] + c[2] * 0.2, at.rump[2] - r[2] * 0.2, t);
        const y = lerp(at.chest[1], at.rump[1], t) - lerp(c[1], r[1], t) * 0.35;
        const x = side * lerp(c[0], r[0], t) * 0.88;
        const base: [number, number, number] = [x, y, z];
        const tip: [number, number, number] = [
          x + side * 0.012,
          y - hang * (0.8 + 0.4 * valueish({ x: t * 4, y: 0, z: side })),
          z - 0.012,
        ];
        b.cone(
          base,
          tip,
          0.016,
          {
            color: "#2e2924",
            grain: GRAIN.fur,
            glow: AURORA[i % AURORA.length],
            glowStrength: 0.5,
          },
          0.25,
          6,
        );
      }
    }
  };
}

/** Out-and-up yak horns with pale tips, plus the shoulder hump. */
function yakHornsAndHump(size: number) {
  return (b: CreatureBuilder, at: QuadFrame): void => {
    b.part("body");
    const c = at.spec.chest;
    b.ellipsoid(
      [0, at.chest[1] + c[1] * 0.72, at.chest[2] - 0.03],
      [c[0] * 0.8, c[1] * 0.55, 0.09],
      "coat",
      [0, 0, 0],
      16,
    );
    b.part("head", at.headPivot);
    const hr = at.spec.head.r;
    for (const side of [1, -1]) {
      let prev = add(at.headPivot, [
        side * hr[0] * 0.8,
        at.cranium[1] + hr[1] * 0.3,
        at.cranium[2] - hr[2] * 0.2,
      ]);
      const steps = 5;
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const next = add(at.headPivot, [
          side * (hr[0] * 0.8 + t * size * 0.6),
          at.cranium[1] + hr[1] * 0.3 + t * t * size * 0.75 - t * size * 0.04,
          at.cranium[2] - hr[2] * 0.2 - t * size * 0.1,
        ]);
        b.tube(
          prev,
          next,
          size * 0.075 * (1 - ((i - 1) / steps) * 0.75),
          size * 0.075 * (1 - t * 0.75),
          { color: i >= 4 ? "#d8d0bc" : "#7a6c58", grain: GRAIN.scale },
          8,
        );
        prev = next;
      }
    }
  };
}

export const ANATOMY_C = {
  // --- Meadow ----------------------------------------------------------
  "candle-hedgehog": quadruped({
    coat: { back: "#6b5a44", belly: "#cdb594", dark: "#2a2118" },
    gait: "waddle",
    legH: 0.02,
    bodyLen: 0.09,
    chest: [0.05, 0.052, 0.06],
    rump: [0.055, 0.055, 0.06],
    legR: 0.009,
    foot: "paw",
    neck: { len: 0.01, pitch: 0.3, r: 0.045 },
    head: {
      r: [0.03, 0.03, 0.034],
      snoutLen: 0.026,
      snoutR: 0.015,
      snoutDrop: 0.008,
      eye: 0.006,
      eyeshine: "#f2d27a",
    },
    ears: { kind: "round", len: 0.017, w: 0.014 },
    tail: { kind: "short", len: 0.008, r: 0.008, lift: 0 },
    info: { breathRate: 1.8 },
    // Spines tipped with candle-flame gold.
    extras: quillField({
      rows: 6,
      across: 7,
      len: 0.05,
      r: 0.006,
      color: "#4a3d2c",
      glow: "#f2d27a",
      glowStrength: 0.34,
    }),
    // Pale, pointed face; dark nose and eye mask.
    pattern: patterns((p, n, part) =>
      part === "head" && n.z > 0.2 && n.y < 0.6
        ? { color: "#cdb594", mix: 0.65 }
        : null,
    ),
  }),

  // --- Thicket ---------------------------------------------------------
  "veil-marten": quadruped({
    coat: { back: "#4a3a30", belly: "#6a5648", dark: "#1a1410" },
    gait: "bound",
    legH: 0.045,
    bodyLen: 0.17,
    waist: 0.3,
    chest: [0.045, 0.05, 0.075],
    rump: [0.048, 0.05, 0.075],
    legR: 0.01,
    foot: "paw",
    socks: 0.5,
    neck: { len: 0.05, pitch: 0.45, r: 0.036 },
    head: {
      r: [0.032, 0.03, 0.04],
      snoutLen: 0.026,
      snoutR: 0.017,
      snoutDrop: 0.01,
      eyeshine: "#c8b8ff",
    },
    ears: { kind: "round", len: 0.02, w: 0.018 },
    tail: { kind: "bushy", len: 0.22, r: 0.028, lift: -0.15, tip: "#1a1410" },
    pattern: patterns(
      // The cream throat bib, lit with a silver-lavender veil.
      (p, n, part) =>
        part === "head" && n.y < -0.2
          ? { color: "#e8d6a8", mix: 0.75, glow: "#c8b8ff", glowStrength: 0.3 }
          : part === "body" && n.y < -0.35 && p.z > 0.06
            ? {
                color: "#e8d6a8",
                mix: 0.55,
                glow: "#c8b8ff",
                glowStrength: 0.26,
              }
            : null,
      // Rounded ears edged in pale fur.
      (p, n, part) =>
        part === "head" && p.y > 0.2 && n.z < 0.2
          ? { color: "#d8c8a0", mix: 0.4 }
          : null,
    ),
  }),

  // --- Ridge -----------------------------------------------------------
  "tarn-eagle": bird({
    coat: { back: "#5a4636", belly: "#8a735a", dark: "#241c16" },
    gait: "fly",
    body: [0.075, 0.08, 0.16],
    bodyY: 0.26,
    bodyPitch: 0.3,
    neck: { len: 0.04, r: 0.045, s: 0 },
    head: {
      r: [0.05, 0.048, 0.065],
      bill: { len: 0.04, r: 0.02, color: "#4a4036", drop: 0.02 },
      eye: 0.014,
      eyeColor: "#6a4a20",
      eyeshine: "#f0c880",
    },
    legs: { len: 0.07, r: 0.012, color: "#b89a58" },
    wings: { span: 0.8, chord: 0.2, color: "#5a4636" },
    tail: { len: 0.26, w: 0.08 },
    pattern: patterns(
      // Sunlit golden nape.
      (p, n, part) =>
        part === "head" && n.z < 0.1 && n.y > 0
          ? { color: "#b88a4a", mix: 0.6, glow: "#ffd070", glowStrength: 0.2 }
          : null,
      // Pale coverts on the wing, and storm-blue light along the tips.
      (p, _n, part) => {
        if (part !== "wingL" && part !== "wingR") return null;
        const x = Math.abs(p.x);
        if (x > 0.55) {
          return {
            color: "#241c16",
            mix: 0.6,
            glow: "#9ec8ff",
            glowStrength: 0.18 + clamp01((x - 0.55) / 0.3) * 0.22,
          };
        }
        return x > 0.15 && x < 0.4 && valueish(p) > 0.5
          ? { color: "#8a6a44", mix: 0.5 }
          : null;
      },
    ),
  }),

  // --- Moonlit Glade ---------------------------------------------------
  "halo-loris": quadruped({
    coat: { back: "#8a7458", belly: "#c8b896", dark: "#3a2a1c" },
    gait: "walk",
    legH: 0.035,
    bodyLen: 0.12,
    chest: [0.05, 0.05, 0.065],
    rump: [0.052, 0.052, 0.065],
    legR: 0.011,
    foot: "paw",
    socks: 0.4,
    neck: { len: 0.025, pitch: 0.6, r: 0.042 },
    head: {
      r: [0.04, 0.04, 0.038],
      snoutLen: 0.014,
      snoutR: 0.02,
      snoutDrop: 0.004,
      eye: 0.017,
      eyeshine: "#ffe9a0",
    },
    ears: { kind: "round", len: 0.012, w: 0.012 },
    tail: { kind: "short", len: 0.012, r: 0.01, lift: 0 },
    info: { breathRate: 1.2 },
    pattern: patterns(
      // The dark stripe down the spine.
      (p, n, part) =>
        part === "body" && n.y > 0.7 && Math.abs(p.x) < 0.012
          ? { color: "#3a2a1c", mix: 0.7 }
          : null,
      // The "halo": a warm ring of light around the huge eyes.
      (p, n, part) =>
        part === "head" && n.z > 0.4 && Math.abs(p.x) > 0.012
          ? { color: "#b8a47e", mix: 0.4, glow: "#ffe9a0", glowStrength: 0.25 }
          : null,
    ),
  }),

  // --- Glowfen ---------------------------------------------------------
  "wisp-otter": quadruped({
    coat: { back: "#5a4636", belly: "#c8b89a", dark: "#2a1f18" },
    gait: "bound",
    legH: 0.045,
    bodyLen: 0.24,
    waist: 0.35,
    chest: [0.055, 0.06, 0.09],
    rump: [0.065, 0.065, 0.1],
    legR: 0.013,
    foot: "paw",
    neck: { len: 0.05, pitch: 0.35, r: 0.05 },
    head: {
      r: [0.042, 0.036, 0.05],
      snoutLen: 0.02,
      snoutR: 0.026,
      snoutDrop: 0.008,
      eye: 0.008,
      eyeshine: "#9fe8e0",
    },
    ears: { kind: "round", len: 0.014, w: 0.014 },
    tail: { kind: "thin", len: 0.28, r: 0.03, lift: -0.1 },
    pattern: patterns(
      // Cream chin and throat.
      (_p, n, part) =>
        part === "head" && n.y < -0.1 ? { color: "#d8c8a8", mix: 0.7 } : null,
      // Bioluminescent water clinging to the fur.
      glowSpeckle(["body", "tail", "head"], "#8ff0e0", 0.3, 1.1, 0.5, 0.1),
    ),
  }),

  // --- Elder Grove -----------------------------------------------------
  "saddle-tapir": quadruped({
    coat: { back: "#2a2a2c", belly: "#3a3a3c", dark: "#141416" },
    gait: "walk",
    legH: 0.13,
    bodyLen: 0.3,
    rumpLift: 0.015,
    chest: [0.1, 0.115, 0.14],
    rump: [0.11, 0.115, 0.14],
    legR: 0.026,
    foot: "hoof",
    neck: { len: 0.06, pitch: 0.3, r: 0.08 },
    head: {
      r: [0.06, 0.06, 0.08],
      snoutLen: 0.09,
      snoutR: 0.045,
      snoutDrop: 0.03,
      eye: 0.009,
      eyeshine: "#e8d0a0",
    },
    ears: { kind: "round", len: 0.04, w: 0.03 },
    tail: { kind: "short", len: 0.03, r: 0.02, lift: -0.2 },
    pattern: (p, _n, part) => {
      // The pale saddle across the middle of the back and flanks, with soft
      // edges, faintly moonlit.
      if (part !== "body") return null;
      const k = clamp01((0.13 - Math.abs(p.z)) / 0.05);
      return k > 0
        ? {
            color: "#cfd2cc",
            mix: 0.85 * k,
            glow: "#d8f0e8",
            glowStrength: 0.22 * k,
          }
        : null;
    },
  }),

  // --- High Crags ------------------------------------------------------
  "aurora-yak": quadruped({
    coat: { back: "#3a322a", belly: "#2e2822", dark: "#16120e" },
    gait: "walk",
    legH: 0.15,
    bodyLen: 0.3,
    chest: [0.115, 0.125, 0.15],
    rump: [0.11, 0.115, 0.14],
    legR: 0.026,
    foot: "hoof",
    socks: 0.3,
    neck: { len: 0.07, pitch: 0.45, r: 0.075 },
    head: {
      r: [0.055, 0.065, 0.085],
      snoutLen: 0.06,
      snoutR: 0.036,
      snoutDrop: 0.03,
      eyeshine: "#9fffd8",
    },
    ears: { kind: "pointed", len: 0.045, w: 0.03, tilt: 1.2 },
    tail: { kind: "bushy", len: 0.22, r: 0.028, lift: -0.7 },
    extras: combine(yakHornsAndHump(0.2), auroraSkirt(9, 0.1)),
    // A paler muzzle and a frosted shoulder.
    pattern: patterns(
      (_p, n, part) =>
        part === "head" && n.z > 0.5 ? { color: "#6a5c4c", mix: 0.45 } : null,
      (p, n, part) =>
        part === "body" && n.y > 0.5 && valueish(p) > 0.65
          ? { color: "#7a7468", mix: 0.35 }
          : null,
    ),
  }),
} satisfies Partial<Record<SpeciesSlug, Anatomy>>;
