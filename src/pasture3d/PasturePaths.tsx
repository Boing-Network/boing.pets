import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildPasturePathMeshData } from "./pasturePath";
import { makeLaneTexture } from "./yardChrome";

function applyPathFeather(material: THREE.MeshStandardMaterial) {
  material.customProgramCacheKey = () => "pasture-path-wear";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float aWear;
varying float vWear;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vWear = aWear;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vWear;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
diffuseColor.a *= smoothstep(0.02, 0.16, vWear);`,
      );
  };
}

export function PasturePaths({ preferPerf }: { preferPerf: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const map = useMemo(() => makeLaneTexture(), []);
  const geo = useMemo(() => {
    const data = buildPasturePathMeshData(preferPerf ? 96 : 192, 40);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
    g.setAttribute("aWear", new THREE.BufferAttribute(data.weaves, 1));
    g.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
    g.setIndex(new THREE.BufferAttribute(data.indices, 1));
    g.computeVertexNormals();
    return g;
  }, [preferPerf]);

  useLayoutEffect(() => {
    if (mat.current) applyPathFeather(mat.current);
  }, []);

  return (
    <mesh
      ref={mesh}
      geometry={geo}
      receiveShadow
      renderOrder={2}
      frustumCulled={false}
    >
      <meshStandardMaterial
        ref={mat}
        map={map ?? undefined}
        vertexColors
        color={map ? "#6a6964" : "#4a4944"}
        roughness={0.98}
        metalness={0}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}
