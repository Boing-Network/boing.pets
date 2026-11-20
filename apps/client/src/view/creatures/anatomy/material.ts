/**
 * The two materials every creature shares: skin, and a double-sided
 * membrane for wings. Standard PBR, so moonlight, the hemisphere light and
 * fog hit creatures exactly as they hit terrain and flora. Three cheap
 * additions are read from vertex attributes:
 *
 * - fine coat grain (value noise on object position, scaled by `glow.a`),
 * - a soft cool rim on fur, the way moonlight catches the edge of a coat,
 * - subtle bioluminescence (`glow.rgb`) that breathes slowly over time.
 *
 * One shader program for all 21 species, and no per-creature lights.
 */
import { DoubleSide, FrontSide, MeshStandardMaterial } from "three";

/** Seconds, advanced once per frame by whoever renders creatures. */
export const creatureTime = { value: 0 };

function patch(material: MeshStandardMaterial): MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCreatureTime = creatureTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec4 glow;
varying vec4 vGlow;
varying vec3 vObj;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vGlow = glow;
vObj = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uCreatureTime;
varying vec4 vGlow;
varying vec3 vObj;
float cHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float cNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(cHash(i), cHash(i + vec3(1, 0, 0)), f.x),
        mix(cHash(i + vec3(0, 1, 0)), cHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(cHash(i + vec3(0, 0, 1)), cHash(i + vec3(1, 0, 1)), f.x),
        mix(cHash(i + vec3(0, 1, 1)), cHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
// Coat grain, streaky along the body; fades with distance so far creatures
// never shimmer.
float cFade = 1.0 - smoothstep(18.0, 70.0, length(vViewPosition));
float cGrain = cNoise(vObj * vec3(150.0, 70.0, 150.0)) * 0.6
  + cNoise(vObj * vec3(330.0, 160.0, 330.0)) * 0.4;
diffuseColor.rgb *= mix(1.0, 0.8 + 0.34 * cGrain, vGlow.a * cFade);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
// Eyes, noses and hooves (low grain) are a little glossier than coat.
roughnessFactor = clamp(roughnessFactor - (1.0 - vGlow.a) * 0.4, 0.3, 1.0);`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
float cRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
totalEmissiveRadiance += vec3(0.30, 0.40, 0.58) * cRim * 0.07 * vGlow.a;
float cPulse = 0.78 + 0.22 * sin(uCreatureTime * 1.3 + vObj.x * 9.0 + vObj.z * 7.0);
totalEmissiveRadiance += vGlow.rgb * cPulse;`,
      );
  };
  material.customProgramCacheKey = () => "living-pets-creature-v1";
  return material;
}

export const creatureSkin = patch(
  new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: FrontSide,
  }),
);

export const creatureMembrane = patch(
  new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0,
    side: DoubleSide,
  }),
);
