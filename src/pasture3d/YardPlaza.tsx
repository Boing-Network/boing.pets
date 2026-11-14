/** Distant city skyline plus the street-level Yard district. */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { YardCity } from "./YardCity";
import { mulberry } from "./meadowDecor";
import { makeWindowTexture } from "./yardChrome";

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

function Skyline({ preferPerf }: { preferPerf: boolean }) {
  const count = preferPerf ? 16 : 28;
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
          emissiveIntensity={preferPerf ? 0.15 : 0.4}
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
            emissiveIntensity={0.35}
          />
        </instancedMesh>
      ) : null}
    </group>
  );
}

export function YardPlaza({ preferPerf }: { preferPerf: boolean }) {
  return (
    <group>
      <YardCity preferPerf={preferPerf} />
      <Skyline preferPerf={preferPerf} />
    </group>
  );
}
