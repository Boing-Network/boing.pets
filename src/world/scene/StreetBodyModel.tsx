/** Shared StreetBody character for every Yard wanderer, tinted per NFT. */

import { useFrame } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { petMaterialColor, type PetModelLook } from "../lib/petModel";
import {
  STREET_BODY_ANCHORS,
  STREET_BODY_GROUND_LIFT,
  STREET_BODY_URL,
} from "../../pasture3d/streetBodyAnchors";
import { streetBodyGait, streetBodyPose } from "../../pasture3d/streetBodyAnim";
import { loadYardGltf } from "../../pasture3d/yardKitLoader";

function loadStreetBody(): Promise<GLTF> {
  return loadYardGltf(STREET_BODY_URL);
}

export function preloadStreetBody(): void {
  void loadStreetBody().catch(() => {});
}

function isMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return (obj as THREE.Mesh).isMesh;
}

function isSkinnedMesh(obj: THREE.Object3D): obj is THREE.SkinnedMesh {
  return (obj as THREE.SkinnedMesh).isSkinnedMesh;
}

function isBone(obj: THREE.Object3D): obj is THREE.Bone {
  return (obj as THREE.Bone).isBone;
}

function tintSlotForMesh(
  name: string,
): "body" | "accent-surface" | "drip" | "face" | "sole" | "limb" {
  if (/FootSole_/.test(name)) return "sole";
  if (/ChestDrip/.test(name)) return "drip";
  if (/^(Nose|Ear_L|Ear_R|Neck|Elbow_|Knee_)/.test(name))
    return "accent-surface";
  if (/^(Eye_|Pupil_|Catch_|Brow_|Mouth|Cheek)/.test(name)) return "face";
  if (/^(Shoulder_|UpperArm_|Forearm_|Wrist_|Palm_|Thumb_|Finger_)/.test(name))
    return "limb";
  return "body";
}

const TOON_STEPS = [48, 140, 255];

function makeToonRamp(): THREE.DataTexture {
  const data = new Uint8Array(TOON_STEPS.length * 4);
  for (let i = 0; i < TOON_STEPS.length; i++) {
    const v = TOON_STEPS[i]!;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(
    data,
    TOON_STEPS.length,
    1,
    THREE.RGBAFormat,
  );
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function colorOf(mat: THREE.Material): THREE.Color {
  if ("color" in mat && mat.color instanceof THREE.Color) return mat.color;
  return new THREE.Color("#888888");
}

function toonFrom(
  mat: THREE.Material,
  ramp: THREE.DataTexture,
  name: string,
): THREE.Material {
  if (/^Catch_/.test(name)) {
    return new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    });
  }
  if (/^Pupil_/.test(name)) {
    return new THREE.MeshToonMaterial({
      color: 0x141018,
      gradientMap: ramp,
    });
  }
  const src = mat as THREE.MeshStandardMaterial;
  const toon = new THREE.MeshToonMaterial({
    color: colorOf(mat).clone(),
    map: "map" in src ? src.map : null,
    gradientMap: ramp,
    transparent: src.transparent,
    opacity: src.opacity,
    side: src.side,
  });
  addToonRim(toon);
  return toon;
}

const RIM_HOOK =
  "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;";

function addToonRim(mat: THREE.MeshToonMaterial): void {
  mat.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes(RIM_HOOK)) return;
    shader.fragmentShader = shader.fragmentShader.replace(
      RIM_HOOK,
      RIM_HOOK +
        `
        float rim = pow(clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.6);
        outgoingLight += vec3(1.0, 0.86, 0.7) * rim * 0.32;
        float luma = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        float q = floor(luma * 3.0 + 0.28) / 3.0;
        outgoingLight *= luma > 0.001 ? q / luma : 1.0;
        `,
    );
  };
  mat.customProgramCacheKey = () => "street-body-toon-rim-v3";
}

function stylizeMaterials(root: THREE.Object3D, ramp: THREE.DataTexture): void {
  root.traverse((obj) => {
    if (!isMesh(obj)) return;
    if (obj.name.endsWith("_Outline")) return;
    obj.material = Array.isArray(obj.material)
      ? obj.material.map((mat) => toonFrom(mat, ramp, obj.name))
      : toonFrom(obj.material, ramp, obj.name);
  });
}

const OUTLINE_SKIP = /^(Pupil_|Catch_)/;
const OUTLINE_INFLATE = 0.03;
const OUTLINE_INFLATE_FACE = 0.022;

function inflateGeometry(
  source: THREE.BufferGeometry,
  inflate: number,
): THREE.BufferGeometry {
  const geom = source.clone();
  const pos = geom.getAttribute("position");
  const nrm = geom.getAttribute("normal");
  if (!pos || !nrm) return geom;
  if (!geom.boundingBox) geom.computeBoundingBox();
  const box = geom.boundingBox;
  const sx = box ? box.max.x - box.min.x : 0;
  const sy = box ? box.max.y - box.min.y : 0;
  const sz = box ? box.max.z - box.min.z : 0;
  const axis = sy >= sx && sy >= sz ? 1 : sz >= sx ? 2 : 0;
  for (let i = 0; i < pos.count; i++) {
    let nx = nrm.getX(i);
    let ny = nrm.getY(i);
    let nz = nrm.getZ(i);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const nAxis = axis === 0 ? nx : axis === 1 ? ny : nz;
    const cap = Math.abs(nAxis) > 0.62;
    const scale = cap ? inflate * 0.12 : inflate;
    let ix = nx * scale;
    let iy = ny * scale;
    let iz = nz * scale;
    if (cap) {
      if (axis === 0) ix *= 0.05;
      if (axis === 1) iy *= 0.05;
      if (axis === 2) iz *= 0.05;
    }
    pos.setXYZ(i, pos.getX(i) + ix, pos.getY(i) + iy, pos.getZ(i) + iz);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  return geom;
}

function addInvertedHullOutlines(root: THREE.Object3D): void {
  const pending: Array<{ parent: THREE.Object3D; outline: THREE.Object3D }> =
    [];
  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x1a0c08,
    side: THREE.BackSide,
  });
  root.traverse((obj) => {
    if (!isMesh(obj)) return;
    if (OUTLINE_SKIP.test(obj.name)) return;
    if (obj.name.endsWith("_Outline")) return;
    if (/^(Elbow_|Knee_|Wrist_)/.test(obj.name)) return;
    const parent = obj.parent;
    if (!parent) return;
    const face = /^(Eye_|Brow_|Nose|Mouth|Ear_|Cheek|Skull)/.test(obj.name);
    const geom = inflateGeometry(
      obj.geometry,
      face ? OUTLINE_INFLATE_FACE : OUTLINE_INFLATE,
    );
    const mat = outlineMat.clone();
    let outline: THREE.Mesh | THREE.SkinnedMesh;
    if (isSkinnedMesh(obj)) {
      const skinned = new THREE.SkinnedMesh(geom, mat);
      skinned.bind(obj.skeleton, obj.bindMatrix);
      outline = skinned;
    } else {
      outline = new THREE.Mesh(geom, mat);
    }
    outline.name = `${obj.name}_Outline`;
    outline.frustumCulled = false;
    outline.position.copy(obj.position);
    outline.quaternion.copy(obj.quaternion);
    outline.scale.copy(obj.scale);
    pending.push({ parent, outline });
  });
  for (const item of pending) item.parent.add(item.outline);
}

function tintStreetBody(root: THREE.Object3D, look: PetModelLook): void {
  const body = petMaterialColor(look.hue, "body");
  const accent = petMaterialColor(look.accent, "accent");
  const dark = body.clone().lerp(new THREE.Color("#2a1810"), 0.35);
  root.traverse((obj) => {
    if (!isMesh(obj)) return;
    if (obj.name.endsWith("_Outline")) return;
    const slot = tintSlotForMesh(obj.name);
    if (slot === "face") return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const sole = body.clone().lerp(new THREE.Color("#0c0a09"), 0.82);
    const limb = body.clone().lerp(new THREE.Color("#2a1810"), 0.22);
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshToonMaterial)) continue;
      if (slot === "body") mat.color.copy(body);
      else if (slot === "limb") mat.color.copy(limb);
      else if (slot === "accent-surface") mat.color.copy(dark);
      else if (slot === "sole") mat.color.copy(sole);
      else mat.color.copy(accent);
      mat.needsUpdate = true;
    }
  });
}

function attachAnchors(
  root: THREE.Object3D,
  bones: Map<string, THREE.Bone>,
): void {
  for (const def of STREET_BODY_ANCHORS) {
    const bone = bones.get(def.bone) ?? bones.get("Root") ?? root;
    const group = new THREE.Group();
    group.name = `anchor:${def.id}`;
    group.userData.slot = def.id;
    group.position.set(def.offset[0], def.offset[1], def.offset[2]);
    bone.add(group);
    if (def.pair) {
      def.pair.forEach((boneName, i) => {
        const side = i === 0 ? "L" : "R";
        const parent = bones.get(boneName) ?? bone;
        const marker = new THREE.Group();
        marker.name = `anchor:${def.id}:${side}`;
        marker.userData.slot = def.id;
        parent.add(marker);
      });
    }
  }
}

function collectBones(root: THREE.Object3D): Map<string, THREE.Bone> {
  const bones = new Map<string, THREE.Bone>();
  root.traverse((obj) => {
    if (isBone(obj) && obj.name) bones.set(obj.name, obj);
  });
  return bones;
}

function captureRest(
  bones: Map<string, THREE.Bone>,
): Map<string, THREE.Quaternion> {
  const rest = new Map<string, THREE.Quaternion>();
  for (const [name, bone] of bones) {
    rest.set(name, bone.quaternion.clone());
  }
  return rest;
}

function applyEulerDelta(
  bone: THREE.Bone | undefined,
  rest: THREE.Quaternion | undefined,
  xyz: readonly [number, number, number],
  scratch: THREE.Quaternion,
  euler: THREE.Euler,
): void {
  if (!bone || !rest) return;
  euler.set(xyz[0], xyz[1], xyz[2], "XYZ");
  scratch.setFromEuler(euler);
  bone.quaternion.copy(rest).multiply(scratch);
}

export function StreetBodyModel({
  look,
  moving = false,
  movingRef,
  speedRef,
  reducedMotion = false,
}: {
  look: PetModelLook;
  moving?: boolean;
  movingRef?: MutableRefObject<boolean>;
  speedRef?: MutableRefObject<number>;
  reducedMotion?: boolean;
}) {
  const [root, setRoot] = useState<THREE.Group | null>(null);
  const bonesRef = useRef<Map<string, THREE.Bone>>(new Map());
  const restRef = useRef<Map<string, THREE.Quaternion>>(new Map());
  const scratchQ = useMemo(() => new THREE.Quaternion(), []);
  const scratchE = useMemo(() => new THREE.Euler(), []);
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    let live = true;
    loadStreetBody()
      .then((gltf) => {
        if (!live) return;
        const clone = SkeletonUtils.clone(gltf.scene) as THREE.Group;
        const ramp = makeToonRamp();
        stylizeMaterials(clone, ramp);
        addInvertedHullOutlines(clone);
        clone.position.y = STREET_BODY_GROUND_LIFT;
        const bones = collectBones(clone);
        attachAnchors(clone, bones);
        tintStreetBody(clone, lookRef.current);
        bonesRef.current = bones;
        restRef.current = captureRest(bones);
        setRoot(clone);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (root) tintStreetBody(root, look);
  }, [look, root]);

  useFrame(({ clock }) => {
    const bones = bonesRef.current;
    if (bones.size === 0) return;
    const movingNow = movingRef?.current ?? moving;
    const speed = speedRef?.current ?? (movingNow ? 1.35 : 0);
    const pose = streetBodyPose(
      streetBodyGait(speed, movingNow),
      clock.elapsedTime,
      reducedMotion,
    );
    const rest = restRef.current;
    applyEulerDelta(
      bones.get("Hips"),
      rest.get("Hips"),
      pose.hips,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("Spine"),
      rest.get("Spine"),
      pose.spine,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("Chest"),
      rest.get("Chest"),
      pose.chest,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("Neck"),
      rest.get("Neck"),
      pose.neck,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("Head"),
      rest.get("Head"),
      pose.head,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("Shoulder_L"),
      rest.get("Shoulder_L"),
      pose.shoulderL,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("Shoulder_R"),
      rest.get("Shoulder_R"),
      pose.shoulderR,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("UpperArm_L"),
      rest.get("UpperArm_L"),
      pose.upperArmL,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("UpperArm_R"),
      rest.get("UpperArm_R"),
      pose.upperArmR,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("LowerArm_L"),
      rest.get("LowerArm_L"),
      pose.lowerArmL,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("LowerArm_R"),
      rest.get("LowerArm_R"),
      pose.lowerArmR,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("UpperLeg_L"),
      rest.get("UpperLeg_L"),
      pose.upperLegL,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("UpperLeg_R"),
      rest.get("UpperLeg_R"),
      pose.upperLegR,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("LowerLeg_L"),
      rest.get("LowerLeg_L"),
      pose.lowerLegL,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("LowerLeg_R"),
      rest.get("LowerLeg_R"),
      pose.lowerLegR,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("Foot_L"),
      rest.get("Foot_L"),
      pose.footL,
      scratchQ,
      scratchE,
    );
    applyEulerDelta(
      bones.get("Foot_R"),
      rest.get("Foot_R"),
      pose.footR,
      scratchQ,
      scratchE,
    );
  });

  if (!root) return null;
  return <primitive object={root} />;
}
