import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PASTURE_ZONE } from "../world/config/zones";
import { pastureDayLive } from "./MeadowAtmosphere";
import { meadowHeight, PASTURE_FLATTEN } from "./meadowHeight";
import {
  MEADOW_BUSH_SPOTS,
  MEADOW_FENCES,
  MEADOW_TREE_SPOTS,
  PASTURE_GROUND_RADIUS,
} from "./meadowLayout";
import { applyMeadowWind } from "./meadowWind";

function mulberry(seed: number) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function isDecorClear(x: number, z: number) {
  if (Math.abs(x) < 1.2 || Math.abs(z) < 1.2) return false;
  for (const spot of PASTURE_FLATTEN) {
    if (Math.hypot(x - spot.x, z - spot.z) < spot.radius * 0.72) return false;
  }
  return Math.hypot(x, z) < PASTURE_GROUND_RADIUS - 3;
}

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

  useLayoutEffect(() => {
    const inst = mesh.current;
    if (!inst) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const seedBase = kind === "grass" ? 11 : kind === "flower" ? 29 : 47;
    let placed = 0;
    let i = 0;
    while (placed < count && i < count * 8) {
      const u = mulberry(seedBase + i * 3);
      const v = mulberry(seedBase + i * 3 + 1);
      const r = Math.sqrt(u) * (PASTURE_GROUND_RADIUS - 4);
      const a = v * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      i += 1;
      if (!isDecorClear(x, z)) continue;
      const y = meadowHeight(x, z);
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, mulberry(seedBase + i) * Math.PI * 2, 0);
      if (kind === "grass") {
        dummy.scale.setScalar(0.7 + mulberry(i * 5) * 1.1);
      } else if (kind === "flower") {
        dummy.scale.setScalar(0.8 + mulberry(i * 5) * 0.6);
      } else {
        dummy.scale.setScalar(0.6 + mulberry(i * 5) * 0.9);
      }
      dummy.updateMatrix();
      inst.setMatrixAt(placed, dummy.matrix);
      if (kind !== "grass") {
        color.set(colors[placed % colors.length]!);
        inst.setColorAt(placed, color);
      }
      placed += 1;
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    if (mat.current && kind === "grass" && !preferPerf) {
      applyMeadowWind(mat.current, 0.16);
    }
  }, [count, kind, colors, preferPerf]);

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
  const pond = PASTURE_ZONE.landmarks.find((item) => item.id === "lily-pond");
  if (!pond) return null;
  const x = pond.position.x;
  const z = pond.position.z;
  const radius = Math.min(pond.width, pond.depth) / 2 - 0.35;
  const y = meadowHeight(x, z) + 0.08;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]} renderOrder={1}>
      <circleGeometry args={[radius, 28]} />
      <meshStandardMaterial
        color="#5aa0c4"
        roughness={0.18}
        metalness={0.1}
        transparent
        opacity={0.82}
      />
    </mesh>
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
  const canopyMat = useRef<THREE.MeshStandardMaterial>(null);
  const puffMat = useRef<THREE.MeshStandardMaterial>(null);
  const count = MEADOW_TREE_SPOTS.length;

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const write = (mesh: THREE.InstancedMesh | null, offset: THREE.Vector3) => {
      if (!mesh) return;
      MEADOW_TREE_SPOTS.forEach(([x, z], i) => {
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
    if (!preferPerf && canopyMat.current)
      applyMeadowWind(canopyMat.current, 0.045);
    if (!preferPerf && puffMat.current) applyMeadowWind(puffMat.current, 0.055);
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
        <meshStandardMaterial color="#6d4a32" roughness={0.9} />
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
  const count = MEADOW_BUSH_SPOTS.length;
  useLayoutEffect(() => {
    const inst = mesh.current;
    if (!inst) return;
    const dummy = new THREE.Object3D();
    MEADOW_BUSH_SPOTS.forEach(([x, z], i) => {
      const y = meadowHeight(x, z);
      dummy.position.set(x, y + 0.28, z);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.scale.set(0.7 + (i % 3) * 0.15, 0.55, 0.7 + ((i + 1) % 3) * 0.12);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (mat.current && !preferPerf) applyMeadowWind(mat.current, 0.08);
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

function MeadowFences({ preferPerf }: { preferPerf: boolean }) {
  return (
    <group>
      {MEADOW_FENCES.map((rail, i) => {
        const midX = (rail.x1 + rail.x2) / 2;
        const midZ = (rail.z1 + rail.z2) / 2;
        const len = Math.hypot(rail.x2 - rail.x1, rail.z2 - rail.z1);
        const angle = Math.atan2(rail.x2 - rail.x1, rail.z2 - rail.z1);
        const y = meadowHeight(midX, midZ);
        const posts = Math.max(2, Math.round(len / 2.1) + 1);
        return (
          <group key={i} position={[midX, y, midZ]} rotation={[0, angle, 0]}>
            <mesh position={[0, 0.7, 0]} castShadow={!preferPerf}>
              <boxGeometry args={[0.1, 0.1, len]} />
              <meshStandardMaterial color="#8a6a48" roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.42, 0]} castShadow={!preferPerf}>
              <boxGeometry args={[0.08, 0.08, len]} />
              <meshStandardMaterial color="#7a5a3c" roughness={0.85} />
            </mesh>
            {Array.from({ length: posts }, (_, p) => {
              const z = -len / 2 + (p / (posts - 1)) * len;
              return (
                <mesh key={p} position={[0, 0.48, z]} castShadow={!preferPerf}>
                  <boxGeometry args={[0.14, 0.96, 0.14]} />
                  <meshStandardMaterial color="#6a4e32" roughness={0.9} />
                </mesh>
              );
            })}
          </group>
        );
      })}
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

export function Meadow({
  preferPerf,
  onWalk,
  walkEnabled,
}: {
  preferPerf: boolean;
  onWalk: (x: number, z: number) => void;
  walkEnabled: boolean;
}) {
  const grass = preferPerf ? 280 : 780;
  const flowers = preferPerf ? 70 : 160;
  const rocks = preferPerf ? 16 : 36;
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
