import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ShaderMaterial,
} from "three";
import {
  FIREFLY_STRIDE,
  GLOW_STRIDE,
  type FloraLayout,
} from "./flora-placement";
import { worldTime } from "./gfx";

const VERTEX = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uScale;
uniform float uDrift;
uniform float uPulse;
uniform float uFogDensity;
varying vec3 vColor;
void main() {
  vec3 p = position;
  p.x += (sin(uTime * 0.7 + aPhase * 1.7) * 1.1 + sin(uTime * 0.23 + aPhase) * 2.2) * uDrift;
  p.y += sin(uTime * 0.9 + aPhase * 2.3) * 0.5 * uDrift;
  p.z += (cos(uTime * 0.6 + aPhase * 1.3) * 1.1 + cos(uTime * 0.19 + aPhase * 0.7) * 2.2) * uDrift;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float wink = 0.5 + 0.5 * sin(uTime * (1.1 + fract(aPhase * 0.37) * 2.2) + aPhase * 6.0);
  float haze = exp(-uFogDensity * uFogDensity * mv.z * mv.z);
  vColor = aColor * mix(1.0, wink * wink, uPulse) * haze;
  gl_PointSize = clamp(aSize * uScale / -mv.z, 1.5, 96.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uIntensity;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float soft = pow(max(1.0 - d, 0.0), 2.4);
  float core = smoothstep(0.35, 0.0, d);
  gl_FragColor = vec4(vColor * uIntensity * (soft + core * 0.6), soft);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function makeMaterial(options: {
  drift: number;
  pulse: number;
  intensity: number;
}): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: worldTime,
      uScale: { value: 600 },
      uDrift: { value: options.drift },
      uPulse: { value: options.pulse },
      uIntensity: { value: options.intensity },
      uFogDensity: { value: 0.0036 },
    },
  });
}

function makeGeometry(
  data: Float32Array,
  count: number,
  stride: number,
  sizeOf: (o: number) => number,
  phaseOf: (o: number, i: number) => number,
): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const o = i * stride;
    positions[i * 3] = data[o]!;
    positions[i * 3 + 1] = data[o + 1]!;
    positions[i * 3 + 2] = data[o + 2]!;
    sizes[i] = sizeOf(o);
    phases[i] = phaseOf(o, i);
    colors[i * 3] = data[o + 4]!;
    colors[i * 3 + 1] = data[o + 5]!;
    colors[i * 3 + 2] = data[o + 6]!;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Soft light: a halo on every glowing plant and drifting fireflies. Additive
 * points stand in for bloom, so the night stays luminous without a
 * post-processing pass.
 */
export function GlowPoints({ layout }: { layout: FloraLayout }) {
  const halos = useMemo(
    () =>
      makeGeometry(
        layout.glow,
        layout.glowCount,
        GLOW_STRIDE,
        (o) => layout.glow[o + 3]!,
        (_, i) => i * 0.618,
      ),
    [layout],
  );
  const flies = useMemo(
    () =>
      makeGeometry(
        layout.fireflies,
        layout.fireflyCount,
        FIREFLY_STRIDE,
        () => 0.35,
        (o) => layout.fireflies[o + 3]!,
      ),
    [layout],
  );
  const haloMaterial = useMemo(
    () => makeMaterial({ drift: 0, pulse: 0.25, intensity: 0.22 }),
    [],
  );
  const flyMaterial = useMemo(
    () => makeMaterial({ drift: 1, pulse: 1, intensity: 1.4 }),
    [],
  );

  useEffect(() => () => halos.dispose(), [halos]);
  useEffect(() => () => flies.dispose(), [flies]);
  useEffect(
    () => () => {
      haloMaterial.dispose();
      flyMaterial.dispose();
    },
    [haloMaterial, flyMaterial],
  );

  useFrame(({ camera, size, viewport }) => {
    // World size to pixels at unit distance, so halos keep their scale.
    const fov = "fov" in camera ? (camera.fov * Math.PI) / 180 : 0.7;
    const scale = (size.height * viewport.dpr) / (2 * Math.tan(fov / 2));
    haloMaterial.uniforms.uScale!.value = scale;
    flyMaterial.uniforms.uScale!.value = scale;
  });

  return (
    <>
      <points geometry={halos} material={haloMaterial} renderOrder={3} />
      <points
        geometry={flies}
        material={flyMaterial}
        renderOrder={3}
        frustumCulled={false}
      />
    </>
  );
}
