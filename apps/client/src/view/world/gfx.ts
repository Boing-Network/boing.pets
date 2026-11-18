/**
 * Shared GPU resources for the landscape: one clock uniform every animated
 * material reads, a small tiling noise texture, and the ground height baked
 * to a texture so the water shader can find its own shorelines.
 */
import {
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from "three";
import { hash01 } from "./noise";
import type { WorldModel } from "./world-model";

/** Seconds of presentation time. Advanced once per frame by the scene. */
export const worldTime = { value: 0 };

/** Direction toward the moon. Lights, sky and water all agree on it. */
export const MOON_DIRECTION = new Vector3(-0.42, 0.5, -0.76).normalize();

function tileValue(seed: number, x: number, z: number, period: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const wrap = (v: number) => ((v % period) + period) % period;
  const a = hash01(seed, wrap(x0), wrap(z0));
  const b = hash01(seed, wrap(x0 + 1), wrap(z0));
  const c = hash01(seed, wrap(x0), wrap(z0 + 1));
  const d = hash01(seed, wrap(x0 + 1), wrap(z0 + 1));
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function tileFbm(seed: number, u: number, v: number, base: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = base;
  for (let i = 0; i < 4; i += 1) {
    sum += tileValue(seed + i * 71, u * period, v * period, period) * amp;
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

let noiseTexture: DataTexture | null = null;

/**
 * Tiling noise. R: soft fractal height. G, B: its slope in u and v (0.5 is
 * flat), for cheap ripple normals. A: a second, finer fractal.
 */
export function getNoiseTexture(): DataTexture {
  if (noiseTexture) return noiseTexture;
  const size = 128;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      heights[y * size + x] = tileFbm(4201, x / size, y / size, 4);
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) =>
    heights[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 6;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 6;
      data[i] = Math.round(at(x, y) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, 0.5 + dx)) * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, 0.5 + dy)) * 255);
      data[i + 3] = Math.round(tileFbm(977, x / size, y / size, 8) * 255);
    }
  }
  const texture = new DataTexture(
    data,
    size,
    size,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  noiseTexture = texture;
  return texture;
}

export function makeHeightTexture(model: WorldModel): DataTexture {
  const data = new Uint16Array(model.nx * model.nz);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = DataUtils.toHalfFloat(model.height[i]!);
  }
  const texture = new DataTexture(
    data,
    model.nx,
    model.nz,
    RedFormat,
    HalfFloatType,
  );
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Maps world xz to height-texture uv: (xz - xy) * zw. */
export function heightTextureBounds(
  model: WorldModel,
): [number, number, number, number] {
  return [
    model.originX - model.cell * 0.5,
    model.originZ - model.cell * 0.5,
    1 / (model.nx * model.cell),
    1 / (model.nz * model.cell),
  ];
}
