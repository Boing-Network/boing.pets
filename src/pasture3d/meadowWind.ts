import type { MeshStandardMaterial } from "three";

export const meadowWindTime = { value: 0 };

export function tickMeadowWind(elapsed: number) {
  meadowWindTime.value = elapsed;
}

/** Cheap vertex sway shared by grass, bushes, and tree canopies. */
export function applyMeadowWind(
  material: MeshStandardMaterial,
  amount: number,
) {
  const key = "meadow-wind-" + amount.toFixed(3);
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = meadowWindTime;
    shader.uniforms.uAmount = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uWind;
uniform float uAmount;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
float windLift = max(transformed.y, 0.0);
float gust = sin(uWind * 1.15 + transformed.x * 0.35 + transformed.z * 0.28);
transformed.x += gust * uAmount * windLift;
transformed.z += cos(uWind * 0.9 + transformed.x * 0.22) * uAmount * 0.65 * windLift;`,
      );
  };
}
