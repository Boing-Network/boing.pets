/** Distance-field path wear used to drape dirt trails over the meadow. */

import { PASTURE_ZONE } from "../world/config/zones";
import { meadowHeight } from "./meadowHeight";
import { pointToSegment } from "./meadowLayout";
import { inPondFootprint } from "./meadowFootprints";

export const MAIN_PATH_HALF = 1.1;
export const SIDE_PATH_HALF = 0.775;
export const PATH_FEATHER = 0.9;
export const PATH_LIFT = 0.03;

export function pathHalfWidth(index: number): number {
  return index < 2 ? MAIN_PATH_HALF : SIDE_PATH_HALF;
}

/**
 * 0 = plain grass, 1 = packed dirt at the trail center.
 * Junctions take the max so crossing trails join without a seam.
 */
export function pasturePathWear(x: number, z: number): number {
  // Dirt trails stop at the pond rim so they do not float through the water.
  if (inPondFootprint(x, z, 0.2)) return 0;
  let wear = 0;
  for (const [i, path] of PASTURE_ZONE.paths.entries()) {
    const a = path[0];
    const b = path[1];
    if (!a || !b) continue;
    const half = pathHalfWidth(i);
    const dist = pointToSegment(x, z, a.x, a.z, b.x, b.z);
    const inner = half * 0.45;
    const outer = half + PATH_FEATHER;
    if (dist >= outer) continue;
    let w = 1;
    if (dist > inner) w = 1 - (dist - inner) / (outer - inner);
    w = w * w * (3 - 2 * w);
    if (w > wear) wear = w;
  }
  return wear;
}

export type PathMeshData = {
  positions: Float32Array;
  colors: Float32Array;
  weaves: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
};

const DIRT = { r: 0.42, g: 0.3, b: 0.18 };
const WORN = { r: 0.4, g: 0.46, b: 0.26 };

/** Grid draped on meadowHeight; empty grass cells are omitted. */
export function buildPasturePathMeshData(
  segs = 128,
  extent = 40,
): PathMeshData {
  const positions: number[] = [];
  const colors: number[] = [];
  const weaves: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const lookup: Int32Array = new Int32Array((segs + 1) * (segs + 1));
  lookup.fill(-1);

  const col = segs + 1;
  const wearAt: Float32Array = new Float32Array(col * col);
  for (let j = 0; j <= segs; j++) {
    for (let i = 0; i <= segs; i++) {
      const x = -extent + (i / segs) * extent * 2;
      const z = -extent + (j / segs) * extent * 2;
      wearAt[j * col + i] = pasturePathWear(x, z);
    }
  }
  const keep = new Uint8Array(col * col);
  for (let j = 0; j <= segs; j++) {
    for (let i = 0; i <= segs; i++) {
      if (wearAt[j * col + i]! > 0.02) {
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii > segs || jj > segs) continue;
            keep[jj * col + ii] = 1;
          }
        }
      }
    }
  }

  // Neighbor inflation would otherwise keep a fringe of verts inside the
  // pond and drape that mesh over the water (both surfaces are transparent).
  for (let j = 0; j <= segs; j++) {
    for (let i = 0; i <= segs; i++) {
      if (!keep[j * col + i]) continue;
      const x = -extent + (i / segs) * extent * 2;
      const z = -extent + (j / segs) * extent * 2;
      if (inPondFootprint(x, z, 0.25)) keep[j * col + i] = 0;
    }
  }

  let vert = 0;
  for (let j = 0; j <= segs; j++) {
    for (let i = 0; i <= segs; i++) {
      if (!keep[j * col + i]) continue;
      const x = -extent + (i / segs) * extent * 2;
      const z = -extent + (j / segs) * extent * 2;
      const wear = wearAt[j * col + i]!;
      lookup[j * col + i] = vert;
      const y = meadowHeight(x, z) + PATH_LIFT;
      positions.push(x, y, z);
      const t = wear;
      colors.push(
        DIRT.r * t + WORN.r * (1 - t),
        DIRT.g * t + WORN.g * (1 - t),
        DIRT.b * t + WORN.b * (1 - t),
      );
      weaves.push(wear);
      uvs.push(x * 0.28, z * 0.28);
      vert += 1;
    }
  }

  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = lookup[j * col + i]!;
      const b = lookup[j * col + i + 1]!;
      const c = lookup[(j + 1) * col + i]!;
      const d = lookup[(j + 1) * col + i + 1]!;
      if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      indices.push(a, c, b, b, c, d);
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    weaves: new Float32Array(weaves),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}
