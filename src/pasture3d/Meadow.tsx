import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { pastureDayLive } from "./MeadowAtmosphere";
import { meadowHeight } from "./meadowHeight";
import {
  POND_RIM_WIDTH,
  POND_WATER_LIFT,
  lilyPondEllipse,
} from "./meadowFootprints";
import { PASTURE_GROUND_RADIUS } from "./meadowLayout";
import { makeConcreteTexture, YARD } from "./yardChrome";
import { YardOak } from "./YardOak";
import { YardPlaza } from "./YardPlaza";
import { YardSky } from "./YardSky";

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
    const segs = preferPerf ? 36 : 64;
    const size = PASTURE_GROUND_RADIUS * 2;
    const g = new THREE.PlaneGeometry(size, size, segs, segs);
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
      const shade = 0.96 + n * 0.04;
      color.setRGB(0.38 * shade, 0.37 * shade, 0.35 * shade);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    pos.needsUpdate = true;
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [preferPerf]);
  const map = useMemo(() => makeConcreteTexture(), []);
  const pondHole = useMemo(() => lilyPondEllipse(), []);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useLayoutEffect(() => {
    const material = mat.current;
    const hole = pondHole;
    if (!material || !hole) return;
    const rx = Math.max(0.5, hole.rx - 0.12);
    const rz = Math.max(0.5, hole.rz - 0.12);
    material.customProgramCacheKey = () => "yard-terrain-canal-hole";
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
        color={map ? "#7a7670" : YARD.concreteLight}
        roughness={0.92}
        metalness={0}
      />
    </mesh>
  );
}

function Pond() {
  const pond = lilyPondEllipse();
  if (!pond) return null;
  const { x, z, rx, rz } = pond;
  const ground = meadowHeight(x, z);
  const waterTop = ground + POND_WATER_LIFT;
  const basinDepth = 0.28;
  const canalW = rx * 2.2;
  const canalD = rz * 2.2;
  const waterW = Math.max(1, canalW - POND_RIM_WIDTH * 1.6);
  const waterD = Math.max(1, canalD - POND_RIM_WIDTH * 1.6);
  const pads = [
    [0.28, 0.18, 0.45],
    [-0.42, -0.12, 0.36],
    [0.08, -0.48, 0.32],
  ] as const;
  return (
    <group>
      <mesh position={[x, waterTop - basinDepth, z]} receiveShadow>
        <boxGeometry args={[canalW, 0.08, canalD]} />
        <meshStandardMaterial color={YARD.concreteDark} roughness={1} />
      </mesh>
      <mesh position={[x, waterTop - basinDepth / 2, z]} renderOrder={3}>
        <boxGeometry args={[waterW, basinDepth, waterD]} />
        <meshStandardMaterial
          color={YARD.water}
          emissive="#3a6a78"
          emissiveIntensity={0.22}
          roughness={0.16}
          metalness={0.18}
          transparent
          opacity={0.82}
          depthWrite
        />
      </mesh>
      {(
        [
          [canalW / 2, canalD],
          [-canalW / 2, canalD],
        ] as const
      ).map(([px, len], i) => (
        <mesh
          key={`x${i}`}
          position={[x + px, waterTop - basinDepth / 2 + 0.02, z]}
        >
          <boxGeometry args={[0.28, basinDepth + 0.08, len + 0.28]} />
          <meshStandardMaterial color={YARD.concrete} roughness={0.92} />
        </mesh>
      ))}
      {(
        [
          [canalW, canalD / 2],
          [canalW, -canalD / 2],
        ] as const
      ).map(([len, pz], i) => (
        <mesh
          key={`z${i}`}
          position={[x, waterTop - basinDepth / 2 + 0.02, z + pz]}
        >
          <boxGeometry args={[len + 0.28, basinDepth + 0.08, 0.28]} />
          <meshStandardMaterial color={YARD.concrete} roughness={0.92} />
        </mesh>
      ))}
      {pads.map(([nx, nz, s], i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, i * 0.7]}
          position={[
            x + nx * (waterW / 2),
            waterTop + 0.006,
            z + nz * (waterD / 2),
          ]}
          renderOrder={6}
        >
          <circleGeometry args={[s, 10]} />
          <meshStandardMaterial color={YARD.foliage} roughness={0.8} />
        </mesh>
      ))}
    </group>
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
        color="#ffb36a"
        emissive={YARD.accent}
        emissiveIntensity={1.1}
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
    const t = clock.elapsedTime * 0.12;
    for (let i = 0; i < count; i++) {
      const a = t + i * ((Math.PI * 2) / count);
      const r = 28 + i * 4;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.7;
      dummy.position.set(x, 14 + (i % 3), z);
      dummy.rotation.set(0, -a + Math.PI / 2, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <coneGeometry args={[0.1, 0.34, 3]} />
      <meshStandardMaterial color={YARD.ink} roughness={0.7} />
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
  return (
    <group>
      <YardSky preferPerf={preferPerf} />
      <Terrain preferPerf={preferPerf} onWalk={onWalk} enabled={walkEnabled} />
      <YardPlaza preferPerf={preferPerf} />
      <Pond />
      <YardOak preferPerf={preferPerf} />
      {preferPerf ? null : <Birds count={4} />}
      <Fireflies count={preferPerf ? 8 : 16} />
    </group>
  );
}
