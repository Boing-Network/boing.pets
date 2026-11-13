/** Deterministic meadow instance placement, shared by the scene and tests. */

import { meadowHeight } from "./meadowHeight";
import { isDecorClear } from "./meadowFootprints";
import {
  MEADOW_APRON_TREE_SPOTS,
  MEADOW_BUSH_SPOTS,
  MEADOW_EXTRA_BUSH_SPOTS,
  MEADOW_FLOWER_PATCHES,
  MEADOW_ROCK_SPOTS,
  MEADOW_TALL_GRASS_PATCHES,
  MEADOW_TREE_SPOTS,
  PASTURE_GROUND_RADIUS,
  type MeadowPoint,
} from "./meadowLayout";

export type DecorKind =
  "grass" | "tall-grass" | "flower" | "rock" | "tree" | "bush";

export type DecorInstance = {
  kind: DecorKind;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotY: number;
  color?: string;
};

export function mulberry(seed: number) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const FLOWER_COLORS = ["#ef9bb8", "#f2d38a", "#c9a0e8", "#f4a27a", "#f7f0c8"];
const ROCK_COLORS = ["#8b8578", "#6f6a62", "#9a9488"];

function scatterDisk(
  kind: DecorKind,
  count: number,
  seedBase: number,
  scaleRange: [number, number],
  yLift: number,
  colors?: readonly string[],
): DecorInstance[] {
  const out: DecorInstance[] = [];
  let i = 0;
  while (out.length < count && i < count * 16) {
    const u = mulberry(seedBase + i * 3);
    const v = mulberry(seedBase + i * 3 + 1);
    const r = Math.sqrt(u) * (PASTURE_GROUND_RADIUS - 4);
    const a = v * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    i += 1;
    if (!isDecorClear(x, z)) continue;
    const scale =
      scaleRange[0] + mulberry(i * 5) * (scaleRange[1] - scaleRange[0]);
    out.push({
      kind,
      x,
      y: meadowHeight(x, z) + yLift,
      z,
      scale,
      rotY: mulberry(seedBase + i) * Math.PI * 2,
      color: colors ? colors[out.length % colors.length] : undefined,
    });
  }
  return out;
}

function scatterPatches(
  kind: DecorKind,
  patches: readonly MeadowPoint[],
  count: number,
  seedBase: number,
  radius: number,
  scaleRange: [number, number],
  yLift: number,
  colors?: readonly string[],
): DecorInstance[] {
  const out: DecorInstance[] = [];
  if (!patches.length) return out;
  let i = 0;
  while (out.length < count && i < count * 16) {
    const patch = patches[i % patches.length]!;
    const ang = mulberry(seedBase + i * 19 + 3) * Math.PI * 2;
    const rad = Math.sqrt(mulberry(seedBase + i * 23 + 5)) * radius;
    const x = patch[0] + Math.cos(ang) * rad;
    const z = patch[1] + Math.sin(ang) * rad;
    i += 1;
    if (!isDecorClear(x, z)) continue;
    const scale =
      scaleRange[0] + mulberry(i * 7) * (scaleRange[1] - scaleRange[0]);
    out.push({
      kind,
      x,
      y: meadowHeight(x, z) + yLift,
      z,
      scale,
      rotY: mulberry(i * 3) * Math.PI * 2,
      color: colors ? colors[out.length % colors.length] : undefined,
    });
  }
  return out;
}

function fromSpots(
  kind: DecorKind,
  spots: readonly MeadowPoint[],
  yLift: number,
  scaleFor: (i: number) => number,
): DecorInstance[] {
  return spots
    .map(([x, z], i) => ({
      kind,
      x,
      y: meadowHeight(x, z) + yLift,
      z,
      scale: scaleFor(i),
      rotY: i * 0.7,
    }))
    .filter(
      (row) => isDecorClear(row.x, row.z) || kind === "tree" || kind === "bush",
    );
}

export function scatteredGrass(preferPerf: boolean): DecorInstance[] {
  return scatterDisk("grass", preferPerf ? 360 : 980, 11, [0.7, 1.8], 0);
}

export function scatteredFlowers(preferPerf: boolean): DecorInstance[] {
  return scatterDisk(
    "flower",
    preferPerf ? 90 : 200,
    29,
    [0.8, 1.4],
    0.05,
    FLOWER_COLORS,
  );
}

export function scatteredRocks(preferPerf: boolean): DecorInstance[] {
  return scatterDisk(
    "rock",
    preferPerf ? 20 : 48,
    47,
    [0.6, 1.5],
    0,
    ROCK_COLORS,
  );
}

export function patchFlowers(preferPerf: boolean): DecorInstance[] {
  return scatterPatches(
    "flower",
    MEADOW_FLOWER_PATCHES,
    preferPerf ? 160 : 420,
    0,
    3.2,
    [0.7, 1.5],
    0.05,
    FLOWER_COLORS,
  );
}

export function patchTallGrass(preferPerf: boolean): DecorInstance[] {
  return scatterPatches(
    "tall-grass",
    MEADOW_TALL_GRASS_PATCHES,
    preferPerf ? 220 : 640,
    11,
    3.8,
    [0.9, 2.3],
    0,
  );
}

export function placedRocks(): DecorInstance[] {
  return MEADOW_ROCK_SPOTS.map(([x, z], i) => ({
    kind: "rock" as const,
    x,
    y: meadowHeight(x, z) + 0.05,
    z,
    scale: 0.8 + (i % 4) * 0.25,
    rotY: i * 0.7,
  })).filter((row) => isDecorClear(row.x, row.z));
}

export function placedTrees(): DecorInstance[] {
  return fromSpots(
    "tree",
    [...MEADOW_TREE_SPOTS, ...MEADOW_APRON_TREE_SPOTS],
    0,
    () => 1,
  );
}

export function placedBushes(): DecorInstance[] {
  return fromSpots(
    "bush",
    [...MEADOW_BUSH_SPOTS, ...MEADOW_EXTRA_BUSH_SPOTS],
    0,
    (i) => 0.75 + (i % 3) * 0.15,
  );
}

/** Every grass tuft, flower, rock, tree, and bush used in the full-quality meadow. */
export function collectMeadowDecor(preferPerf = false): DecorInstance[] {
  return [
    ...scatteredGrass(preferPerf),
    ...scatteredFlowers(preferPerf),
    ...scatteredRocks(preferPerf),
    ...patchFlowers(preferPerf),
    ...patchTallGrass(preferPerf),
    ...placedRocks(),
    ...placedTrees(),
    ...placedBushes(),
  ];
}
