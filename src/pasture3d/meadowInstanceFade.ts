import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import * as THREE from "three";
import { meadowHeight } from "./meadowHeight";
import { meadowWindTime } from "./meadowWind";
import { occluderOpacityAgainstTargets, type Vec3 } from "./occluderFade";
import { getPastureFocus, pastureFocusTargets } from "./pastureFocus";

/** Transparent instanced material with per-instance fade, optional canopy sway. */
export function applyInstancedFade(
  material: THREE.MeshStandardMaterial,
  windAmount = 0,
): void {
  material.transparent = true;
  material.depthWrite = true;
  const key = "instance-fade-" + windAmount.toFixed(3);
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (shader) => {
    if (windAmount > 0) {
      shader.uniforms.uWind = meadowWindTime;
      shader.uniforms.uAmount = { value: windAmount };
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float instanceFade;
varying float vInstanceFade;${
          windAmount > 0
            ? `
uniform float uWind;
uniform float uAmount;`
            : ""
        }`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vInstanceFade = instanceFade;${
          windAmount > 0
            ? `
float windLift = max(transformed.y, 0.0);
float gust = sin(uWind * 1.15 + transformed.x * 0.35 + transformed.z * 0.28);
transformed.x += gust * uAmount * windLift;
transformed.z += cos(uWind * 0.9 + transformed.x * 0.22) * uAmount * 0.65 * windLift;`
            : ""
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vInstanceFade;`,
      )
      .replace(
        "#include <dithering_fragment>",
        `gl_FragColor.a *= vInstanceFade;
#include <dithering_fragment>`,
      );
  };
}

export function ensureInstanceFadeAttr(
  mesh: THREE.InstancedMesh,
  count: number,
): THREE.InstancedBufferAttribute {
  const existing = mesh.geometry.getAttribute("instanceFade") as
    THREE.InstancedBufferAttribute | undefined;
  if (existing && existing.count >= count) return existing;
  const data = new Float32Array(count);
  data.fill(1);
  const attr = new THREE.InstancedBufferAttribute(data, 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute("instanceFade", attr);
  return attr;
}

export function useOccluderFades(
  meshes: ReadonlyArray<RefObject<THREE.InstancedMesh | null>>,
  spots: readonly (readonly [number, number])[],
  radius: number,
  yLift: number,
): void {
  const fades = useRef<Float32Array | null>(null);
  useFrame(({ camera }, delta) => {
    const count = spots.length;
    if (count === 0) return;
    if (!fades.current || fades.current.length !== count) {
      fades.current = new Float32Array(count);
      fades.current.fill(1);
    }
    const values = fades.current;
    const cam: Vec3 = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    };
    const targets = pastureFocusTargets(getPastureFocus());
    const k = 1 - Math.pow(0.04, delta);
    for (let i = 0; i < count; i++) {
      const spot = spots[i]!;
      const point = {
        x: spot[0],
        y: meadowHeight(spot[0], spot[1]) + yLift,
        z: spot[1],
      };
      const next = occluderOpacityAgainstTargets(cam, targets, point, radius);
      values[i] = values[i]! + (next - values[i]!) * k;
    }
    for (const ref of meshes) {
      const mesh = ref.current;
      if (!mesh) continue;
      const attr = ensureInstanceFadeAttr(mesh, count);
      (attr.array as Float32Array).set(values);
      attr.needsUpdate = true;
    }
  });
}
