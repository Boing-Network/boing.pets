/** Shared three-step toon ramp and warm rim used by the StreetBody and gear. */

import * as THREE from "three";

const TOON_STEPS = [48, 140, 255];

const RIM_HOOK =
  "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;";

export function makeToonRamp(): THREE.DataTexture {
  const data = new Uint8Array(TOON_STEPS.length * 4);
  for (let i = 0; i < TOON_STEPS.length; i++) {
    const v = TOON_STEPS[i]!;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(
    data,
    TOON_STEPS.length,
    1,
    THREE.RGBAFormat,
  );
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** One ramp for every accessory so hats match the body. */
export const SHARED_TOON_RAMP = makeToonRamp();

export function addToonRim(mat: THREE.MeshToonMaterial): void {
  mat.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes(RIM_HOOK)) return;
    shader.fragmentShader = shader.fragmentShader.replace(
      RIM_HOOK,
      RIM_HOOK +
        `
        float rim = pow(clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.6);
        outgoingLight += vec3(1.0, 0.86, 0.7) * rim * 0.32;
        float luma = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        float q = floor(luma * 3.0 + 0.28) / 3.0;
        outgoingLight *= luma > 0.001 ? q / luma : 1.0;
        `,
    );
  };
  mat.customProgramCacheKey = () => "street-body-toon-rim-v3";
}

export function cartoonMaterial(opts: {
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    color: opts.color,
    gradientMap: SHARED_TOON_RAMP,
    emissive: opts.emissive ?? "#000000",
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent,
    opacity: opts.opacity,
  });
  addToonRim(mat);
  return mat;
}
