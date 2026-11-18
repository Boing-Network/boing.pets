import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  DoubleSide,
  DynamicDrawUsage,
  FrontSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Group,
} from "three";
import { buildFloraGeometry } from "./flora-geometry";
import {
  FLORA_KINDS,
  FLORA_STRIDE,
  type FloraBatch,
  type FloraKind,
  type FloraLayout,
} from "./flora-placement";
import { worldTime } from "./gfx";

export type Look = {
  flat: boolean;
  twoSided: boolean;
  shadow: boolean;
  wind: number;
  glow: number;
  /** Glow takes the per-instance tint (petals) or the baked color (lanterns). */
  glowTinted: boolean;
  roughness: number;
  /** Tiles farther than this from the camera are not drawn. */
  reach: number;
};

const LOOK: Record<FloraKind, Look> = {
  broadleaf: {
    flat: true,
    twoSided: false,
    shadow: true,
    wind: 1,
    glow: 0,
    glowTinted: false,
    roughness: 0.9,
    reach: Infinity,
  },
  pine: {
    flat: true,
    twoSided: false,
    shadow: true,
    wind: 0.7,
    glow: 0,
    glowTinted: false,
    roughness: 0.9,
    reach: Infinity,
  },
  lanternTree: {
    flat: true,
    twoSided: false,
    shadow: true,
    wind: 0.8,
    glow: 2.6,
    glowTinted: false,
    roughness: 0.9,
    reach: Infinity,
  },
  deadTree: {
    flat: true,
    twoSided: false,
    shadow: true,
    wind: 0,
    glow: 0,
    glowTinted: false,
    roughness: 1,
    reach: Infinity,
  },
  bush: {
    flat: true,
    twoSided: false,
    shadow: false,
    wind: 1,
    glow: 0,
    glowTinted: false,
    roughness: 0.9,
    reach: 330,
  },
  rock: {
    flat: true,
    twoSided: false,
    shadow: true,
    wind: 0,
    glow: 0,
    glowTinted: false,
    roughness: 0.82,
    reach: Infinity,
  },
  stone: {
    flat: true,
    twoSided: false,
    shadow: true,
    wind: 0,
    glow: 0,
    glowTinted: false,
    roughness: 0.8,
    reach: Infinity,
  },
  grass: {
    flat: false,
    twoSided: true,
    shadow: false,
    wind: 1,
    glow: 0,
    glowTinted: false,
    roughness: 0.95,
    reach: 190,
  },
  flower: {
    flat: true,
    twoSided: true,
    shadow: false,
    wind: 1,
    glow: 1.5,
    glowTinted: true,
    roughness: 0.7,
    reach: 210,
  },
  mushroom: {
    flat: true,
    twoSided: false,
    shadow: false,
    wind: 0,
    glow: 1.9,
    glowTinted: true,
    roughness: 0.6,
    reach: 230,
  },
  crystal: {
    flat: true,
    twoSided: false,
    shadow: false,
    wind: 0,
    glow: 1.8,
    glowTinted: true,
    roughness: 0.25,
    reach: Infinity,
  },
  reed: {
    flat: false,
    twoSided: true,
    shadow: false,
    wind: 1,
    glow: 2.4,
    glowTinted: false,
    roughness: 0.9,
    reach: 300,
  },
  lily: {
    flat: false,
    twoSided: true,
    shadow: false,
    wind: 0,
    glow: 1.3,
    glowTinted: true,
    roughness: 0.6,
    reach: 300,
  },
};

export function makeFoliageMaterial(look: Look): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: look.flat,
    side: look.twoSided ? DoubleSide : FrontSide,
    roughness: look.roughness,
    metalness: 0,
  });
  material.customProgramCacheKey = () =>
    look.twoSided && !look.flat ? "foliage-blade" : "foliage-solid";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldTime;
    shader.uniforms.uWind = { value: look.wind };
    shader.uniforms.uGlow = { value: look.glow };
    shader.uniforms.uGlowTinted = { value: look.glowTinted ? 1 : 0 };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aSway;
        attribute float aGlow;
        uniform float uTime;
        uniform float uWind;
        uniform float uGlowTinted;
        varying vec3 vGlowColor;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 rooted = instanceMatrix[3].xyz;
          #ifdef USE_INSTANCING_COLOR
            vGlowColor = mix(color.rgb, color.rgb * instanceColor.rgb, uGlowTinted) * aGlow;
          #else
            vGlowColor = color.rgb * aGlow;
          #endif
        #else
          vec3 rooted = vec3(0.0);
          vGlowColor = color.rgb * aGlow;
        #endif
        float gust = sin(uTime * 1.1 + rooted.x * 0.31 + rooted.z * 0.23)
          + 0.5 * sin(uTime * 2.3 + rooted.x * 0.83 - rooted.z * 0.61);
        transformed.x += aSway * gust * uWind;
        transformed.z += aSway * gust * uWind * 0.6;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uGlow;
        varying vec3 vGlowColor;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vGlowColor * uGlow;`,
      );
    if (look.twoSided && !look.flat) {
      // Blades are lit like the ground they stand on, from either side.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
        normal = normalize(vNormal);`,
      );
    }
  };
  return material;
}

const scratchMatrix = new Matrix4();
const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();
const scratchScale = new Vector3();
const UP = new Vector3(0, 1, 0);

function makeMesh(
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  batch: FloraBatch,
  start: number,
  count: number,
  shadow: boolean,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, count);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const o = (start + i) * FLORA_STRIDE;
    scratchPosition.set(batch.data[o]!, batch.data[o + 1]!, batch.data[o + 2]!);
    scratchQuaternion.setFromAxisAngle(UP, batch.data[o + 3]!);
    scratchScale.setScalar(batch.data[o + 4]!);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    mesh.setMatrixAt(i, scratchMatrix);
    colors[i * 3] = batch.data[o + 5]!;
    colors[i * 3 + 1] = batch.data[o + 6]!;
    colors[i * 3 + 2] = batch.data[o + 7]!;
  }
  mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = shadow;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.computeBoundingSphere();
  return mesh;
}

type Tile = { mesh: InstancedMesh; x: number; z: number; reach: number };

/** Every plant and rock, one instanced draw per kind (per tile when small). */
export function Flora({ layout }: { layout: FloraLayout }) {
  const group = useRef<Group>(null);
  const built = useMemo(() => {
    const geometries: BufferGeometry[] = [];
    const materials: MeshStandardMaterial[] = [];
    const meshes: InstancedMesh[] = [];
    const tiles: Tile[] = [];
    for (const kind of FLORA_KINDS) {
      const batch = layout.batches[kind];
      if (batch.count === 0) continue;
      const look = LOOK[kind];
      const geometry = buildFloraGeometry(kind);
      const material = makeFoliageMaterial(look);
      geometries.push(geometry);
      materials.push(material);
      if (!batch.tiles) {
        meshes.push(
          makeMesh(geometry, material, batch, 0, batch.count, look.shadow),
        );
        continue;
      }
      for (const tile of batch.tiles) {
        const mesh = makeMesh(
          geometry,
          material,
          batch,
          tile.start,
          tile.count,
          look.shadow,
        );
        meshes.push(mesh);
        tiles.push({
          mesh,
          x: tile.centerX,
          z: tile.centerZ,
          reach: look.reach,
        });
      }
    }
    return { geometries, materials, meshes, tiles };
  }, [layout]);

  useEffect(() => {
    const parent = group.current;
    if (!parent) return;
    for (const mesh of built.meshes) parent.add(mesh);
    return () => {
      for (const mesh of built.meshes) {
        parent.remove(mesh);
        mesh.dispose();
      }
      for (const geometry of built.geometries) geometry.dispose();
      for (const material of built.materials) material.dispose();
    };
  }, [built]);

  useFrame(({ camera }) => {
    for (const tile of built.tiles) {
      const dx = tile.x - camera.position.x;
      const dz = tile.z - camera.position.z;
      tile.mesh.visible = dx * dx + dz * dz < tile.reach * tile.reach;
    }
  });

  return <group ref={group} />;
}
