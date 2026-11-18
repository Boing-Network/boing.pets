import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector4,
} from "three";
import {
  MOON_DIRECTION,
  getNoiseTexture,
  heightTextureBounds,
  makeHeightTexture,
  worldTime,
} from "./gfx";
import { WaterCell, type WorldModel } from "./world-model";
import { SEA_LEVEL } from "./world-plan";

/** How far the open sea reaches past the terrain grid. */
const SEA_REACH = 2600;

/**
 * One surface for every body of water. Each grid vertex sits at the level of
 * the water nearest to it, so a river, the pond it feeds and the sea it
 * reaches are a single continuous sheet with no seams.
 */
function buildGeometry(model: WorldModel): BufferGeometry {
  const { nx, nz, cell, originX, originZ } = model;
  const wet = new Uint8Array(nx * nz);
  for (let i = 0; i < wet.length; i += 1) {
    wet[i] = model.height[i]! < model.waterLevel[i]! + 0.3 ? 1 : 0;
  }

  const remap = new Int32Array(nx * nz).fill(-1);
  const positions: number[] = [];
  const flow: number[] = [];
  const river: number[] = [];
  const murk: number[] = [];
  const indices: number[] = [];

  const vertex = (i: number): number => {
    const known = remap[i]!;
    if (known >= 0) return known;
    const ix = i % nx;
    const iz = (i - ix) / nx;
    const kind = model.waterKind[i]!;
    const index = positions.length / 3;
    positions.push(
      originX + ix * cell,
      model.waterLevel[i]!,
      originZ + iz * cell,
    );
    if (kind === WaterCell.NONE) {
      // Open sea: a slow drift so the surface is never dead still.
      flow.push(0.8, 0.6, 0.35, 0);
    } else {
      flow.push(
        model.flow[i * 4]!,
        model.flow[i * 4 + 1]!,
        model.flow[i * 4 + 2]!,
        model.flow[i * 4 + 3]!,
      );
    }
    river.push(
      model.riverCoord[i * 2]!,
      model.riverCoord[i * 2 + 1]!,
      kind === WaterCell.RIVER ? 1 : 0,
    );
    murk.push(kind === WaterCell.SWAMP ? 1 : 0);
    remap[i] = index;
    return index;
  };

  for (let iz = 0; iz < nz - 1; iz += 1) {
    for (let ix = 0; ix < nx - 1; ix += 1) {
      const a = iz * nx + ix;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      if (!(wet[a] || wet[b] || wet[c] || wet[d])) continue;
      const va = vertex(a);
      const vb = vertex(b);
      const vc = vertex(c);
      const vd = vertex(d);
      indices.push(va, vc, vb, vb, vc, vd);
    }
  }

  // Open sea beyond the grid: four slabs out to the horizon.
  const x0 = originX;
  const x1 = originX + (nx - 1) * cell;
  const z0 = originZ;
  const z1 = originZ + (nz - 1) * cell;
  const slab = (ax: number, az: number, bx: number, bz: number) => {
    const base = positions.length / 3;
    for (const [x, z] of [
      [ax, az],
      [bx, az],
      [ax, bz],
      [bx, bz],
    ] as const) {
      positions.push(x, SEA_LEVEL, z);
      flow.push(0.8, 0.6, 0.35, 0);
      river.push(0, 0, 0);
      murk.push(0);
    }
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };
  slab(x0 - SEA_REACH, z0 - SEA_REACH, x1 + SEA_REACH, z0);
  slab(x0 - SEA_REACH, z1, x1 + SEA_REACH, z1 + SEA_REACH);
  slab(x0 - SEA_REACH, z0, x0, z1);
  slab(x1, z0, x1 + SEA_REACH, z1);

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute(
    "aFlow",
    new BufferAttribute(new Float32Array(flow), 4),
  );
  geometry.setAttribute(
    "aRiver",
    new BufferAttribute(new Float32Array(river), 3),
  );
  geometry.setAttribute(
    "aMurk",
    new BufferAttribute(new Float32Array(murk), 1),
  );
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const VERTEX = /* glsl */ `
attribute vec4 aFlow;
attribute vec3 aRiver;
attribute float aMurk;
varying vec3 vWorld;
varying vec4 vFlow;
varying vec3 vRiver;
varying float vMurk;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vFlow = aFlow;
  vRiver = aRiver;
  vMurk = aMurk;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uHeight;
uniform sampler2D uNoise;
uniform vec4 uBounds;
uniform float uTime;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSwamp;
uniform vec3 uWeed;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
uniform vec3 uGlow;
uniform vec3 uFoam;
varying vec3 vWorld;
varying vec4 vFlow;
varying vec3 vRiver;
varying float vMurk;
#include <common>
#include <fog_pars_fragment>

void main() {
  vec2 xz = vWorld.xz;
  float ground = texture2D(uHeight, (xz - uBounds.xy) * uBounds.zw).r;
  float depth = vWorld.y - ground;
  if (depth <= 0.0) discard;

  float riverness = clamp(vRiver.z, 0.0, 1.0);
  float speed = vFlow.z;
  float rapids = vFlow.w * riverness;
  vec2 dir = vFlow.xy;

  // Two copies of the pattern ride the current half a cycle apart and
  // cross-fade, so it flows forever without smearing.
  float cycle = 5.0;
  float phaseA = fract(uTime / cycle);
  float phaseB = fract(uTime / cycle + 0.5);
  float blend = abs(phaseA * 2.0 - 1.0);
  vec2 carry = dir * speed * cycle;

  vec4 rippleA = texture2D(uNoise, (xz - carry * phaseA) * 0.085);
  vec4 rippleB = texture2D(uNoise, (xz - carry * phaseB) * 0.085 + 0.37);
  vec4 ripple = mix(rippleA, rippleB, blend);
  vec4 fineA = texture2D(uNoise, (xz - carry * phaseA * 1.3) * 0.31 + 0.11);
  vec4 fineB = texture2D(uNoise, (xz - carry * phaseB * 1.3) * 0.31 + 0.53);
  vec4 fine = mix(fineA, fineB, blend);

  // In a channel the pattern is stretched along the current: streamlines.
  float along = vRiver.y;
  vec2 streamA = vec2(vRiver.x * 0.23, (along - speed * cycle * phaseA) * 0.045);
  vec2 streamB = vec2(vRiver.x * 0.23 + 0.5, (along - speed * cycle * phaseB) * 0.045);
  float stream = mix(texture2D(uNoise, streamA).r, texture2D(uNoise, streamB).r, blend);
  float streamFine = mix(
    texture2D(uNoise, streamA * vec2(2.3, 1.9)).a,
    texture2D(uNoise, streamB * vec2(2.3, 1.9)).a,
    blend
  );

  float chop = mix(0.22, 0.5, riverness) + rapids * 0.5 - vMurk * 0.16;
  vec2 tilt = (ripple.gb - 0.5) * chop + (fine.gb - 0.5) * chop * 0.6;
  vec3 normal = normalize(vec3(-tilt.x, 1.0, -tilt.y));
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 bounce = reflect(-view, normal);

  float shallow = 1.0 - smoothstep(0.0, 1.5, depth);
  vec3 body = mix(uDeep, uShallow, shallow * 0.9);
  body = mix(body, uSwamp, vMurk * 0.85);

  float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 4.0);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, clamp(bounce.y * 1.4, 0.0, 1.0));
  vec3 color = mix(body, sky, clamp(fresnel * 0.85 + 0.06, 0.0, 1.0) * (1.0 - vMurk * 0.5));

  float moon = max(dot(bounce, uMoonDir), 0.0);
  color += uMoonColor * (pow(moon, 220.0) * 2.4 + pow(moon, 22.0) * 0.16) * (1.0 - vMurk * 0.6);

  // Luminous threads that travel with the water make the flow readable.
  float thread = mix(ripple.r, stream, riverness);
  float lines = smoothstep(0.045, 0.0, abs(thread - 0.5)) * (0.35 + 0.65 * fine.a);
  color += uGlow * lines * mix(0.16, 0.5, riverness) * (1.0 - vMurk * 0.7);

  // White water where the channel is steep, and a lapping line at every shore.
  float churn = smoothstep(0.62 - rapids * 0.42, 0.8, streamFine * 0.6 + stream * 0.5) * rapids;
  float lap = sin(depth * 30.0 - uTime * 1.8 + ripple.r * 7.0) * 0.5 + 0.5;
  float shoreFoam = smoothstep(0.26, 0.02, depth) * (0.35 + 0.65 * lap) * (1.0 - vMurk * 0.75);
  float foam = clamp(churn + shoreFoam * (0.5 + 0.5 * riverness), 0.0, 1.0);
  color = mix(color, uFoam, foam * 0.85);

  // Stagnant water grows a skin of weed that does not move.
  float weed = smoothstep(0.5, 0.6, texture2D(uNoise, xz * 0.047).r * 0.7 + texture2D(uNoise, xz * 0.21).a * 0.45) * vMurk;
  color = mix(color, uWeed * (0.7 + 0.6 * fine.a), weed * 0.9);

  float alpha = mix(0.94, 0.42, shallow);
  alpha = mix(alpha, 0.93, vMurk * 0.8);
  alpha = max(alpha, max(foam * 0.9, weed));
  alpha *= smoothstep(0.0, 0.045, depth);

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function Water({ model }: { model: WorldModel }) {
  const geometry = useMemo(() => buildGeometry(model), [model]);
  const heightTexture = useMemo(() => makeHeightTexture(model), [model]);
  const material = useMemo(() => {
    const uniforms = UniformsUtils.merge([
      UniformsLib.fog,
      {
        uHeight: { value: null },
        uNoise: { value: null },
        uBounds: { value: new Vector4() },
        uMoonDir: { value: MOON_DIRECTION.clone() },
        uMoonColor: { value: new Color("#dbe9ff") },
        uDeep: { value: new Color("#06283c") },
        uShallow: { value: new Color("#1f8f96") },
        uSwamp: { value: new Color("#1c3a22") },
        uWeed: { value: new Color("#4f8a34") },
        uSkyHorizon: { value: new Color("#2a6f86") },
        uSkyZenith: { value: new Color("#0a1a3c") },
        uGlow: { value: new Color("#7ff3e2") },
        uFoam: { value: new Color("#d6f4f2") },
      },
    ]);
    // Every animated material reads the one shared clock object.
    uniforms.uTime = worldTime;
    return new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms,
    });
  }, []);

  useEffect(() => {
    material.uniforms.uHeight!.value = heightTexture;
    material.uniforms.uNoise!.value = getNoiseTexture();
    material.uniforms.uBounds!.value.set(...heightTextureBounds(model));
  }, [material, heightTexture, model]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => heightTexture.dispose(), [heightTexture]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={2}
      frustumCulled={false}
    />
  );
}
