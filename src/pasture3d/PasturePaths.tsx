import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildPasturePathMeshData } from "./pasturePath";

function makeDirtTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#6e5334";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1800; i++) {
    const x = ((i * 73) % size) + ((i * 17) % 9) * 0.2;
    const y = ((i * 47) % size) + ((i * 11) % 7) * 0.2;
    const tone = 70 + ((i * 13) % 80);
    const g = tone - ((i * 5) % 18);
    const r = tone + 18;
    const b = tone - 36;
    ctx.fillStyle = `rgba(${r}, ${g}, ${Math.max(20, b)}, 0.42)`;
    ctx.fillRect(x, y, 2 + (i % 5), 1 + (i % 4));
  }
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(90, 110, 60, ${0.12 + (i % 5) * 0.04})`;
    ctx.fillRect((i * 91) % size, (i * 53) % size, 6, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

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
  const map = useMemo(() => makeDirtTexture(), []);
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
        color={map ? "#e8d2b0" : "#8a6a42"}
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
