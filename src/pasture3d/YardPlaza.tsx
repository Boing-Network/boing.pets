/** Rooftop plaza dressing: parapet, chain-link, skyline, instanced street decor. */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PASTURE_ZONE } from "../world/config/zones";
import { mulberry } from "./meadowDecor";
import { meadowHeight } from "./meadowHeight";
import {
  MEADOW_BUSH_SPOTS,
  MEADOW_EXTRA_BUSH_SPOTS,
  MEADOW_ROCK_SPOTS,
  MEADOW_TREE_SPOTS,
} from "./meadowLayout";
import {
  makeChainTexture,
  makeGraffitiTexture,
  makeWindowTexture,
  YARD,
} from "./yardChrome";

const BOUNDS = PASTURE_ZONE.bounds;
const PARAPET_INSET = 0.15;
const PARAPET_H = 1.05;
const PARAPET_T = 0.42;

type Spot = {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  sx?: number;
  sy?: number;
  sz?: number;
};

function writeInstances(mesh: THREE.InstancedMesh | null, items: Spot[]) {
  if (!mesh) return;
  const dummy = new THREE.Object3D();
  items.forEach((row, i) => {
    dummy.position.set(row.x, row.y, row.z);
    dummy.rotation.set(0, row.rotY, 0);
    dummy.scale.set(
      row.sx ?? row.scale,
      row.sy ?? row.scale,
      row.sz ?? row.scale,
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
}

function Parapet() {
  const { minX, maxX, minZ, maxZ } = BOUNDS;
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const y = PARAPET_H / 2;
  const walls: Array<{ x: number; z: number; w: number; d: number }> = [
    {
      x: midX,
      z: maxZ + PARAPET_INSET + PARAPET_T / 2,
      w: width + PARAPET_T * 2,
      d: PARAPET_T,
    },
    {
      x: midX,
      z: minZ - PARAPET_INSET - PARAPET_T / 2,
      w: width + PARAPET_T * 2,
      d: PARAPET_T,
    },
    {
      x: maxX + PARAPET_INSET + PARAPET_T / 2,
      z: midZ,
      w: PARAPET_T,
      d: depth,
    },
    {
      x: minX - PARAPET_INSET - PARAPET_T / 2,
      z: midZ,
      w: PARAPET_T,
      d: depth,
    },
  ];
  return (
    <group>
      {walls.map((wall, i) => (
        <group key={i}>
          <mesh position={[wall.x, y, wall.z]} receiveShadow>
            <boxGeometry args={[wall.w, PARAPET_H, wall.d]} />
            <meshStandardMaterial color={YARD.concrete} roughness={0.92} />
          </mesh>
          <mesh position={[wall.x, PARAPET_H + 0.05, wall.z]} receiveShadow>
            <boxGeometry args={[wall.w + 0.08, 0.1, wall.d + 0.08]} />
            <meshStandardMaterial color={YARD.concreteDark} roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ChainLink({ preferPerf }: { preferPerf: boolean }) {
  const map = useMemo(() => makeChainTexture(), []);
  const { minX, maxX, minZ, maxZ } = BOUNDS;
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;
  const width = maxX - minX + 1.2;
  const depth = maxZ - minZ + 1.2;
  const y = PARAPET_H + 1.05;
  const outward = PARAPET_INSET + PARAPET_T + 0.04;
  const panels: Array<{ x: number; z: number; rotY: number; w: number }> = [
    { x: midX, z: maxZ + outward, rotY: 0, w: width },
    { x: midX, z: minZ - outward, rotY: 0, w: width },
    { x: maxX + outward, z: midZ, rotY: Math.PI / 2, w: depth },
    { x: minX - outward, z: midZ, rotY: Math.PI / 2, w: depth },
  ];
  const posts = useMemo(() => {
    const postEvery = preferPerf ? 8 : 5;
    const items: Spot[] = [];
    for (let x = minX; x <= maxX + 0.1; x += postEvery) {
      items.push(
        { x, y: PARAPET_H + 1.05, z: maxZ + outward, rotY: 0, scale: 1 },
        { x, y: PARAPET_H + 1.05, z: minZ - outward, rotY: 0, scale: 1 },
      );
    }
    for (let z = minZ; z <= maxZ + 0.1; z += postEvery) {
      items.push(
        { x: maxX + outward, y: PARAPET_H + 1.05, z, rotY: 0, scale: 1 },
        { x: minX - outward, y: PARAPET_H + 1.05, z, rotY: 0, scale: 1 },
      );
    }
    return items;
  }, [minX, maxX, minZ, maxZ, outward, preferPerf]);
  const postMesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => writeInstances(postMesh.current, posts), [posts]);
  return (
    <group>
      {panels.map((panel, i) => (
        <mesh
          key={i}
          position={[panel.x, y, panel.z]}
          rotation={[0, panel.rotY, 0]}
        >
          <planeGeometry args={[panel.w, 2.1]} />
          <meshStandardMaterial
            map={map ?? undefined}
            color="#8a8a86"
            transparent
            opacity={0.92}
            side={THREE.DoubleSide}
            depthWrite={false}
            roughness={0.4}
            metalness={0.45}
            alphaTest={0.12}
          />
        </mesh>
      ))}
      <instancedMesh
        ref={postMesh}
        args={[undefined, undefined, Math.max(posts.length, 1)]}
      >
        <cylinderGeometry args={[0.05, 0.06, 2.2, 5]} />
        <meshStandardMaterial
          color={YARD.metal}
          roughness={0.45}
          metalness={0.4}
        />
      </instancedMesh>
    </group>
  );
}

function Skyline({ preferPerf }: { preferPerf: boolean }) {
  const count = preferPerf ? 22 : 50;
  const capCount = preferPerf ? 0 : Math.floor(count * 0.45);
  const windowMap = useMemo(
    () => (preferPerf ? null : makeWindowTexture()),
    [preferPerf],
  );
  const spots = useMemo(() => {
    const items: Array<Spot & { color: string }> = [];
    const caps: Spot[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + mulberry(i) * 0.28;
      const r = 72 + mulberry(i * 3) * 40;
      const h = 14 + mulberry(i * 5) * 34;
      const w = 4 + mulberry(i * 7) * 7;
      const d = 4 + mulberry(i * 9) * 6;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      items.push({
        x,
        y: -8 + h / 2,
        z,
        rotY: a + Math.PI / 2,
        scale: 1,
        sx: w,
        sy: h,
        sz: d,
        color: "#ffffff",
      });
      if (caps.length < capCount && i % 2 === 0) {
        const capH = 6 + mulberry(i * 11) * 12;
        caps.push({
          x,
          y: -8 + h + capH / 2,
          z,
          rotY: a + Math.PI / 2,
          scale: 1,
          sx: w * 0.62,
          sy: capH,
          sz: d * 0.62,
        });
      }
    }
    return { items, caps };
  }, [count, capCount]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const inst = mesh.current;
    if (!inst) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    spots.items.forEach((row, i) => {
      dummy.position.set(row.x, row.y, row.z);
      dummy.rotation.set(0, row.rotY, 0);
      dummy.scale.set(row.sx ?? 1, row.sy ?? 1, row.sz ?? 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      color.set(row.color);
      inst.setColorAt(i, color);
    });
    inst.count = spots.items.length;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    writeInstances(caps.current, spots.caps);
  }, [spots]);
  return (
    <group>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, count]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          map={windowMap ?? undefined}
          emissiveMap={windowMap ?? undefined}
          roughness={0.7}
          metalness={0.12}
          emissive="#ffd08a"
          emissiveIntensity={preferPerf ? 0.2 : 0.7}
        />
      </instancedMesh>
      {capCount ? (
        <instancedMesh
          ref={caps}
          args={[undefined, undefined, capCount]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            map={windowMap ?? undefined}
            emissiveMap={windowMap ?? undefined}
            color="#2a2a2c"
            roughness={0.7}
            metalness={0.12}
            emissive="#ffd08a"
            emissiveIntensity={0.65}
          />
        </instancedMesh>
      ) : null}
    </group>
  );
}

function InstancedBoxes({
  items,
  color,
  roughness = 0.85,
  geometry = "box",
}: {
  items: Spot[];
  color: string;
  roughness?: number;
  geometry?: "box" | "cone" | "cylinder" | "foliage";
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => writeInstances(mesh.current, items), [items]);
  if (!items.length) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, items.length]}>
      {geometry === "cone" ? (
        <coneGeometry args={[0.18, 0.42, 8]} />
      ) : geometry === "cylinder" ? (
        <cylinderGeometry args={[0.28, 0.32, 0.5, 8]} />
      ) : geometry === "foliage" ? (
        <sphereGeometry args={[0.32, 8, 6]} />
      ) : (
        <boxGeometry args={[1, 1, 1]} />
      )}
      <meshStandardMaterial color={color} roughness={roughness} />
    </instancedMesh>
  );
}

function StickerWalls({ preferPerf }: { preferPerf: boolean }) {
  const spots = useMemo(() => {
    const src = preferPerf ? MEADOW_TREE_SPOTS.slice(0, 6) : MEADOW_TREE_SPOTS;
    return src.map(([x, z], i) => {
      const y = meadowHeight(x, z) + 0.85;
      return {
        x,
        y,
        z,
        rotY: (i % 4) * 0.4,
        scale: 1,
        sx: 1.8,
        sy: 1.6,
        sz: 0.12,
      } satisfies Spot;
    });
  }, [preferPerf]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const map = useMemo(() => makeGraffitiTexture(3), []);
  useLayoutEffect(() => writeInstances(mesh.current, spots), [spots]);
  if (!spots.length) return null;
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, spots.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        map={map ?? undefined}
        color="#f0ece4"
        roughness={0.9}
      />
    </instancedMesh>
  );
}

function plazaDecor(preferPerf: boolean) {
  const cones: Spot[] = (
    preferPerf ? MEADOW_ROCK_SPOTS.slice(0, 8) : MEADOW_ROCK_SPOTS
  ).map(([x, z], i) => ({
    x,
    y: meadowHeight(x, z) + 0.22,
    z,
    rotY: i,
    scale: 1,
  }));
  const crates: Spot[] = (
    preferPerf ? MEADOW_BUSH_SPOTS.slice(0, 8) : MEADOW_BUSH_SPOTS
  ).map(([x, z], i) => ({
    x,
    y: meadowHeight(x, z) + 0.28,
    z,
    rotY: i * 0.5,
    scale: 1,
    sx: 0.55 + (i % 3) * 0.1,
    sy: 0.45 + (i % 2) * 0.12,
    sz: 0.55 + ((i + 1) % 3) * 0.08,
  }));
  const planters: Spot[] = (
    preferPerf ? MEADOW_EXTRA_BUSH_SPOTS.slice(0, 8) : MEADOW_EXTRA_BUSH_SPOTS
  ).map(([x, z], i) => ({
    x,
    y: meadowHeight(x, z) + 0.28,
    z,
    rotY: i * 0.3,
    scale: 1,
  }));
  return { cones, crates, planters };
}

export function YardPlaza({ preferPerf }: { preferPerf: boolean }) {
  const decor = useMemo(() => plazaDecor(preferPerf), [preferPerf]);
  return (
    <group>
      <Parapet />
      <ChainLink preferPerf={preferPerf} />
      <Skyline preferPerf={preferPerf} />
      <StickerWalls preferPerf={preferPerf} />
      <InstancedBoxes items={decor.cones} color={YARD.accent} geometry="cone" />
      <InstancedBoxes items={decor.crates} color="#d2b48a" />
      <InstancedBoxes
        items={decor.planters}
        color={YARD.concrete}
        geometry="cylinder"
      />
      <InstancedBoxes
        items={decor.planters.map((row) => ({
          ...row,
          y: row.y + 0.38,
          scale: 1,
          sx: undefined,
          sy: undefined,
          sz: undefined,
        }))}
        color={YARD.foliage}
        geometry="foliage"
      />
    </group>
  );
}
