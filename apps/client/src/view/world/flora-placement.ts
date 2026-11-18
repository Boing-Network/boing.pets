/**
 * Where every plant, rock and light-mote stands. Pure and deterministic: the
 * same world model always grows the same landscape, so nothing here is saved.
 */
import { fbm, hash01, smoothstep } from "./noise";
import { WaterCell, type WorldModel } from "./world-model";

export const FLORA_KINDS = [
  "broadleaf",
  "pine",
  "lanternTree",
  "deadTree",
  "bush",
  "rock",
  "stone",
  "grass",
  "flower",
  "mushroom",
  "crystal",
  "reed",
  "lily",
] as const;
export type FloraKind = (typeof FLORA_KINDS)[number];

/** Per instance: x, y, z, yaw, scale, r, g, b (linear). */
export const FLORA_STRIDE = 8;
/** Per glow point: x, y, z, size, r, g, b (linear). */
export const GLOW_STRIDE = 7;
/** Per firefly: x, y, z, phase, r, g, b (linear). */
export const FIREFLY_STRIDE = 7;

/** Small plants are grouped in tiles so distant tiles can be skipped. */
export const FLORA_TILE = 48;

export type FloraTile = {
  centerX: number;
  centerZ: number;
  start: number;
  count: number;
};

export type FloraBatch = {
  kind: FloraKind;
  count: number;
  data: Float32Array;
  /** Present for small plants only; instances are sorted tile by tile. */
  tiles: FloraTile[] | null;
};

export type FloraLayout = {
  batches: Record<FloraKind, FloraBatch>;
  glow: Float32Array;
  glowCount: number;
  fireflies: Float32Array;
  fireflyCount: number;
};

const TILED: ReadonlySet<FloraKind> = new Set<FloraKind>([
  "grass",
  "flower",
  "mushroom",
  "reed",
  "lily",
  "bush",
]);

type Rgb = readonly [number, number, number];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToLinear(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ];
}

const palette = (...hex: string[]) => hex.map(hexToLinear);

const TINT = {
  meadowLeaf: palette("#4a9a4e", "#5aa850", "#3f8a52"),
  emberLeaf: palette("#e2792e", "#f0a03c", "#d9622a"),
  thicketLeaf: palette("#1f6a55", "#23745a", "#1a5c50"),
  wildLeaf: palette("#2f7a4e", "#377f46", "#2a6c52"),
  pine: palette("#1f5a48", "#235f4e", "#1b5246"),
  ridgePine: palette("#2c5c62", "#33636a"),
  lantern: palette("#1b5a50", "#1f6258"),
  dead: palette("#5a5648", "#4c4a42"),
  rock: palette("#6b6f80", "#5c6072", "#7a7c8a"),
  mossRock: palette("#4c5e52", "#56645a"),
  ridgeRock: palette("#6f7190", "#80829c", "#5f6180"),
  meadowGrass: palette("#62b05c", "#74ba5e", "#539f5a"),
  emberGrass: palette("#d9843a", "#e59a48"),
  thicketGrass: palette("#2f8068", "#35886a"),
  ridgeGrass: palette("#70848e", "#7c9096"),
  wildGrass: palette("#3f8e5c", "#4a965a"),
  meadowFlower: palette("#ffb14a", "#ff7a3c", "#ffd9a0", "#ff8fb0", "#fff1d6"),
  thicketFlower: palette("#5ff0d0", "#8fe8ff"),
  ridgeFlower: palette("#a8c8ff", "#d6c4ff"),
  mushroom: palette("#59f2d0", "#7ab8ff", "#c79bff"),
  crystal: palette("#8fd0ff", "#6ff0e0", "#b8a8ff"),
  reed: palette("#ffffff", "#d8f4ea"),
  lily: palette("#ffffff", "#ffd6ea", "#d6f4ff"),
  reedGlow: hexToLinear("#5ef2d6"),
  lanternGlow: hexToLinear("#ffd27a"),
  firefly: palette("#e8ff9a", "#ffe9a0", "#9affd8"),
};

type Builder = { values: number[]; tileOf: number[] };

export function layoutFlora(model: WorldModel): FloraLayout {
  const { seed, bounds, regions } = model;
  const builders = Object.fromEntries(
    FLORA_KINDS.map((kind) => [kind, { values: [], tileOf: [] } as Builder]),
  ) as Record<FloraKind, Builder>;
  const glow: number[] = [];
  const fireflies: number[] = [];

  const tilesX = Math.ceil((bounds.maxX - bounds.minX) / FLORA_TILE);
  const tileIndex = (x: number, z: number) =>
    Math.floor((z - bounds.minZ) / FLORA_TILE) * tilesX +
    Math.floor((x - bounds.minX) / FLORA_TILE);

  function add(
    kind: FloraKind,
    x: number,
    y: number,
    z: number,
    yaw: number,
    scale: number,
    tint: Rgb,
    shade = 1,
  ): void {
    const b = builders[kind];
    b.values.push(
      x,
      y,
      z,
      yaw,
      scale,
      tint[0] * shade,
      tint[1] * shade,
      tint[2] * shade,
    );
    b.tileOf.push(tileIndex(x, z));
  }

  function halo(x: number, y: number, z: number, size: number, c: Rgb): void {
    glow.push(x, y, z, size, c[0], c[1], c[2]);
  }

  const weights = new Float32Array(Math.max(1, regions.length));
  const site = {
    meadow: 0,
    thicket: 0,
    ridge: 0,
    wild: 0,
    heart: Infinity,
    glowTint: TINT.crystal[0]!,
  };

  function readSite(x: number, z: number): void {
    site.wild = model.regionWeights(x, z, weights);
    site.meadow = 0;
    site.thicket = 0;
    site.ridge = 0;
    site.heart = Infinity;
    for (let i = 0; i < regions.length; i += 1) {
      const r = regions[i]!;
      const w = weights[i]!;
      if (r.biome.id === "meadow") site.meadow += w;
      else if (r.biome.id === "thicket") site.thicket += w;
      else site.ridge += w;
      site.heart = Math.min(
        site.heart,
        Math.hypot(x - r.center.x, z - r.center.z),
      );
    }
  }

  /** Visits one jittered point per grid square of the given spacing. */
  function scatter(
    spacing: number,
    salt: number,
    visit: (x: number, z: number, roll: (k: number) => number) => void,
  ): void {
    const cols = Math.ceil((bounds.maxX - bounds.minX) / spacing);
    const rows = Math.ceil((bounds.maxZ - bounds.minZ) / spacing);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const roll = (k: number) => hash01(seed + salt * 7919 + k, col, row);
        visit(
          bounds.minX + (col + roll(1)) * spacing,
          bounds.minZ + (row + roll(2)) * spacing,
          roll,
        );
      }
    }
  }

  const pick = <T>(list: readonly T[], r: number): T =>
    list[Math.min(list.length - 1, Math.floor(r * list.length))]!;

  // Trees.
  scatter(3.4, 1, (x, z, roll) => {
    const h = model.heightAt(x, z);
    if (h < 0.9 || h > 25) return;
    const wd = model.waterDistAt(x, z);
    const cell = model.cellAt(x, z);
    const kind = model.waterKind[cell]!;
    const inSwamp = kind === WaterCell.SWAMP && wd < 9;
    if (wd < (inSwamp ? -2.6 : 1.8)) return;
    if (model.trailDistAt(x, z) < 2.6) return;
    if (model.slopeAt(x, z) > 0.8) return;
    readSite(x, z);
    if (site.heart < 8.5) return;
    const forest = fbm(seed + 611, x / 36, z / 36, 3) * 0.5 + 0.5;
    const grove = smoothstep(0.42, 0.62, forest);
    let density =
      site.meadow * (0.03 + 0.2 * smoothstep(0.55, 0.75, forest)) +
      site.thicket * 0.66 +
      site.ridge * 0.14 +
      site.wild * (0.1 + 0.62 * grove);
    if (site.heart < 15) density *= 0.4;
    if (inSwamp) density = wd < 0.5 ? 0.3 : 0.5;
    if (roll(3) > density) return;

    const yaw = roll(4) * Math.PI * 2;
    const shade = 0.82 + roll(5) * 0.36;
    const size = 0.78 + roll(6) * 0.6;
    const y = h - 0.08;
    const biomeRoll = roll(7);
    const choice = roll(8);
    if (inSwamp && (wd < 0.5 || choice < 0.6)) {
      add("deadTree", x, y, z, yaw, size, pick(TINT.dead, roll(9)), shade);
      return;
    }
    if (biomeRoll < site.meadow) {
      const ember = choice < 0.24;
      add(
        "broadleaf",
        x,
        y,
        z,
        yaw,
        size * 1.05,
        pick(ember ? TINT.emberLeaf : TINT.meadowLeaf, roll(9)),
        shade,
      );
    } else if (biomeRoll < site.meadow + site.thicket) {
      if (choice < 0.52) {
        add(
          "lanternTree",
          x,
          y,
          z,
          yaw,
          size,
          pick(TINT.lantern, roll(9)),
          shade,
        );
        halo(x, y + 6.2 * size, z, 2.4 * size, TINT.lanternGlow);
      } else if (choice < 0.72) {
        add("pine", x, y, z, yaw, size, pick(TINT.pine, roll(9)), shade);
      } else {
        add(
          "broadleaf",
          x,
          y,
          z,
          yaw,
          size,
          pick(TINT.thicketLeaf, roll(9)),
          shade,
        );
      }
    } else if (biomeRoll < site.meadow + site.thicket + site.ridge) {
      add(
        "pine",
        x,
        y,
        z,
        yaw,
        size * 0.92,
        pick(TINT.ridgePine, roll(9)),
        shade,
      );
    } else if (h > 9 ? choice < 0.85 : choice < 0.38) {
      add("pine", x, y, z, yaw, size, pick(TINT.pine, roll(9)), shade);
    } else {
      const ember = choice > 0.95;
      add(
        "broadleaf",
        x,
        y,
        z,
        yaw,
        size,
        pick(ember ? TINT.emberLeaf : TINT.wildLeaf, roll(9)),
        shade,
      );
    }
  });

  // Shrubs.
  scatter(2.7, 2, (x, z, roll) => {
    const h = model.heightAt(x, z);
    if (h < 0.8 || h > 24) return;
    if (model.waterDistAt(x, z) < 1.2) return;
    if (model.trailDistAt(x, z) < 1.8) return;
    if (model.slopeAt(x, z) > 0.9) return;
    readSite(x, z);
    if (site.heart < 7.5) return;
    const density =
      site.meadow * 0.1 +
      site.thicket * 0.34 +
      site.ridge * 0.07 +
      site.wild * 0.24;
    if (roll(3) > density) return;
    const biomeRoll = roll(7);
    const tint =
      biomeRoll < site.meadow
        ? roll(8) < 0.3
          ? TINT.emberLeaf
          : TINT.meadowLeaf
        : biomeRoll < site.meadow + site.thicket
          ? TINT.thicketLeaf
          : biomeRoll < site.meadow + site.thicket + site.ridge
            ? TINT.ridgePine
            : TINT.wildLeaf;
    add(
      "bush",
      x,
      h - 0.05,
      z,
      roll(4) * Math.PI * 2,
      0.7 + roll(6) * 0.8,
      pick(tint, roll(9)),
      0.8 + roll(5) * 0.4,
    );
  });

  // Rocks: ridges, steep ground, river banks and the coast.
  scatter(3.1, 3, (x, z, roll) => {
    const h = model.heightAt(x, z);
    if (h < -0.4) return;
    const wd = model.waterDistAt(x, z);
    const cell = model.cellAt(x, z);
    const kind = model.waterKind[cell]!;
    if (wd < -0.6) return;
    if (model.trailDistAt(x, z) < 1.6) return;
    readSite(x, z);
    if (site.heart < 7.5) return;
    const slope = model.slopeAt(x, z);
    let density =
      site.meadow * 0.015 +
      site.thicket * 0.04 +
      site.ridge * 0.3 +
      site.wild * 0.05;
    density += smoothstep(0.45, 1.0, slope) * 0.35;
    if (kind === WaterCell.RIVER && wd < 2.4) density += 0.3;
    if (kind === WaterCell.TARN && wd < 3) density += 0.3;
    if (kind === WaterCell.NONE && h < 1.1) density += 0.07;
    if (h > 22) density += 0.1;
    if (roll(3) > density) return;
    const big = roll(6);
    const scale = (0.35 + big * big * 1.9) * (1 + site.ridge * 0.5);
    const tint =
      site.ridge > 0.4 || h > 16
        ? TINT.ridgeRock
        : site.thicket > 0.4
          ? TINT.mossRock
          : TINT.rock;
    add(
      "rock",
      x,
      h - 0.12 * scale,
      z,
      roll(4) * Math.PI * 2,
      scale,
      pick(tint, roll(9)),
      0.8 + roll(5) * 0.4,
    );
  });

  // Grass.
  scatter(0.95, 4, (x, z, roll) => {
    const h = model.heightAt(x, z);
    if (h < 0.7 || h > 21) return;
    if (model.waterDistAt(x, z) < 0.35) return;
    if (model.trailDistAt(x, z) < 1.2) return;
    if (model.slopeAt(x, z) > 0.7) return;
    readSite(x, z);
    const density =
      site.meadow * 0.8 +
      site.thicket * 0.3 +
      site.ridge * 0.14 +
      site.wild * 0.36;
    if (roll(3) > density) return;
    const biomeRoll = roll(7);
    let tint = TINT.wildGrass;
    if (biomeRoll < site.meadow) {
      const ember = fbm(seed + 733, x / 11, z / 11, 2) > 0.28;
      tint = ember ? TINT.emberGrass : TINT.meadowGrass;
    } else if (biomeRoll < site.meadow + site.thicket) {
      tint = TINT.thicketGrass;
    } else if (biomeRoll < site.meadow + site.thicket + site.ridge) {
      tint = TINT.ridgeGrass;
    }
    add(
      "grass",
      x,
      h - 0.03,
      z,
      roll(4) * Math.PI * 2,
      0.7 + roll(6) * 0.9,
      pick(tint, roll(9)),
      0.75 + roll(5) * 0.5,
    );
  });

  // Flowers, in drifts.
  scatter(1.6, 5, (x, z, roll) => {
    const h = model.heightAt(x, z);
    if (h < 0.8 || h > 20) return;
    if (model.waterDistAt(x, z) < 0.5) return;
    if (model.trailDistAt(x, z) < 1.0) return;
    if (model.slopeAt(x, z) > 0.6) return;
    readSite(x, z);
    const drift = smoothstep(0.05, 0.4, fbm(seed + 811, x / 9, z / 9, 2));
    const density =
      (site.meadow * 0.5 +
        site.thicket * 0.12 +
        site.ridge * 0.1 +
        site.wild * 0.1) *
      (0.12 + drift);
    if (roll(3) > density) return;
    const biomeRoll = roll(7);
    const tints =
      biomeRoll < site.meadow
        ? TINT.meadowFlower
        : biomeRoll < site.meadow + site.thicket
          ? TINT.thicketFlower
          : biomeRoll < site.meadow + site.thicket + site.ridge
            ? TINT.ridgeFlower
            : roll(8) < 0.5
              ? TINT.meadowFlower
              : TINT.thicketFlower;
    const tint = pick(tints, roll(9));
    const scale = 0.7 + roll(6) * 0.7;
    add("flower", x, h - 0.02, z, roll(4) * Math.PI * 2, scale, tint);
    if (roll(10) < 0.35) halo(x, h + 0.42 * scale, z, 0.55 * scale, tint);
  });

  // Glowing mushrooms under the trees and around the bog.
  scatter(2.1, 6, (x, z, roll) => {
    const h = model.heightAt(x, z);
    if (h < 0.8 || h > 18) return;
    const wd = model.waterDistAt(x, z);
    if (wd < 0.4) return;
    if (model.trailDistAt(x, z) < 1.0) return;
    const cell = model.cellAt(x, z);
    readSite(x, z);
    let density = site.thicket * 0.16 + site.wild * 0.03 + site.meadow * 0.01;
    if (model.waterKind[cell] === WaterCell.SWAMP && wd < 7) density += 0.22;
    if (roll(3) > density) return;
    const tint = pick(TINT.mushroom, roll(9));
    const scale = 0.6 + roll(6) * 1.1;
    add("mushroom", x, h - 0.02, z, roll(4) * Math.PI * 2, scale, tint);
    halo(x, h + 0.36 * scale, z, 0.85 * scale, tint);
  });

  // Crystals on the high ground.
  scatter(3.6, 7, (x, z, roll) => {
    const h = model.heightAt(x, z);
    if (h < 1) return;
    const wd = model.waterDistAt(x, z);
    if (wd < 0.6) return;
    if (model.trailDistAt(x, z) < 1.4) return;
    const cell = model.cellAt(x, z);
    readSite(x, z);
    if (site.heart < 7.5) return;
    let density = site.ridge * 0.12 + smoothstep(14, 26, h) * 0.1;
    if (model.waterKind[cell] === WaterCell.TARN && wd < 5) density += 0.25;
    if (roll(3) > density) return;
    const tint = pick(TINT.crystal, roll(9));
    const scale = 0.6 + roll(6) * 1.2;
    add("crystal", x, h - 0.1, z, roll(4) * Math.PI * 2, scale, tint);
    halo(x, h + 0.7 * scale, z, 1.4 * scale, tint);
  });

  // Reeds crowd the calm margins; the bog is thick with them.
  scatter(0.95, 8, (x, z, roll) => {
    const wd = model.waterDistAt(x, z);
    if (wd > 1.4 || wd < -3.2) return;
    const cell = model.cellAt(x, z);
    const kind = model.waterKind[cell]!;
    if (kind === WaterCell.NONE) return;
    const h = model.heightAt(x, z);
    const level = model.waterLevel[cell]!;
    const depth = level - h;
    if (depth > 0.5) return;
    let density = 0;
    if (kind === WaterCell.SWAMP) {
      density = wd > -2.6 ? 0.5 : 0.15;
    } else if (kind === WaterCell.POND) {
      density = wd > -1.3 && wd < 0.8 ? 0.36 : 0;
    } else if (kind === WaterCell.TARN) {
      density = wd > -0.8 && wd < 0.6 ? 0.1 : 0;
    } else if (model.flow[cell * 4 + 3]! < 0.25) {
      density = wd > -0.9 && wd < 0.7 ? 0.2 : 0;
    }
    // Reed beds come in clumps with gaps where the bank is open.
    density *= smoothstep(-0.25, 0.2, fbm(seed + 907, x / 7, z / 7, 2));
    if (roll(3) > density) return;
    const scale = 0.7 + roll(6) * 0.8;
    const y = Math.min(h, level) - 0.05;
    add(
      "reed",
      x,
      y,
      z,
      roll(4) * Math.PI * 2,
      scale,
      pick(TINT.reed, roll(9)),
      0.8 + roll(5) * 0.4,
    );
    if (roll(10) < 0.18) halo(x, y + 1.75 * scale, z, 0.7, TINT.reedGlow);
  });

  // Lily pads on still water.
  scatter(1.25, 9, (x, z, roll) => {
    const wd = model.waterDistAt(x, z);
    if (wd > -0.9) return;
    const cell = model.cellAt(x, z);
    const kind = model.waterKind[cell]!;
    if (kind !== WaterCell.POND && kind !== WaterCell.SWAMP) return;
    const level = model.waterLevel[cell]!;
    if (level - model.heightAt(x, z) < 0.12) return;
    const raft = smoothstep(0.0, 0.3, fbm(seed + 953, x / 6, z / 6, 2));
    const density = (kind === WaterCell.SWAMP ? 0.34 : 0.3) * raft;
    if (roll(3) > density) return;
    const tint = pick(TINT.lily, roll(9));
    const scale = 0.6 + roll(6) * 0.8;
    add("lily", x, level + 0.025, z, roll(4) * Math.PI * 2, scale, tint);
    if (roll(10) < 0.3) halo(x, level + 0.2, z, 0.9, tint);
  });

  // Each region's heart: a ring of standing stones around a lit crystal.
  for (const region of regions) {
    const tint = hexToLinear(region.biome.glow);
    const { x: cx, z: cz } = region.center;
    const stones = 7;
    for (let i = 0; i < stones; i += 1) {
      const angle =
        (i / stones) * Math.PI * 2 + hash01(seed, region.territoryId, 5);
      const x = cx + Math.cos(angle) * 5.2;
      const z = cz + Math.sin(angle) * 5.2;
      add(
        "stone",
        x,
        model.heightAt(x, z) - 0.2,
        z,
        -angle,
        0.85 + hash01(seed, region.territoryId, 50 + i) * 0.5,
        pick(TINT.rock, hash01(seed, region.territoryId, 70 + i)),
      );
    }
    const h = model.heightAt(cx, cz);
    add("crystal", cx, h - 0.1, cz, 0, 2.1, tint);
    halo(cx, h + 1.6, cz, 3.2, tint);
  }

  // Stepping stones wherever a trail meets running water.
  for (const ford of model.fords) {
    for (let k = -4; k <= 4; k += 1) {
      const x = ford.x + ford.dir.x * k * 1.25;
      const z = ford.z + ford.dir.z * k * 1.25;
      if (model.waterDistAt(x, z) > 0.6) continue;
      add(
        "rock",
        x,
        ford.level - 0.32,
        z,
        hash01(seed, k, 31) * 6,
        0.62,
        pick(TINT.rock, hash01(seed, k, 37)),
      );
    }
  }

  // Fireflies gather over grass, under trees and thickest over the bog.
  scatter(4.6, 10, (x, z, roll) => {
    const h = model.heightAt(x, z);
    if (h < 0.5 || h > 18) return;
    const cell = model.cellAt(x, z);
    const wd = model.waterDistAt(x, z);
    readSite(x, z);
    let density = site.meadow * 0.3 + site.thicket * 0.42 + site.wild * 0.1;
    const nearBog = model.waterKind[cell] === WaterCell.SWAMP && wd < 8;
    if (nearBog) density = 0.85;
    else if (wd < 3) density += 0.25;
    if (roll(3) > density) return;
    const level = model.waterLevel[cell]!;
    const floor = wd < 0 ? Math.max(h, level) : h;
    const tint = nearBog ? TINT.firefly[2]! : pick(TINT.firefly, roll(9));
    fireflies.push(
      x,
      floor + 0.5 + roll(6) * 2.6,
      z,
      roll(4) * 100,
      tint[0],
      tint[1],
      tint[2],
    );
  });

  const batches = Object.fromEntries(
    FLORA_KINDS.map((kind) => {
      const b = builders[kind];
      const count = b.tileOf.length;
      if (!TILED.has(kind)) {
        return [
          kind,
          { kind, count, data: new Float32Array(b.values), tiles: null },
        ];
      }
      const order = Array.from({ length: count }, (_, i) => i).sort(
        (i, j) => b.tileOf[i]! - b.tileOf[j]! || i - j,
      );
      const data = new Float32Array(count * FLORA_STRIDE);
      const tiles: FloraTile[] = [];
      order.forEach((from, to) => {
        for (let k = 0; k < FLORA_STRIDE; k += 1) {
          data[to * FLORA_STRIDE + k] = b.values[from * FLORA_STRIDE + k]!;
        }
        const tile = b.tileOf[from]!;
        const last = tiles[tiles.length - 1];
        const tx = tile % tilesX;
        const tz = (tile - tx) / tilesX;
        const centerX = bounds.minX + (tx + 0.5) * FLORA_TILE;
        const centerZ = bounds.minZ + (tz + 0.5) * FLORA_TILE;
        if (last && last.centerX === centerX && last.centerZ === centerZ) {
          last.count += 1;
        } else {
          tiles.push({ centerX, centerZ, start: to, count: 1 });
        }
      });
      return [kind, { kind, count, data, tiles }];
    }),
  ) as Record<FloraKind, FloraBatch>;

  return {
    batches,
    glow: new Float32Array(glow),
    glowCount: glow.length / GLOW_STRIDE,
    fireflies: new Float32Array(fireflies),
    fireflyCount: fireflies.length / FIREFLY_STRIDE,
  };
}
