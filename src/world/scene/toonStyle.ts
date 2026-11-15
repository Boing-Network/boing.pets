/**
 * Vinyl-toy shading for the StreetBody and its gear.
 * A few soft steps, a cool edge, and a tight plastic highlight.
 * Not a hard comic posterize.
 */

import * as THREE from "three";

const TOON_STEPS = [96, 150, 190, 225, 255];

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
        float ndv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
        float edge = pow(1.0 - ndv, 2.4);
        outgoingLight += vec3(0.82, 0.9, 1.0) * edge * 0.16;
        float gloss = pow(ndv, 10.0);
        outgoingLight += vec3(1.0, 0.98, 0.94) * gloss * 0.2;
        `,
    );
  };
  mat.customProgramCacheKey = () => "street-body-vinyl-v1";
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
