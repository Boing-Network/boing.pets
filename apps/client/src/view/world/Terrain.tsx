import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  MeshStandardMaterial,
} from "three";
import { WILD } from "./biomes";
import { getNoiseTexture } from "./gfx";
import { fbm, smoothstep } from "./noise";
import { WaterCell, type WorldModel } from "./world-model";

const ROCK = new Color("#3d3f52");
const HIGH_ROCK = new Color("#9aa6c6");
const SAND = new Color("#6f6a52");
const GRAVEL = new Color("#4a4f55");
const MUD = new Color("#1b2a22");
const BED = new Color("#12303a");
const SEABED = new Color("#0b2530");
const EARTH = new Color("#5d4a36");

function buildGeometry(model: WorldModel): BufferGeometry {
  const { nx, nz, cell, originX, originZ } = model;
  const count = nx * nz;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const regionColors = model.regions.map((r) => ({
    a: new Color(r.biome.ground),
    b: new Color(r.biome.groundAlt),
  }));
  const wildA = new Color(WILD.ground);
  const wildB = new Color(WILD.groundAlt);
  const weights = new Float32Array(Math.max(1, model.regions.length));
  const color = new Color();
  const tint = new Color();

  for (let iz = 0; iz < nz; iz += 1) {
    const z = originZ + iz * cell;
    for (let ix = 0; ix < nx; ix += 1) {
      const i = iz * nx + ix;
      const x = originX + ix * cell;
      const h = model.height[i]!;
      positions[i * 3] = x;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = z;

      const patch = fbm(model.seed + 501, x / 13, z / 13, 3) * 0.5 + 0.5;
      const wild = model.regionWeights(x, z, weights);
      color.setRGB(0, 0, 0);
      for (let r = 0; r < regionColors.length; r += 1) {
        const w = weights[r]!;
        if (w <= 0) continue;
        tint.copy(regionColors[r]!.a).lerp(regionColors[r]!.b, patch);
        color.r += tint.r * w;
        color.g += tint.g * w;
        color.b += tint.b * w;
      }
      if (wild > 0) {
        tint.copy(wildA).lerp(wildB, patch);
        color.r += tint.r * wild;
        color.g += tint.g * wild;
        color.b += tint.b * wild;
      }

      const slope = model.slopeAt(x, z);
      color.lerp(ROCK, smoothstep(0.5, 1.0, slope) * 0.9);
      color.lerp(HIGH_ROCK, smoothstep(22, 38, h) * 0.8);

      const wd = model.waterDist[i]!;
      const kind = model.waterKind[i]!;
      if (kind !== WaterCell.NONE) {
        const shoreTint =
          kind === WaterCell.SWAMP
            ? MUD
            : kind === WaterCell.RIVER
              ? GRAVEL
              : SAND;
        const reach = kind === WaterCell.SWAMP ? 6 : 2.4;
        color.lerp(shoreTint, smoothstep(reach, 0, wd) * 0.85);
        color.lerp(BED, smoothstep(0, -2.5, wd) * 0.8);
      } else {
        color.lerp(SAND, smoothstep(1.3, 0.25, h) * 0.85);
        color.lerp(SEABED, smoothstep(0, -2.5, h));
      }

      const trail = model.trailDist[i]!;
      color.lerp(EARTH, smoothstep(1.9, 0.5, trail) * 0.75);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
  }

  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let o = 0;
  for (let iz = 0; iz < nz - 1; iz += 1) {
    for (let ix = 0; ix < nx - 1; ix += 1) {
      const a = iz * nx + ix;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      indices[o++] = a;
      indices[o++] = c;
      indices[o++] = b;
      indices[o++] = b;
      indices[o++] = c;
      indices[o++] = d;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
  });
  const noise = getNoiseTexture();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vGroundXZ;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvGroundXZ = position.xz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D uNoise;\nvarying vec2 vGroundXZ;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float groundCoarse = texture2D(uNoise, vGroundXZ * 0.021).r;
        float groundFine = texture2D(uNoise, vGroundXZ * 0.19).a;
        diffuseColor.rgb *= 0.85 + 0.45 * groundCoarse + 0.28 * groundFine;`,
      );
  };
  return material;
}

export function Terrain({ model }: { model: WorldModel }) {
  const geometry = useMemo(() => buildGeometry(model), [model]);
  const material = useMemo(() => makeMaterial(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}
