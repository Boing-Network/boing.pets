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
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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

export function gltfUrl(name: string, base = YARD_KIT_BASE): string {
  if (
    name.startsWith("/") ||
    name.endsWith(".glb") ||
    name.startsWith("http")
  ) {
    return name;
  }
  return `${base}${name}.glb`;
}

export function loadYardGltf(
  name: string,
  base = YARD_KIT_BASE,
): Promise<GLTF> {
  const url = gltfUrl(name, base);
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

/**
 * Shop walls sample a color atlas (a grey cell next to a black cell).
 * Mipmaps average those cells together, so a wall flashes between grey and
 * black as the camera moves. Sample the atlas texel directly.
 */
function lockPaletteMap(map: THREE.Texture | null): void {
  if (!map) return;
  map.generateMipmaps = false;
  map.minFilter = THREE.NearestFilter;
  map.magFilter = THREE.NearestFilter;
  map.anisotropy = 1;
  map.needsUpdate = true;
}

function projOrient(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInsideTri(
  p: readonly [number, number],
  tri: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ],
): boolean {
  const o1 = projOrient(tri[0], tri[1], p);
  const o2 = projOrient(tri[1], tri[2], p);
  const o3 = projOrient(tri[2], tri[0], p);
  return (
    (o1 > 1e-4 && o2 > 1e-4 && o3 > 1e-4) ||
    (o1 < -1e-4 && o2 < -1e-4 && o3 < -1e-4)
  );
}

/**
 * Kenney walls are often two triangles on the exact same plane, one grey and
 * one black. The depth buffer swaps which one wins as the camera moves, so
 * about half the buildings flash. Drop that second copy. A smaller decal that
 * shares the plane is nudged out along its normal so it stays visible.
 */
export function separateStackedFaces(
  geometry: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = src.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos || pos.count < 6) {
    if (src !== geometry) src.dispose();
    return geometry;
  }
  const triCount = Math.floor(pos.count / 3);
  type Tri = {
    n: THREE.Vector3;
    d: number;
    area: number;
    p: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    mid: readonly [number, number];
    proj: readonly [
      readonly [number, number],
      readonly [number, number],
      readonly [number, number],
    ];
    i0: number;
    i1: number;
  };
  const tris: Tri[] = [];
  const drop = new Uint8Array(triCount);
  const lift = new Float32Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const p: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
      new THREE.Vector3().fromBufferAttribute(pos, t * 3),
      new THREE.Vector3().fromBufferAttribute(pos, t * 3 + 1),
      new THREE.Vector3().fromBufferAttribute(pos, t * 3 + 2),
    ];
    const n = new THREE.Vector3().crossVectors(
      p[1].clone().sub(p[0]),
      p[2].clone().sub(p[0]),
    );
    const area = n.length() * 0.5;
    if (area < 1e-8) {
      drop[t] = 1;
      tris.push({
        n,
        d: 0,
        area: 0,
        p,
        mid: [0, 0],
        proj: [
          [0, 0],
          [0, 0],
          [0, 0],
        ],
        i0: 0,
        i1: 1,
      });
      continue;
    }
    n.multiplyScalar(1 / (area * 2));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    let i0 = 0;
    let i1 = 1;
    if (ax >= ay && ax >= az) {
      i0 = 1;
      i1 = 2;
    } else if (ay >= ax && ay >= az) {
      i0 = 0;
      i1 = 2;
    }
    const proj: Tri["proj"] = [
      [p[0].getComponent(i0), p[0].getComponent(i1)],
      [p[1].getComponent(i0), p[1].getComponent(i1)],
      [p[2].getComponent(i0), p[2].getComponent(i1)],
    ];
    const mid = p[0]
      .clone()
      .add(p[1])
      .add(p[2])
      .multiplyScalar(1 / 3);
    tris.push({
      n,
      d: n.dot(p[0]),
      area,
      p,
      mid: [mid.getComponent(i0), mid.getComponent(i1)],
      proj,
      i0,
      i1,
    });
  }

  const seen = new Map<string, number>();
  for (let t = 0; t < triCount; t++) {
    if (drop[t]) continue;
    const key = [0, 1, 2]
      .map((k) => {
        const point = tris[t]!.p[k]!;
        return `${Math.round(point.x * 4000)},${Math.round(point.y * 4000)},${Math.round(point.z * 4000)}`;
      })
      .sort()
      .join("|");
    if (seen.has(key)) drop[t] = 1;
    else seen.set(key, t);
  }

  for (let i = 0; i < triCount; i++) {
    if (drop[i] || tris[i]!.area < 1e-6) continue;
    for (let j = i + 1; j < triCount; j++) {
      if (drop[j] || tris[j]!.area < 1e-6) continue;
      const a = tris[i]!;
      const b = tris[j]!;
      if (Math.abs(a.n.dot(b.n)) < 0.995) continue;
      if (Math.abs(a.n.dot(b.p[0]!) - a.d) > 0.003) continue;
      const bproj: Tri["proj"] = [
        [b.p[0].getComponent(a.i0), b.p[0].getComponent(a.i1)],
        [b.p[1].getComponent(a.i0), b.p[1].getComponent(a.i1)],
        [b.p[2].getComponent(a.i0), b.p[2].getComponent(a.i1)],
      ];
      const bMid: readonly [number, number] = [
        (b.p[0]!.getComponent(a.i0) +
          b.p[1]!.getComponent(a.i0) +
          b.p[2]!.getComponent(a.i0)) /
          3,
        (b.p[0]!.getComponent(a.i1) +
          b.p[1]!.getComponent(a.i1) +
          b.p[2]!.getComponent(a.i1)) /
          3,
      ];
      const aInB = pointInsideTri(a.mid, bproj);
      const bInA = pointInsideTri(bMid, a.proj);
      if (!aInB && !bInA) continue;
      const small = a.area <= b.area ? i : j;
      const large = small === i ? j : i;
      if (tris[small]!.area / tris[large]!.area > 0.72) drop[small] = 1;
      else if (lift[small] === 0) lift[small] = 0.004;
    }
  }

  let changed = false;
  for (let t = 0; t < triCount; t++) {
    if (drop[t] || lift[t]) changed = true;
  }
  if (!changed) {
    if (src !== geometry) src.dispose();
    return geometry;
  }

  const kept: number[] = [];
  for (let t = 0; t < triCount; t++) if (!drop[t]) kept.push(t);
  const dst = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const attr = src.getAttribute(name) as THREE.BufferAttribute;
    const itemSize = attr.itemSize;
    const out = new Float32Array(kept.length * 3 * itemSize);
    let w = 0;
    for (const t of kept) {
      const extra = name === "position" ? lift[t]! : 0;
      const nrm = tris[t]!.n;
      for (let k = 0; k < 3; k++) {
        const vi = t * 3 + k;
        for (let c = 0; c < itemSize; c++) {
          let value = attr.getComponent(vi, c);
          if (extra) value += nrm.getComponent(c) * extra;
          out[w++] = value;
        }
      }
    }
    dst.setAttribute(
      name,
      new THREE.BufferAttribute(out, itemSize, attr.normalized),
    );
  }
  if (src !== geometry) src.dispose();
  return dst;
}

function palettePixels(
  image: CanvasImageSource & { width: number; height: number },
): Uint8ClampedArray | null {
  if (typeof document === "undefined" || !image.width || !image.height)
    return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, image.width, image.height).data;
  } catch {
    return null;
  }
}

/**
 * The grey wall and the black trim are painted from one atlas and often lie
 * on the same plane. Split them and bias the wall toward the camera so the
 * trim cannot flash through the wall while the view moves.
 */
function splitPaletteFaces(mesh: THREE.Mesh): void {
  const mat = mesh.material;
  if (!(mat instanceof THREE.MeshStandardMaterial) || !mat.map) return;
  const image = mat.map.image as
    (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!image) return;
  const pixels = palettePixels(image);
  if (!pixels) return;
  const width = image.width;
  const height = image.height;
  const flipY = mat.map.flipY;
  const lumAt = (u: number, v: number) => {
    const uu = ((u % 1) + 1) % 1;
    const vv = ((v % 1) + 1) % 1;
    const x = Math.min(width - 1, Math.floor(uu * width));
    const y = Math.min(height - 1, Math.floor((flipY ? 1 - vv : vv) * height));
    const i = (y * width + x) * 4;
    return pixels[i]! * 0.3 + pixels[i + 1]! * 0.5 + pixels[i + 2]! * 0.2;
  };
  const src = mesh.geometry.index
    ? mesh.geometry.toNonIndexed()
    : mesh.geometry;
  const pos = src.getAttribute("position");
  const uv = src.getAttribute("uv");
  if (!pos || !uv) {
    if (src !== mesh.geometry) src.dispose();
    return;
  }
  const triCount = Math.floor(pos.count / 3);
  const dark = new Uint8Array(triCount);
  let darkCount = 0;
  for (let t = 0; t < triCount; t++) {
    let lum = 0;
    for (let k = 0; k < 3; k++) {
      const vi = t * 3 + k;
      lum += lumAt(uv.getX(vi), uv.getY(vi));
    }
    if (lum / 3 < 70) {
      dark[t] = 1;
      darkCount += 1;
    }
  }
  if (darkCount === 0 || darkCount === triCount) {
    if (src !== mesh.geometry) src.dispose();
    return;
  }
  const make = (wantDark: number) => {
    const kept: number[] = [];
    for (let t = 0; t < triCount; t++) if (dark[t] === wantDark) kept.push(t);
    const dst = new THREE.BufferGeometry();
    for (const name of Object.keys(src.attributes)) {
      const attr = src.getAttribute(name) as THREE.BufferAttribute;
      const itemSize = attr.itemSize;
      const out = new Float32Array(kept.length * 3 * itemSize);
      let w = 0;
      for (const t of kept) {
        for (let k = 0; k < 3; k++) {
          const vi = t * 3 + k;
          for (let c = 0; c < itemSize; c++)
            out[w++] = attr.getComponent(vi, c);
        }
      }
      dst.setAttribute(
        name,
        new THREE.BufferAttribute(out, itemSize, attr.normalized),
      );
    }
    return dst;
  };
  const wallGeo = make(0);
  const trimGeo = make(1);
  const wallMat = mat;
  const trimMat = mat.clone();
  wallMat.polygonOffset = true;
  wallMat.polygonOffsetFactor = -2;
  wallMat.polygonOffsetUnits = -2;
  trimMat.polygonOffset = true;
  trimMat.polygonOffsetFactor = 1;
  trimMat.polygonOffsetUnits = 1;
  const parent = mesh.parent;
  if (!parent) return;
  const wall = new THREE.Mesh(wallGeo, wallMat);
  const trim = new THREE.Mesh(trimGeo, trimMat);
  for (const part of [wall, trim]) {
    part.castShadow = false;
    part.receiveShadow = false;
    part.position.copy(mesh.position);
    part.rotation.copy(mesh.rotation);
    part.scale.copy(mesh.scale);
    parent.add(part);
  }
  parent.remove(mesh);
  if (src !== mesh.geometry) src.dispose();
}

function unstackMeshes(root: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry) meshes.push(obj);
  });
  for (const mesh of meshes) {
    const next = separateStackedFaces(mesh.geometry);
    if (next !== mesh.geometry) mesh.geometry = next;
    splitPaletteFaces(mesh);
  }
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
      const isPaintedRoof =
        c.g > c.r + 0.08 && c.g > c.b + 0.08 && lum > 0.18 && lum < 0.65;
      const isRoof = lum < 0.28 || isPaintedRoof;
      mat.metalness = 0;
      mat.envMapIntensity = 0;
      lockPaletteMap(mat.map);
      lockPaletteMap(mat.emissiveMap);
      lockPaletteMap(mat.roughnessMap);
      lockPaletteMap(mat.metalnessMap);
      lockPaletteMap(mat.normalMap);
      if (isWindow) {
        mat.color = new THREE.Color("#d7e7f0");
        mat.emissive = new THREE.Color("#ffc888");
        mat.emissiveIntensity = 0.55;
        mat.roughness = 0.72;
        // Windows sit on the wall plane. A small offset stops the two
        // surfaces from flickering into static as the camera orbits.
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -1;
        mat.polygonOffsetUnits = -2;
      } else if (isAwning) {
        mat.color = new THREE.Color(YARD.accent);
        mat.emissive = new THREE.Color(YARD.accent);
        mat.emissiveIntensity = 0.22;
        mat.roughness = 1;
      } else if (isRoof) {
        mat.color = new THREE.Color("#1a1a1c");
        mat.roughness = 1;
      } else if (lum > 0.72) {
        mat.color = new THREE.Color("#d6d2ca");
        mat.roughness = 1;
      } else {
        mat.roughness = Math.max(mat.roughness, 0.92);
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
  unstackMeshes(root);
  mergeKitMeshes(root);
  return root;
}

/** Keep authored pivot (y=0 base, no XZ recentering) for Nico street props. */
export function prepareStreetProp(
  scene: THREE.Object3D,
  opts: { restyle?: boolean } = {},
): THREE.Group {
  const root = new THREE.Group();
  const obj = scene.clone(true);
  if (opts.restyle) restyleYardKit(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  obj.position.y += -box.min.y;
  root.add(obj);
  unstackMeshes(root);
  mergeKitMeshes(root);
  return root;
}

function materialKey(material: THREE.Material): string {
  return `${material.type}:${material.uuid}`;
}

/** Collapse a prepared kit to one mesh per material to cut draw calls. */
function mergeKitMeshes(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const groups = new Map<
    string,
    { geos: THREE.BufferGeometry[]; material: THREE.Material }
  >();
  const remove: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
    const raw = obj.material;
    const mat = Array.isArray(raw) ? null : raw;
    if (!mat) return;
    const geo: THREE.BufferGeometry = obj.geometry.clone();
    geo.applyMatrix4(obj.matrixWorld);
    const key = materialKey(mat);
    let slot = groups.get(key);
    if (!slot) {
      slot = { geos: [], material: mat };
      groups.set(key, slot);
    }
    slot.geos.push(geo);
    remove.push(obj);
  });
  if (!groups.size) return;
  for (const mesh of remove) mesh.removeFromParent();
  for (const { geos, material } of groups.values()) {
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (geos.length > 1) {
      for (const geo of geos) geo.dispose();
    }
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    root.add(mesh);
  }
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
  base = YARD_KIT_BASE,
  recenter = true,
}: {
  name: string;
  scale?: number;
  restyle?: boolean;
  base?: string;
  recenter?: boolean;
  items: readonly YardKitInstance[];
}) {
  const [sources, setSources] = useState<THREE.Mesh[]>([]);
  const refs = useRef<Array<THREE.InstancedMesh | null>>([]);
  useEffect(() => {
    let live = true;
    loadYardGltf(name, base)
      .then((gltf) => {
        if (!live) return;
        const prepared = recenter
          ? prepareYardKit(gltf.scene, { scale: 1, restyle })
          : prepareStreetProp(gltf.scene, { restyle });
        const meshes: THREE.Mesh[] = [];
        prepared.traverse((obj) => {
          if (isMesh(obj)) meshes.push(obj);
        });
        setSources(meshes);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [name, restyle, base, recenter]);
  useLayoutEffect(() => {
    sources.forEach((source, mi) => {
      const inst = refs.current[mi];
      if (!inst) return;
      const dummy = new THREE.Object3D();
      items.forEach((item, i) => {
        const s = (item.scale ?? 1) * scale;
        dummy.position.set(
          item.position[0],
          item.position[1],
          item.position[2],
        );
        dummy.rotation.set(0, item.rotationY ?? 0, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.count = items.length;
      inst.instanceMatrix.needsUpdate = true;
    });
  }, [items, sources, scale]);
  if (sources.length === 0 || items.length === 0) return null;
  return (
    <>
      {sources.map((source, i) => (
        <instancedMesh
          key={`${name}-${i}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          args={[source.geometry, source.material, items.length]}
          frustumCulled={false}
          castShadow={false}
          receiveShadow={false}
        />
      ))}
    </>
  );
}
