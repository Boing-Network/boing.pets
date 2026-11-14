import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { pastureDayLive } from "./MeadowAtmosphere";
import { meadowHeight } from "./meadowHeight";
import {
  patchFlowers,
  patchTallGrass,
  placedRocks,
  scatteredFlowers,
  scatteredGrass,
  scatteredRocks,
  meadowFencePieces,
  mulberry,
  type DecorInstance,
  type FencePiece,
} from "./meadowDecor";
import {
  POND_RIM_LIFT,
  POND_RIM_WIDTH,
  POND_WATER_LIFT,
  lilyPondEllipse,
} from "./meadowFootprints";
import {
  MEADOW_APRON_TREE_SPOTS,
  MEADOW_BUSH_SPOTS,
  MEADOW_EXTRA_BUSH_SPOTS,
  MEADOW_ROCK_SPOTS,
  MEADOW_TREE_SPOTS,
  PASTURE_GROUND_RADIUS,
} from "./meadowLayout";
import { applyInstancedFade, useOccluderFades } from "./meadowInstanceFade";
import { applyMeadowWind } from "./meadowWind";

const ALL_TREE_SPOTS = [...MEADOW_TREE_SPOTS, ...MEADOW_APRON_TREE_SPOTS];
const ALL_BUSH_SPOTS = [...MEADOW_BUSH_SPOTS, ...MEADOW_EXTRA_BUSH_SPOTS];

function makeGrassTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#5b9a55";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3200; i++) {
    const x = mulberry(i * 17) * size;
    const y = mulberry(i * 31 + 9) * size;
    const patch = mulberry(i * 13);
    const tone = 60 + patch * 70;
    const r = 36 + tone * 0.28 + (patch > 0.72 ? 24 : 0);
    const g = tone;
    const b = 36 + tone * 0.12;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
    ctx.fillRect(x, y, 3 + mulberry(i) * 8, 2 + mulberry(i + 3) * 6);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function Terrain({
  preferPerf,
  onWalk,
  enabled,
}: {
  preferPerf: boolean;
  onWalk: (x: number, z: number) => void;
  enabled: boolean;
}) {
  const geom = useMemo(() => {
    const segs = preferPerf ? 48 : 80;
    const g = new THREE.CircleGeometry(PASTURE_GROUND_RADIUS, segs);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = meadowHeight(x, z);
      pos.setY(i, y);
      const n = Math.sin(x * 0.19) * Math.cos(z * 0.16);
      const lush = Math.max(0, Math.min(1, 0.5 - y * 0.45 + n * 0.25));
      color.setRGB(
        0.38 + lush * 0.05 + (1 - lush) * 0.18,
        0.48 + lush * 0.22,
        0.28 + lush * 0.08,
      );
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    pos.needsUpdate = true;
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [preferPerf]);
  const map = useMemo(() => makeGrassTexture(), []);
  const pondHole = useMemo(() => lilyPondEllipse(), []);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useLayoutEffect(() => {
    const material = mat.current;
    const hole = pondHole;
    if (!material || !hole) return;
    const rx = Math.max(0.5, hole.rx - 0.12);
    const rz = Math.max(0.5, hole.rz - 0.12);
    material.customProgramCacheKey = () => "pasture-terrain-pond-hole";
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uPond = {
        value: new THREE.Vector4(hole.x, hole.z, rx, rz),
      };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec2 vMeadowXZ;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vMeadowXZ = position.xz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec2 vMeadowXZ;
uniform vec4 uPond;`,
        )
        .replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>
vec2 pondDelta = (vMeadowXZ - uPond.xy) / uPond.zw;
if (dot(pondDelta, pondDelta) < 1.0) discard;`,
        );
    };
    material.needsUpdate = true;
  }, [pondHole]);
  return (
    <mesh
      geometry={geom}
      position={[0, 0, 0]}
      receiveShadow
      onPointerDown={(event) => {
        if (!enabled) return;
        event.stopPropagation();
        onWalk(event.point.x, event.point.z);
      }}
    >
      <meshStandardMaterial
        ref={mat}
        map={map ?? undefined}
        vertexColors
        color={map ? "#d5e8c0" : "#5fa86a"}
        roughness={0.95}
        metalness={0}
      />
    </mesh>
  );
}

function InstancedDecor({
  count,
  kind,
  preferPerf,
}: {
  count: number;
  kind: "grass" | "flower" | "rock";
  preferPerf: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const colors = useMemo(() => {
    if (kind === "flower") return ["#ef9bb8", "#f2d38a", "#c9a0e8", "#f4a27a"];
    if (kind === "rock") return ["#8b8578", "#6f6a62", "#9a9488"];
    return ["#3f7a3e", "#4d8a4a", "#5a9a52"];
  }, [kind]);

  const items = useMemo((): DecorInstance[] => {
    if (kind === "grass") return scatteredGrass(preferPerf);
    if (kind === "flower") return scatteredFlowers(preferPerf);
    return scatteredRocks(preferPerf);
  }, [kind, preferPerf]);

  useLayoutEffect(() => {
    const inst = mesh.current;
    if (!inst) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    items.forEach((row, i) => {
      dummy.position.set(row.x, row.y, row.z);
      dummy.rotation.set(0, row.rotY, 0);
      dummy.scale.setScalar(row.scale);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      if (kind !== "grass") {
        color.set(row.color || colors[i % colors.length]!);
        inst.setColorAt(i, color);
      }
    });
    inst.count = items.length;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    if (mat.current && kind === "grass" && !preferPerf) {
      applyMeadowWind(mat.current, 0.16);
    }
  }, [items, kind, colors, preferPerf]);

  if (kind === "grass") {
    return (
      <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
        <coneGeometry args={[0.06, 0.28, 5]} />
        <meshStandardMaterial ref={mat} color="#4c8a48" roughness={0.95} />
      </instancedMesh>
    );
  }
  if (kind === "flower") {
    return (
      <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
        <sphereGeometry args={[0.07, 6, 6]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
    );
  }
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <icosahedronGeometry args={[0.22, 0]} />
      <meshStandardMaterial roughness={0.9} flatShading />
    </instancedMesh>
  );
}

function Pond() {
  const pond = lilyPondEllipse();
  if (!pond) return null;
  const { x, z, rx, rz } = pond;
  const ground = meadowHeight(x, z);
  const waterRx = Math.max(0.5, rx - POND_RIM_WIDTH * 0.55);
  const waterRz = Math.max(0.5, rz - POND_RIM_WIDTH * 0.55);
  const inner = Math.max(0.2, 1 - POND_RIM_WIDTH / Math.max(rx, rz));
  const waterTop = ground + POND_WATER_LIFT;
  const basinDepth = 0.22;
  const pads = [
    [0.28, 0.18, 0.55],
    [-0.42, -0.12, 0.44],
    [0.08, -0.48, 0.4],
    [-0.2, 0.42, 0.34],
  ] as const;
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[x, waterTop - basinDepth, z]}
        scale={[rx, rz, 1]}
        renderOrder={2}
      >
        <circleGeometry args={[1, 48]} />
        <meshStandardMaterial color="#6b5a3a" roughness={1} metalness={0} />
      </mesh>
      <mesh
        position={[x, waterTop - basinDepth / 2, z]}
        scale={[waterRx, 1, waterRz]}
        renderOrder={3}
      >
        <cylinderGeometry args={[1, 1, basinDepth, 48]} />
        <meshStandardMaterial
          color="#3e8aaf"
          roughness={0.16}
          metalness={0.12}
          transparent
          opacity={0.9}
          depthWrite
        />
      </mesh>
      <mesh
        position={[x, waterTop - basinDepth / 2, z]}
        scale={[rx, 1, rz]}
        renderOrder={4}
      >
        <cylinderGeometry args={[1, 1, basinDepth, 48, 1, true]} />
        <meshStandardMaterial
          color="#8a7a58"
          roughness={0.92}
          metalness={0}
          side={THREE.DoubleSide}
          depthWrite
        />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[x, ground + POND_RIM_LIFT, z]}
        scale={[rx, rz, 1]}
        renderOrder={5}
      >
        <ringGeometry args={[inner, 1, 48]} />
        <meshStandardMaterial
          color="#8a7a58"
          roughness={0.92}
          metalness={0}
          depthWrite
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </mesh>
      {pads.map(([nx, nz, s], i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, i * 0.7]}
          position={[x + nx * waterRx, waterTop + 0.006, z + nz * waterRz]}
          renderOrder={6}
        >
          <circleGeometry args={[s, 14]} />
          <meshStandardMaterial color="#6f9b5a" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Clouds({ preferPerf }: { preferPerf: boolean }) {
  if (preferPerf) return null;
  const puffs = [
    [18, 24, -28, 4.5],
    [-26, 22, 14, 3.6],
    [32, 26, 18, 5],
    [-34, 23, -20, 4.2],
    [8, 28, 36, 3.8],
  ] as const;
  return (
    <group>
      {puffs.map(([x, y, z, s], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[s, 10, 8]} />
          <meshStandardMaterial
            color="#f6f8fb"
            roughness={1}
            transparent
            opacity={0.72}
          />
        </mesh>
      ))}
    </group>
  );
}

function MeadowTrees({ preferPerf }: { preferPerf: boolean }) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const canopy = useRef<THREE.InstancedMesh>(null);
  const puff = useRef<THREE.InstancedMesh>(null);
  const trunkMat = useRef<THREE.MeshStandardMaterial>(null);
  const canopyMat = useRef<THREE.MeshStandardMaterial>(null);
  const puffMat = useRef<THREE.MeshStandardMaterial>(null);
  const count = ALL_TREE_SPOTS.length;
  useOccluderFades([trunk, canopy, puff], ALL_TREE_SPOTS, 1.5, 2.05);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const write = (mesh: THREE.InstancedMesh | null, offset: THREE.Vector3) => {
      if (!mesh) return;
      ALL_TREE_SPOTS.forEach(([x, z], i) => {
        const y = meadowHeight(x, z);
        dummy.position.set(x + offset.x, y + offset.y, z + offset.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    write(trunk.current, new THREE.Vector3(0, 0.75, 0));
    write(canopy.current, new THREE.Vector3(0, 2.05, 0));
    if (!preferPerf) write(puff.current, new THREE.Vector3(0.45, 1.7, 0.2));
    if (trunkMat.current) applyInstancedFade(trunkMat.current, 0);
    if (canopyMat.current)
      applyInstancedFade(canopyMat.current, preferPerf ? 0 : 0.045);
    if (!preferPerf && puffMat.current)
      applyInstancedFade(puffMat.current, 0.055);
  }, [preferPerf]);

  const sides = preferPerf ? 5 : 7;
  return (
    <group>
      <instancedMesh
        ref={trunk}
        args={[undefined, undefined, count]}
        castShadow={!preferPerf}
      >
        <cylinderGeometry args={[0.16, 0.26, 1.5, sides]} />
        <meshStandardMaterial ref={trunkMat} color="#6d4a32" roughness={0.9} />
      </instancedMesh>
      <instancedMesh
        ref={canopy}
        args={[undefined, undefined, count]}
        castShadow={!preferPerf}
      >
        <icosahedronGeometry args={[1.05, 0]} />
        <meshStandardMaterial
          ref={canopyMat}
          color="#3f7d4a"
          roughness={0.85}
          flatShading
        />
      </instancedMesh>
      {preferPerf ? null : (
        <instancedMesh
          ref={puff}
          args={[undefined, undefined, count]}
          castShadow
        >
          <icosahedronGeometry args={[0.7, 0]} />
          <meshStandardMaterial
            ref={puffMat}
            color="#4e8d55"
            roughness={0.85}
            flatShading
          />
        </instancedMesh>
      )}
    </group>
  );
}

function MeadowBushes({ preferPerf }: { preferPerf: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const count = ALL_BUSH_SPOTS.length;
  useOccluderFades([mesh], ALL_BUSH_SPOTS, 0.9, 0.4);
  useLayoutEffect(() => {
    const inst = mesh.current;
    if (!inst) return;
    const dummy = new THREE.Object3D();
    ALL_BUSH_SPOTS.forEach(([x, z], i) => {
      const y = meadowHeight(x, z);
      dummy.position.set(x, y + 0.28, z);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.scale.set(0.7 + (i % 3) * 0.15, 0.55, 0.7 + ((i + 1) % 3) * 0.12);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (mat.current) applyInstancedFade(mat.current, preferPerf ? 0 : 0.08);
  }, [preferPerf]);
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, count]}
      castShadow={!preferPerf}
    >
      <sphereGeometry args={[0.42, preferPerf ? 6 : 8, preferPerf ? 5 : 6]} />
      <meshStandardMaterial ref={mat} color="#3d6e3a" roughness={0.88} />
    </instancedMesh>
  );
}

function InstancedFencePart({
  pieces,
  color,
  roughness,
  preferPerf,
}: {
  pieces: FencePiece[];
  color: string;
  roughness: number;
  preferPerf: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const inst = mesh.current;
    if (!inst || !pieces.length) return;
    const dummy = new THREE.Object3D();
    pieces.forEach((piece, index) => {
      dummy.position.set(piece.x, piece.y, piece.z);
      dummy.rotation.set(0, piece.rotY, 0);
      dummy.scale.set(piece.scaleX, piece.scaleY, piece.scaleZ);
      dummy.updateMatrix();
      inst.setMatrixAt(index, dummy.matrix);
    });
    inst.count = pieces.length;
    inst.instanceMatrix.needsUpdate = true;
  }, [pieces]);
  if (!pieces.length) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, pieces.length]}
      castShadow={!preferPerf}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </instancedMesh>
  );
}

function MeadowFences({ preferPerf }: { preferPerf: boolean }) {
  const pieces = useMemo(() => meadowFencePieces(), []);
  const tops = useMemo(
    () => pieces.filter((row) => row.kind === "rail-top"),
    [pieces],
  );
  const bottoms = useMemo(
    () => pieces.filter((row) => row.kind === "rail-bottom"),
    [pieces],
  );
  const posts = useMemo(
    () => pieces.filter((row) => row.kind === "post"),
    [pieces],
  );
  return (
    <group>
      <InstancedFencePart
        pieces={tops}
        color="#8a6a48"
        roughness={0.85}
        preferPerf={preferPerf}
      />
      <InstancedFencePart
        pieces={bottoms}
        color="#7a5a3c"
        roughness={0.85}
        preferPerf={preferPerf}
      />
      <InstancedFencePart
        pieces={posts}
        color="#6a4e32"
        roughness={0.9}
        preferPerf={preferPerf}
      />
    </group>
  );
}

function Butterflies({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const inst = mesh.current;
    if (!inst) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const seed = i * 1.7 + 2;
      const cx = Math.sin(seed) * 26;
      const cz = Math.cos(seed * 1.3) * 24;
      const x = cx + Math.sin(t * 0.7 + seed) * 3.2;
      const z = cz + Math.cos(t * 0.9 + seed) * 3.2;
      const y = 1.15 + meadowHeight(x, z) + Math.sin(t * 3.2 + seed) * 0.45;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, t + seed, Math.sin(t * 10 + seed) * 0.5);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <planeGeometry args={[0.2, 0.13]} />
      <meshStandardMaterial
        color="#f3c6e4"
        side={THREE.DoubleSide}
        roughness={0.55}
      />
    </instancedMesh>
  );
}

function Fireflies({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const inst = mesh.current;
    if (!inst) return;
    inst.visible = pastureDayLive.showFireflies;
    if (!inst.visible) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const seed = i * 2.1;
      const x = Math.sin(seed + t * 0.25) * 30;
      const z = Math.cos(seed * 0.8 + t * 0.22) * 30;
      const y = 0.8 + meadowHeight(x, z) + Math.sin(t * 2.4 + seed) * 0.5;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(0.7 + Math.sin(t * 5 + seed) * 0.25);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, count]}
      visible={false}
    >
      <sphereGeometry args={[0.05, 6, 6]} />
      <meshStandardMaterial
        color="#d6ff9a"
        emissive="#b6ff6a"
        emissiveIntensity={1.4}
        roughness={0.4}
      />
    </instancedMesh>
  );
}

function Birds({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const inst = mesh.current;
    if (!inst) return;
    const t = clock.elapsedTime * 0.15;
    for (let i = 0; i < count; i++) {
      const a = t + i * ((Math.PI * 2) / count);
      const r = 22 + i * 3;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.7;
      dummy.position.set(x, 11 + (i % 3), z);
      dummy.rotation.set(0, -a + Math.PI / 2, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <coneGeometry args={[0.12, 0.4, 3]} />
      <meshStandardMaterial color="#3a3a48" roughness={0.7} />
    </instancedMesh>
  );
}

function MeadowPatches({ preferPerf }: { preferPerf: boolean }) {
  const flowerMesh = useRef<THREE.InstancedMesh>(null);
  const grassMesh = useRef<THREE.InstancedMesh>(null);
  const grassMat = useRef<THREE.MeshStandardMaterial>(null);
  const rockMesh = useRef<THREE.InstancedMesh>(null);
  const rockMat = useRef<THREE.MeshStandardMaterial>(null);
  const flowers = useMemo(() => patchFlowers(preferPerf), [preferPerf]);
  const tufts = useMemo(() => patchTallGrass(preferPerf), [preferPerf]);
  const rocks = useMemo(() => placedRocks(), []);
  const flowerCount = Math.max(flowers.length, 1);
  const grassCount = Math.max(tufts.length, 1);
  useOccluderFades([rockMesh], MEADOW_ROCK_SPOTS, 0.75, 0.28);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const flower = flowerMesh.current;
    if (flower) {
      flowers.forEach((row, i) => {
        dummy.position.set(row.x, row.y, row.z);
        dummy.scale.setScalar(row.scale);
        dummy.rotation.set(0, row.rotY, 0);
        dummy.updateMatrix();
        flower.setMatrixAt(i, dummy.matrix);
        color.set(row.color || "#ef9bb8");
        flower.setColorAt(i, color);
      });
      flower.count = flowers.length;
      flower.instanceMatrix.needsUpdate = true;
      if (flower.instanceColor) flower.instanceColor.needsUpdate = true;
    }
    const grass = grassMesh.current;
    if (grass) {
      tufts.forEach((row, i) => {
        dummy.position.set(row.x, row.y, row.z);
        dummy.scale.setScalar(row.scale);
        dummy.rotation.set(0, row.rotY, 0);
        dummy.updateMatrix();
        grass.setMatrixAt(i, dummy.matrix);
      });
      grass.count = tufts.length;
      grass.instanceMatrix.needsUpdate = true;
      if (grassMat.current && !preferPerf)
        applyMeadowWind(grassMat.current, 0.2);
    }
    const rockInst = rockMesh.current;
    if (rockInst) {
      rocks.forEach((row, i) => {
        dummy.position.set(row.x, row.y, row.z);
        dummy.rotation.set(mulberry(i) * 0.4, row.rotY, mulberry(i + 2) * 0.3);
        dummy.scale.setScalar(row.scale);
        dummy.updateMatrix();
        rockInst.setMatrixAt(i, dummy.matrix);
      });
      rockInst.count = rocks.length;
      rockInst.instanceMatrix.needsUpdate = true;
      if (rockMat.current) applyInstancedFade(rockMat.current, 0);
    }
  }, [preferPerf, flowers, tufts, rocks]);

  return (
    <group>
      <instancedMesh
        ref={flowerMesh}
        args={[undefined, undefined, flowerCount]}
      >
        <sphereGeometry args={[0.08, 6, 6]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={grassMesh} args={[undefined, undefined, grassCount]}>
        <coneGeometry args={[0.07, 0.55, 5]} />
        <meshStandardMaterial ref={grassMat} color="#4a8a46" roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={rockMesh}
        args={[undefined, undefined, Math.max(rocks.length, 1)]}
        castShadow={!preferPerf}
      >
        <icosahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial
          ref={rockMat}
          color="#8a8478"
          roughness={0.92}
          flatShading
        />
      </instancedMesh>
    </group>
  );
}

export function Meadow({
  preferPerf,
  onWalk,
  walkEnabled,
}: {
  preferPerf: boolean;
  onWalk: (x: number, z: number) => void;
  walkEnabled: boolean;
}) {
  const grass = preferPerf ? 360 : 980;
  const flowers = preferPerf ? 90 : 200;
  const rocks = preferPerf ? 20 : 48;
  return (
    <group>
      <Clouds preferPerf={preferPerf} />
      <Terrain preferPerf={preferPerf} onWalk={onWalk} enabled={walkEnabled} />
      <InstancedDecor count={grass} kind="grass" preferPerf={preferPerf} />
      <InstancedDecor count={flowers} kind="flower" preferPerf={preferPerf} />
      <InstancedDecor count={rocks} kind="rock" preferPerf={preferPerf} />
      <Pond />
      <MeadowTrees preferPerf={preferPerf} />
      <MeadowBushes preferPerf={preferPerf} />
      <MeadowPatches preferPerf={preferPerf} />
      <MeadowFences preferPerf={preferPerf} />
      {preferPerf ? null : (
        <>
          <Butterflies count={16} />
          <Birds count={5} />
        </>
      )}
      <Fireflies count={preferPerf ? 8 : 22} />
    </group>
  );
}
