import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PASTURE_ZONE } from "../world/config/zones";
import { meadowHeight, PASTURE_FLATTEN } from "./meadowHeight";
import { MEADOW_TREE_SPOTS, PASTURE_GROUND_RADIUS } from "./meadowLayout";

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
  for (let i = 0; i < 2400; i++) {
    const x = mulberry(i * 17) * size;
    const y = mulberry(i * 31 + 9) * size;
    const tone = 70 + mulberry(i * 47) * 50;
    ctx.fillStyle = `rgba(${40 + tone * 0.2}, ${tone}, ${40 + tone * 0.15}, 0.55)`;
    ctx.fillRect(x, y, 2 + mulberry(i) * 4, 1 + mulberry(i + 3) * 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function SkyDome() {
  const tex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#7eb7e6");
    g.addColorStop(0.42, "#b9d7ef");
    g.addColorStop(0.68, "#e7e0c8");
    g.addColorStop(0.82, "#d7e6c4");
    g.addColorStop(1, "#c3d6a8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);
  return (
    <mesh rotation={[0, 0, 0]}>
      <sphereGeometry args={[150, 24, 16]} />
      <meshBasicMaterial map={tex ?? undefined} side={THREE.BackSide} />
    </mesh>
  );
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
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, meadowHeight(x, z));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [preferPerf]);
  const map = useMemo(() => makeGrassTexture(), []);
  return (
    <mesh
      geometry={geom}
      position={[0, 0, 0]}
      receiveShadow={false}
      onPointerDown={(event) => {
        if (!enabled) return;
        event.stopPropagation();
        onWalk(event.point.x, event.point.z);
      }}
    >
      <meshStandardMaterial
        map={map ?? undefined}
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
  }, [count, kind, colors, preferPerf]);

  if (kind === "grass") {
    return (
      <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
        <coneGeometry args={[0.06, 0.28, 5]} />
        <meshStandardMaterial color="#4c8a48" roughness={0.95} />
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
  }, [preferPerf]);

  const sides = preferPerf ? 5 : 7;
  return (
    <group>
      <instancedMesh ref={trunk} args={[undefined, undefined, count]}>
        <cylinderGeometry args={[0.16, 0.26, 1.5, sides]} />
        <meshStandardMaterial color="#6d4a32" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={canopy} args={[undefined, undefined, count]}>
        <icosahedronGeometry args={[1.05, 0]} />
        <meshStandardMaterial color="#3f7d4a" roughness={0.85} flatShading />
      </instancedMesh>
      {preferPerf ? null : (
        <instancedMesh ref={puff} args={[undefined, undefined, count]}>
          <icosahedronGeometry args={[0.7, 0]} />
          <meshStandardMaterial color="#4e8d55" roughness={0.85} flatShading />
        </instancedMesh>
      )}
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
  const grass = preferPerf ? 280 : 780;
  const flowers = preferPerf ? 70 : 160;
  const rocks = preferPerf ? 16 : 36;
  return (
    <group>
      <SkyDome />
      <mesh position={[42, 36, -34]}>
        <sphereGeometry args={[3.2, 16, 16]} />
        <meshBasicMaterial color="#fff3c8" />
      </mesh>
      <Clouds preferPerf={preferPerf} />
      <Terrain preferPerf={preferPerf} onWalk={onWalk} enabled={walkEnabled} />
      <InstancedDecor count={grass} kind="grass" preferPerf={preferPerf} />
      <InstancedDecor count={flowers} kind="flower" preferPerf={preferPerf} />
      <InstancedDecor count={rocks} kind="rock" preferPerf={preferPerf} />
      <Pond />
      <MeadowTrees preferPerf={preferPerf} />
    </group>
  );
}
