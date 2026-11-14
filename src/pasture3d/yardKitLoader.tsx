/** Lazy-load optimized Kenney CC0 GLBs with meshopt + a procedural fallback. */

import "@react-three/fiber";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { YARD } from "./yardChrome";

export const YARD_KIT_BASE = "/yard-kits/";

const cache = new Map<string, Promise<GLTF>>();
let loader: GLTFLoader | null = null;

function getLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

export function loadYardGltf(name: string): Promise<GLTF> {
  const url = `${YARD_KIT_BASE}${name}.glb`;
  let pending = cache.get(url);
  if (!pending) {
    pending = getLoader().loadAsync(url);
    cache.set(url, pending);
  }
  return pending;
}

export function preloadYardKits(names: readonly string[]): void {
  for (const name of names) void loadYardGltf(name).catch(() => {});
}

function isMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return (obj as THREE.Mesh).isMesh;
}

export function restyleYardKit(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!isMesh(obj)) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      const c = mat.color;
      const lum = c.r * 0.4 + c.g * 0.45 + c.b * 0.15;
      const isWindow = c.b > c.r + 0.08 && c.b > 0.35;
      const isAwning = c.r > 0.55 && c.g < 0.5 && c.r > c.b;
      const isRoof = lum < 0.28;
      if (isWindow) {
        mat.color = new THREE.Color("#d7e7f0");
        mat.emissive = new THREE.Color("#ffc888");
        mat.emissiveIntensity = 0.55;
        mat.roughness = 0.35;
      } else if (isAwning) {
        mat.color = new THREE.Color(YARD.accent);
        mat.emissive = new THREE.Color(YARD.accent);
        mat.emissiveIntensity = 0.22;
      } else if (isRoof) {
        mat.color = new THREE.Color("#1a1a1c");
      } else if (lum > 0.72) {
        mat.color = new THREE.Color("#d6d2ca");
      }
      mat.needsUpdate = true;
    }
  });
}

export function prepareYardKit(
  scene: THREE.Object3D,
  opts: {
    scale?: number;
    frontZ?: number;
    groundY?: number;
    restyle?: boolean;
  } = {},
): THREE.Group {
  const root = new THREE.Group();
  const obj = scene.clone(true);
  obj.scale.setScalar(opts.scale ?? 1);
  if (opts.restyle !== false) restyleYardKit(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const midX = (box.min.x + box.max.x) / 2;
  const groundY = opts.groundY ?? 0;
  const z =
    opts.frontZ != null
      ? opts.frontZ - box.max.z
      : -((box.min.z + box.max.z) / 2);
  obj.position.set(-midX, groundY - box.min.y, z);
  root.add(obj);
  return root;
}

export function YardKit({
  name,
  scale = 1,
  frontZ,
  groundY = 0,
  restyle = true,
  position,
  rotation,
  onReady,
}: {
  name: string;
  scale?: number;
  frontZ?: number;
  groundY?: number;
  restyle?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  onReady?: () => void;
}) {
  const [root, setRoot] = useState<THREE.Group | null>(null);
  useEffect(() => {
    let live = true;
    loadYardGltf(name)
      .then((gltf) => {
        if (!live) return;
        setRoot(
          prepareYardKit(gltf.scene, { scale, frontZ, groundY, restyle }),
        );
        onReady?.();
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [name, scale, frontZ, groundY, restyle]);
  if (!root) return null;
  return <primitive object={root} position={position} rotation={rotation} />;
}

export function YardKitSwap({
  name,
  scale = 1,
  frontZ,
  fallback,
  children,
}: {
  name: string;
  scale?: number;
  frontZ?: number;
  fallback?: ReactNode;
  children?: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  return (
    <>
      {ready ? null : fallback}
      <YardKit
        name={name}
        scale={scale}
        frontZ={frontZ}
        onReady={() => setReady(true)}
      />
      {children}
    </>
  );
}

export type YardKitInstance = {
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
};

export function InstancedYardKit({
  name,
  items,
  scale = 1,
  restyle = true,
}: {
  name: string;
  scale?: number;
  restyle?: boolean;
  items: readonly YardKitInstance[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [source, setSource] = useState<THREE.Mesh | null>(null);
  useEffect(() => {
    let live = true;
    loadYardGltf(name)
      .then((gltf) => {
        if (!live) return;
        const scene = gltf.scene.clone(true);
        if (restyle) restyleYardKit(scene);
        scene.updateMatrixWorld(true);
        let mesh: THREE.Mesh | null = null;
        scene.traverse((obj) => {
          if (!mesh && isMesh(obj)) mesh = obj;
        });
        if (mesh) setSource(mesh);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [name, restyle]);
  useLayoutEffect(() => {
    const inst = meshRef.current;
    if (!inst || !source) return;
    source.geometry.computeBoundingBox();
    const box = source.geometry.boundingBox;
    const dummy = new THREE.Object3D();
    items.forEach((item, i) => {
      const s = (item.scale ?? 1) * scale;
      const yOff = box ? -box.min.y * s : 0;
      dummy.position.set(
        item.position[0],
        item.position[1] + yOff,
        item.position[2],
      );
      dummy.rotation.set(0, item.rotationY ?? 0, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.count = items.length;
    inst.instanceMatrix.needsUpdate = true;
  }, [items, source, scale]);
  if (!source || items.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[source.geometry, source.material, items.length]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}
