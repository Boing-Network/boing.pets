/**
 * Species 22–35, the second bestiary pass: two more per territory. Same
 * rules as `species.ts`: muted night coats, natural proportions, and one
 * restrained glow each that says something about the animal (pollen on a
 * vole, a frog's lit throat, frost on a mountain cat).
 *
 * Glow palette, to keep neighbours distinct: clover green-gold (vole), amber
 * (kestrel, goat lichen), lime-gold quill tips (porcupine), crimson (weasel),
 * fog blue (swift), opal shimmer (dormouse), moon-milk white (hush owl),
 * mint-cyan (frog), sedge gold (muskrat), fungal green (bear), cobalt (jay),
 * ice blue (rime cat), violet sheen (chough).
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

/** Backswept scimitar horns with glowing growth rings (ibex, goats). */
function sweptHorns(size: number, color: string, glow: string) {
  return (b: CreatureBuilder, at: QuadFrame): void => {
    b.part("head", at.headPivot);
    const hr = at.spec.head.r;
    for (const side of [1, -1]) {
      let prev = add(at.headPivot, [
        side * hr[0] * 0.45,
        at.cranium[1] + hr[1] * 0.8,
        at.cranium[2] - hr[2] * 0.05,
      ]);
      const steps = 6;
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const next = add(at.headPivot, [
          side * (hr[0] * 0.55 + t * size * 0.2),
          at.cranium[1] + hr[1] * 0.8 + Math.sin(t * 1.5) * size * 0.5,
          at.cranium[2] - hr[2] * 0.05 - t * size * 0.8,
        ]);
        const r0 = size * 0.07 * (1 - ((i - 1) / steps) * 0.8);
        const r1 = size * 0.07 * (1 - t * 0.8);
        b.tube(
          prev,
          next,
          r0,
          r1,
          {
            color,
            grain: GRAIN.scale,
            glow: i % 2 === 0 ? glow : undefined,
            glowStrength: 0.3,
          },
          8,
        );
        prev = next;
      }
    }
  };
}

/** A goat's beard: a short tuft under the chin, lichen-lit at the tip. */
function beard(color: string, glow: string) {
  return (b: CreatureBuilder, at: QuadFrame): void => {
    b.part("head", at.headPivot);
    const hr = at.spec.head.r;
    const chin = add(at.headPivot, [
      0,
      at.cranium[1] - hr[1] * 0.75,
      at.cranium[2] + hr[2] * 0.55,
    ]);
    b.cone(
      chin,
      add(chin, [0, -0.05, -0.008]),
      0.012,
      { color, grain: GRAIN.fur, glow, glowStrength: 0.3 },
      0.5,
      6,
    );
  };
}

/** Eye domes on top of the head (frogs). */
function eyeDomes(glow: string) {
  return (b: CreatureBuilder, at: QuadFrame): void => {
    b.part("head", at.headPivot);
    const hr = at.spec.head.r;
    for (const side of [1, -1]) {
      b.ellipsoid(
        add(at.headPivot, [
          side * hr[0] * 0.58,
          at.cranium[1] + hr[1] * 0.62,
          at.cranium[2] + hr[2] * 0.3,
        ]),
        [0.017, 0.015, 0.017],
        { color: "#2c3f27", grain: GRAIN.smooth, glow, glowStrength: 0.18 },
        [0, 0, 0],
        10,
      );
    }
  };
}

/** A heavy shoulder hump and glowing bracket fungi along the spine (bear). */
function mossyHump(glow: string) {
  return (b: CreatureBuilder, at: QuadFrame): void => {
    b.part("body");
    const c = at.spec.chest;
    const r = at.spec.rump;
    // Shoulder hump: the bear's most recognisable silhouette.
    b.ellipsoid(
      [0, at.chest[1] + c[1] * 0.78, at.chest[2] - 0.035],
      [c[0] * 0.78, c[1] * 0.62, 0.085],
      "coat",
      [0, 0, 0],
      16,
    );
    const rows = 6;
    for (let i = 0; i < rows; i += 1) {
      const t = i / (rows - 1);
      const side = i % 2 === 0 ? 1 : -1;
      const z = at.chest[2] - 0.02 - t * (at.chest[2] - at.rump[2] + 0.04);
      const ry = c[1] + (r[1] - c[1]) * t;
      const y = at.chest[1] + (at.rump[1] - at.chest[1]) * t;
      b.ellipsoid(
        [side * (0.03 + 0.012 * (1 - t)), y + ry * 0.93, z],
        [0.022 - t * 0.006, 0.007, 0.016 - t * 0.004],
        {
          color: "#b9a77a",
          grain: GRAIN.smooth,
          glow,
          glowStrength: 0.55,
        },
        [0, 0, side * 0.35],
        8,
      );
    }
  };
}

export const ANATOMY_B = {
  // --- Meadow ----------------------------------------------------------
  "clover-vole": quadruped({
    coat: { back: "#8c7a58", belly: "#c9bda0", dark: "#2f271e" },
    gait: "scurry",
    legH: 0.02,
    bodyLen: 0.075,
    chest: [0.04, 0.04, 0.048],
    rump: [0.046, 0.045, 0.052],
    rumpLift: 0.004,
    legR: 0.008,
    foot: "paw",
    neck: { len: 0.012, pitch: 0.4, r: 0.034 },
    head: {
      r: [0.032, 0.03, 0.034],
      snoutLen: 0.012,
      snoutR: 0.017,
      snoutDrop: 0.006,
      eye: 0.006,
      eyeshine: "#c6e87a",
    },
    ears: { kind: "round", len: 0.016, w: 0.013 },
    tail: { kind: "thin", len: 0.05, r: 0.007, lift: -0.1 },
    info: { breathRate: 2.0 },
    pattern: patterns(
      // Darker dorsal stripe over a blunt, round-bodied vole.
      (p, n, part) =>
        part === "body" && n.y > 0.7 && Math.abs(p.x) < 0.012
          ? { color: "#4a3d2c", mix: 0.6 }
          : null,
      // Clover pollen dusted on its back.
      glowSpeckle(["body", "head"], "#c6e87a", 0.3, 1, 0.45, 0.2),
    ),
  }),
  "amber-kestrel": bird({
    coat: { back: "#a4663a", belly: "#d9c3a0", dark: "#2b211a" },
    gait: "fly",
    body: [0.05, 0.052, 0.11],
    bodyY: 0.22,
    bodyPitch: 0.22,
    neck: { len: 0.025, r: 0.03, s: 0 },
    head: {
      r: [0.038, 0.036, 0.046],
      bill: { len: 0.02, r: 0.013, color: "#2e2a26", drop: 0.012 },
      eye: 0.012,
      eyeColor: "#14100c",
      eyeshine: "#f2b866",
    },
    legs: { len: 0.05, r: 0.006, color: "#d8b24c" },
    wings: { span: 0.34, chord: 0.1, color: "#9a5f36" },
    tail: { len: 0.14, w: 0.04 },
    pattern: patterns(
      // Dark moustache stripe below the eye.
      (p, n, part) =>
        part === "head" && p.y < 0.268 && Math.abs(p.x) > 0.02 && n.z > 0
          ? { color: "#2b211a", mix: 0.8 }
          : null,
      // Spotted back.
      (p, n, part) =>
        part === "body" &&
        n.y > 0.3 &&
        valueish({ x: p.x * 3, y: p.y * 3, z: p.z * 3 }) > 0.7
          ? { color: "#3a2a20", mix: 0.6 }
          : null,
      // Underparts catch an amber glow, like a bird lit from the ground.
      (p, n, part) =>
        part === "body" && n.y < -0.3 && p.z > -0.04
          ? { glow: "#f0a850", glowStrength: 0.18 }
          : null,
      // Dark wing tips, with a glowing amber bar across the coverts.
      (p, _n, part) => {
        if (part !== "wingL" && part !== "wingR") return null;
        const x = Math.abs(p.x);
        if (x > 0.26) return { color: "#2a211b", mix: 0.8 };
        if (x > 0.13 && x < 0.17) {
          return { glow: "#f0a850", glowStrength: 0.22 };
        }
        return null;
      },
    ),
  }),

  // --- Thicket ---------------------------------------------------------
  "thorn-porcupine": quadruped({
    coat: { back: "#5a4e44", belly: "#8c7f70", dark: "#1f1915" },
    gait: "waddle",
    legH: 0.045,
    bodyLen: 0.19,
    chest: [0.075, 0.08, 0.105],
    rump: [0.085, 0.088, 0.11],
    rumpLift: 0.01,
    legR: 0.016,
    foot: "paw",
    socks: 0.9,
    splay: 0.08,
    neck: { len: 0.03, pitch: 0.2, r: 0.06 },
    head: {
      r: [0.042, 0.042, 0.05],
      snoutLen: 0.03,
      snoutR: 0.026,
      snoutDrop: 0.02,
      eyeshine: "#e6f08a",
    },
    ears: { kind: "round", len: 0.016, w: 0.014 },
    tail: { kind: "thin", len: 0.07, r: 0.012, lift: -0.4 },
    extras: quillField({
      rows: 7,
      across: 7,
      len: 0.085,
      r: 0.008,
      color: "#2b231d",
      glow: "#dcee8a",
      glowStrength: 0.2,
    }),
    // A pale, blunt face under the dark quill coat.
    pattern: (_p, n, part) =>
      part === "head" && n.z > 0.35 && n.y < 0.5
        ? { color: "#a39683", mix: 0.45 }
        : null,
  }),
  "briar-weasel": quadruped({
    coat: { back: "#8a6240", belly: "#eadfc8", dark: "#2a1d14" },
    gait: "bound",
    legH: 0.035,
    bodyLen: 0.19,
    waist: 0.3,
    chest: [0.04, 0.044, 0.07],
    rump: [0.042, 0.044, 0.07],
    legR: 0.009,
    foot: "paw",
    socks: 0.35,
    neck: { len: 0.05, pitch: 0.5, r: 0.032 },
    head: {
      r: [0.03, 0.028, 0.04],
      snoutLen: 0.022,
      snoutR: 0.016,
      snoutDrop: 0.012,
      eyeshine: "#e0604f",
    },
    ears: { kind: "round", len: 0.014, w: 0.012 },
    tail: { kind: "thin", len: 0.09, r: 0.013, lift: -0.15, tip: "#1c140f" },
    pattern: patterns(
      // Pale chin and throat against the rusty coat.
      (_p, n, part) =>
        part === "head" && n.y < -0.1 ? { color: "#efe6d0", mix: 0.7 } : null,
      // A bib that glows the red of bramble berries.
      (p, n, part) =>
        part === "body" && n.y < -0.4 && p.z > 0.05
          ? { glow: "#e0604f", glowStrength: 0.2 }
          : null,
    ),
  }),

  // --- Ridge -----------------------------------------------------------
  "ledge-goat": quadruped({
    coat: { back: "#bdb5a5", belly: "#e6dfd0", dark: "#3a322b" },
    gait: "walk",
    legH: 0.2,
    bodyLen: 0.2,
    chest: [0.072, 0.08, 0.1],
    rump: [0.068, 0.078, 0.095],
    legR: 0.014,
    foot: "hoof",
    socks: 0.3,
    neck: { len: 0.07, pitch: 0.8, r: 0.042 },
    head: {
      r: [0.036, 0.046, 0.058],
      snoutLen: 0.05,
      snoutR: 0.024,
      snoutDrop: 0.028,
      eyeshine: "#e8cf7a",
    },
    ears: { kind: "pointed", len: 0.045, w: 0.02, tilt: 1.3 },
    tail: { kind: "short", len: 0.045, r: 0.02, lift: 0.7 },
    extras: combine(
      sweptHorns(0.2, "#a79e86", "#e8cf7a"),
      beard("#d8d0c0", "#e8cf7a"),
    ),
    pattern: (p, n, part) =>
      // A dark stripe down the spine and a shadowed face.
      part === "body" && n.y > 0.8 && Math.abs(p.x) < 0.015
        ? { color: "#5b5246", mix: 0.5 }
        : part === "head" && p.y > 0.0 && n.z > 0.5
          ? { color: "#6a6154", mix: 0.35 }
          : null,
  }),
  "mist-swift": bird({
    coat: { back: "#4a525c", belly: "#8d959c", dark: "#1c2024" },
    gait: "fly",
    body: [0.028, 0.027, 0.07],
    bodyY: 0.22,
    bodyPitch: 0.08,
    neck: { len: 0, r: 0.02, s: 0 },
    head: {
      r: [0.026, 0.024, 0.032],
      bill: { len: 0.008, r: 0.011, color: "#1a1d20" },
      eye: 0.008,
      eyeshine: "#bfe4ff",
    },
    legs: { len: 0.025, r: 0.004, color: "#3a3d40" },
    wings: { span: 0.36, chord: 0.055, color: "#3c444c" },
    tail: { len: 0.06, w: 0.03 },
    pattern: patterns(
      (_p, n, part) =>
        part === "head" && n.y < -0.3 ? { color: "#cfd6dc", mix: 0.7 } : null,
      // The outer wing trails a faint blue light, like a streak of fog.
      (p, _n, part) => {
        if (part !== "wingL" && part !== "wingR") return null;
        const x = Math.abs(p.x);
        return x > 0.2
          ? { glow: "#a8d8ff", glowStrength: Math.min(0.4, (x - 0.2) * 3) }
          : null;
      },
    ),
  }),

  // --- Moonlit Glade ---------------------------------------------------
  "opal-dormouse": quadruped({
    coat: { back: "#b58f62", belly: "#e8dcc4", dark: "#4a3828" },
    gait: "bound",
    legH: 0.02,
    bodyLen: 0.065,
    chest: [0.03, 0.032, 0.04],
    rump: [0.04, 0.04, 0.045],
    rumpLift: 0.008,
    legR: 0.007,
    foot: "paw",
    hindFold: 0.6,
    neck: { len: 0.018, pitch: 0.8, r: 0.026 },
    head: {
      r: [0.027, 0.027, 0.03],
      snoutLen: 0.012,
      snoutR: 0.013,
      snoutDrop: 0.006,
      eye: 0.0085,
      eyeshine: "#f2c8ff",
    },
    ears: { kind: "round", len: 0.02, w: 0.016 },
    tail: { kind: "bushy", len: 0.11, r: 0.02, lift: 0.1, tip: "#efe3c8" },
    // Opal sheen: a slow wash of pink, cyan and gold across back and tail.
    pattern: (p, n, part) => {
      if ((part !== "body" && part !== "tail") || n.y < 0.1) return null;
      const t = (Math.sin(p.z * 55 + p.x * 40) + 1) / 2;
      const glow = t > 0.66 ? "#9be8f0" : t > 0.33 ? "#f0b8e8" : "#ffe0a0";
      return { glow, glowStrength: 0.14 + 0.1 * valueish(p) };
    },
  }),
  "hush-owl": bird({
    coat: { back: "#8c7f6e", belly: "#d4c9b6", dark: "#2c251d" },
    gait: "fly",
    body: [0.055, 0.065, 0.06],
    bodyY: 0.2,
    bodyPitch: 0.85,
    neck: { len: 0.02, r: 0.05, s: 0 },
    head: {
      r: [0.056, 0.052, 0.05],
      bill: { len: 0.016, r: 0.01, color: "#3a342c", drop: 0.012 },
      eye: 0.015,
      eyeColor: "#e6c050",
      eyeshine: "#f4e08a",
      disc: "#bdb09a",
      discGlow: "#f2f0d0",
      tufts: 0.03,
    },
    legs: { len: 0.05, r: 0.01, color: "#cbbba0" },
    wings: { span: 0.3, chord: 0.13, color: "#76695a" },
    tail: { len: 0.06, w: 0.045 },
    pattern: patterns(
      // Vertical streaks down the breast.
      (p, n, part) =>
        part === "body" && n.z > 0.2 && Math.sin(p.x * 220) > 0.5
          ? { color: "#6e604e", mix: 0.5 }
          : null,
      // Moon-milk speckles on the wings.
      glowSpeckle(["wingL", "wingR"], "#f2f0d0", 0.22, 1.2, 0.45),
    ),
  }),

  // --- Glowfen ---------------------------------------------------------
  "lumen-frog": quadruped({
    coat: { back: "#4f6b4a", belly: "#cfd9b8", dark: "#1f2c1d" },
    gait: "hop",
    legH: 0.018,
    bodyLen: 0.075,
    chest: [0.045, 0.034, 0.045],
    rump: [0.052, 0.04, 0.05],
    legR: 0.009,
    foot: "paw",
    hindFold: 1,
    hindFoot: 0.05,
    neck: { len: 0.004, pitch: 0.5, r: 0.04 },
    head: {
      r: [0.05, 0.024, 0.04],
      snoutLen: 0.004,
      snoutR: 0.028,
      snoutDrop: 0.002,
      eye: 0.013,
      eyeshine: "#9ff5c8",
    },
    ears: { kind: "none", len: 0, w: 0 },
    tail: { kind: "short", len: 0.006, r: 0.005, lift: 0 },
    info: { breathRate: 2.4 },
    extras: eyeDomes("#9ff5c8"),
    pattern: patterns(
      // Lighter blotches on a dark green back.
      (p, n, part) =>
        n.y > 0.3 && part !== "head" && valueish(p) > 0.6
          ? { color: "#7aa05a", mix: 0.55 }
          : null,
      // The throat sac lights up like a lantern when it calls.
      (_p, n, part) =>
        part === "head" && n.y < -0.3 && n.z > 0.1
          ? { glow: "#7dffc8", glowStrength: 0.6 }
          : null,
      // Lumen spots: mint-cyan cells on back and legs.
      glowSpeckle(
        ["body", "legHL", "legHR", "legFL", "legFR"],
        "#6dffbe",
        0.6,
        1,
        0.45,
        -0.2,
      ),
    ),
  }),
  "reed-muskrat": quadruped({
    coat: { back: "#6b5640", belly: "#a8957a", dark: "#2a1f18" },
    gait: "waddle",
    legH: 0.03,
    bodyLen: 0.14,
    chest: [0.058, 0.058, 0.075],
    rump: [0.065, 0.062, 0.08],
    legR: 0.011,
    foot: "paw",
    socks: 0.5,
    neck: { len: 0.02, pitch: 0.3, r: 0.045 },
    head: {
      r: [0.04, 0.038, 0.046],
      snoutLen: 0.022,
      snoutR: 0.022,
      snoutDrop: 0.012,
      eyeshine: "#e4e88a",
    },
    ears: { kind: "round", len: 0.016, w: 0.014 },
    tail: { kind: "thin", len: 0.16, r: 0.012, lift: -0.05, tip: "#2a1f18" },
    pattern: patterns(
      // Paler muzzle and cheeks.
      (p, n, part) =>
        part === "head" && n.z > 0.45 && p.y < 0.1
          ? { color: "#b6a58a", mix: 0.5 }
          : null,
      // Water beads on wet fur catch a sedge-gold sheen.
      glowSpeckle(["body", "head"], "#dfe89a", 0.22, 1.1, 0.5, 0.3),
    ),
  }),

  // --- Elder Grove -----------------------------------------------------
  "elder-bear": quadruped({
    coat: { back: "#4c3f35", belly: "#6e5f52", dark: "#1d1713" },
    gait: "walk",
    legH: 0.13,
    bodyLen: 0.3,
    chest: [0.12, 0.135, 0.15],
    rump: [0.125, 0.125, 0.14],
    rumpLift: -0.012,
    legR: 0.03,
    foot: "paw",
    socks: 0.25,
    neck: { len: 0.055, pitch: 0.35, r: 0.09 },
    head: {
      r: [0.068, 0.064, 0.08],
      snoutLen: 0.07,
      snoutR: 0.042,
      snoutDrop: 0.02,
      eye: 0.01,
      eyeshine: "#f0c070",
    },
    ears: { kind: "round", len: 0.03, w: 0.03 },
    tail: { kind: "short", len: 0.035, r: 0.03, lift: -0.2 },
    extras: mossyHump("#b8e08a"),
    pattern: patterns(
      // Grizzled with age: pale hairs through the coat.
      (p, n, part) =>
        part === "body" && n.y > 0.2 && valueish(p) > 0.55
          ? { color: "#8a7b6a", mix: 0.35 }
          : null,
      // Tan muzzle.
      (_p, n, part) =>
        part === "head" && n.z > 0.5 ? { color: "#9a8468", mix: 0.5 } : null,
    ),
  }),
  "acorn-jay": bird({
    coat: { back: "#9a7a74", belly: "#d8c6bc", dark: "#1e1a1c" },
    gait: "fly",
    body: [0.05, 0.052, 0.09],
    bodyY: 0.2,
    bodyPitch: 0.5,
    neck: { len: 0.02, r: 0.032, s: 0 },
    head: {
      r: [0.04, 0.04, 0.05],
      bill: { len: 0.035, r: 0.014, color: "#2a2420" },
      eye: 0.012,
      eyeColor: "#1a1612",
      eyeshine: "#9ac8f0",
      crest: 0.04,
    },
    legs: { len: 0.06, r: 0.007, color: "#3a322c" },
    wings: { span: 0.3, chord: 0.1, color: "#3d5f95" },
    tail: { len: 0.12, w: 0.04 },
    pattern: patterns(
      // White rump.
      (p, n, part) =>
        part === "body" && p.z < -0.05 && n.y > 0.3
          ? { color: "#eee8e0", mix: 0.8 }
          : null,
      // The famous barred blue wing patch, glowing cobalt.
      (p, _n, part) => {
        if (part !== "wingL" && part !== "wingR") return null;
        const x = Math.abs(p.x);
        if (x < 0.08 || x > 0.2) return null;
        return Math.sin(p.x * 140) > 0.3
          ? { color: "#121820", mix: 0.8 }
          : { glow: "#5fa0ff", glowStrength: 0.3 };
      },
    ),
  }),

  // --- High Crags ------------------------------------------------------
  "rime-cat": quadruped({
    coat: { back: "#a9aeb4", belly: "#e2e5e8", dark: "#2c3036" },
    gait: "walk",
    legH: 0.14,
    bodyLen: 0.22,
    waist: 0.35,
    chest: [0.075, 0.085, 0.105],
    rump: [0.08, 0.085, 0.1],
    legR: 0.026,
    foot: "paw",
    neck: { len: 0.05, pitch: 0.45, r: 0.058 },
    head: {
      r: [0.052, 0.048, 0.05],
      snoutLen: 0.022,
      snoutR: 0.028,
      snoutDrop: 0.012,
      eyeshine: "#bfe8ff",
    },
    ears: { kind: "round", len: 0.028, w: 0.022 },
    tail: { kind: "bushy", len: 0.3, r: 0.04, lift: -0.7 },
    pattern: patterns(
      // Dark rosettes on a pale coat.
      (p, _n, part) => {
        if (part === "head") return null;
        const a = Math.sin(p.x * 95 + p.y * 30) * Math.sin(p.z * 85 + p.y * 20);
        return a > 0.72 ? { color: "#343a40", mix: 0.6 } : null;
      },
      // Frost crystals in the fur sparkle faintly.
      glowSpeckle(["body", "tail", "head"], "#cfeaff", 0.35, 1.3, 0.5, 0.3),
    ),
  }),
  "gale-chough": bird({
    coat: { back: "#2f3036", belly: "#45464e", dark: "#141417" },
    gait: "fly",
    body: [0.045, 0.048, 0.085],
    bodyY: 0.2,
    bodyPitch: 0.35,
    neck: { len: 0.02, r: 0.03, s: 0 },
    head: {
      r: [0.035, 0.034, 0.045],
      bill: { len: 0.04, r: 0.012, color: "#c8452f", drop: 0.01 },
      eye: 0.011,
      eyeColor: "#1a1410",
      eyeshine: "#ffb08a",
    },
    legs: { len: 0.055, r: 0.007, color: "#c8452f" },
    wings: { span: 0.34, chord: 0.11, color: "#25262d" },
    tail: { len: 0.1, w: 0.04 },
    // Glossy black feathers shot with a violet sheen, strongest on the wings.
    pattern: (p, n, part) => {
      if (part === "wingL" || part === "wingR") {
        const x = Math.abs(p.x);
        return x > 0.1
          ? {
              glow: "#8aa0ff",
              glowStrength:
                0.12 + 0.1 * valueish({ x: p.x * 4, y: 0, z: p.z * 4 }),
            }
          : null;
      }
      return part === "body" && n.y > 0.4
        ? { glow: "#8aa0ff", glowStrength: 0.08 }
        : null;
    },
  }),
} satisfies Partial<Record<SpeciesSlug, Anatomy>>;
