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

function tintSlotForMaterial(
  matName: string,
): "body" | "face" | "sole" | "clothes" | "skip" {
  if (/^(EyeWhite|Pupil|Brow|Mouth)$/.test(matName)) return "face";
  if (matName === "Sole") return "sole";
  if (/^(Tank|Shorts)$/.test(matName)) return "clothes";
  if (matName === "Body") return "body";
  return "skip";
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
  if (/^Catch_/.test(name) || mat.name === "Catch") {
    const basic = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    });
    basic.name = mat.name || name;
    return basic;
  }
  if (/^Pupil_/.test(name) || mat.name === "Pupil") {
    const pupil = new THREE.MeshToonMaterial({
      color: 0x141018,
      gradientMap: ramp,
    });
    pupil.name = mat.name || "Pupil";
    return pupil;
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
  toon.name = mat.name;
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

const OUTLINE_SKIP = /^(Pupil_|Catch_|EyeWhite_|Lid_)/;
const OUTLINE_INFLATE = 0.012;
const OUTLINE_INFLATE_FACE = 0.008;

function detachGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  for (const name of Object.keys(source.attributes)) {
    const attr = source.getAttribute(name);
    const Ctor = attr.array.constructor as new (
      len: number,
    ) => ArrayLike<number> & {
      [i: number]: number;
    };
    const array = new (Ctor as unknown as new (len: number) => Float32Array)(
      attr.count * attr.itemSize,
    );
    const copy = new THREE.BufferAttribute(
      array,
      attr.itemSize,
      attr.normalized,
    );
    for (let i = 0; i < attr.count; i++) {
      for (let k = 0; k < attr.itemSize; k++) {
        copy.setComponent(i, k, attr.getComponent(i, k));
      }
    }
    geom.setAttribute(name, copy);
  }
  if (source.index) geom.setIndex(source.index.clone());
  return geom;
}

function inflateGeometry(
  source: THREE.BufferGeometry,
  inflate: number,
): THREE.BufferGeometry {
  const geom = detachGeometry(source);
  const pos = geom.getAttribute("position");
  const nrm = geom.getAttribute("normal");
  if (!pos || !nrm) return geom;
  for (let i = 0; i < pos.count; i++) {
    let nx = nrm.getX(i);
    let ny = nrm.getY(i);
    let nz = nrm.getZ(i);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    pos.setXYZ(
      i,
      pos.getX(i) + nx * inflate,
      pos.getY(i) + ny * inflate,
      pos.getZ(i) + nz * inflate,
    );
  }
  pos.needsUpdate = true;
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
    const parent = obj.parent;
    if (!parent) return;
    const face = /^(Brow_|Mouth|Head)/.test(obj.name);
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
  root.traverse((obj) => {
    if (!isMesh(obj)) return;
    if (obj.name.endsWith("_Outline")) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshToonMaterial)) continue;
      const slot = tintSlotForMaterial(mat.name);
      // Tank / Shorts stay a dark ink base; Sole stays dark; face is untinted.
      if (slot !== "body") continue;
      mat.color.copy(body);
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

const WORLD_X = new THREE.Vector3(1, 0, 0);

/**
 * Apply a world-space hinge on top of the authored rest pose. v2 limb
 * bones are not axis-aligned, so a local Euler X swings them sideways.
 */
function applyWorldAxisDelta(
  bone: THREE.Bone | undefined,
  rest: THREE.Quaternion | undefined,
  angle: number,
  scratchQ: THREE.Quaternion,
  parentWQ: THREE.Quaternion,
  restWQ: THREE.Quaternion,
): void {
  if (!bone || !rest) return;
  if (angle === 0) {
    bone.quaternion.copy(rest);
    return;
  }
  const parent = bone.parent;
  if (!parent) return;
  parent.updateMatrixWorld(true);
  parent.getWorldQuaternion(parentWQ);
  restWQ.copy(parentWQ).multiply(rest);
  scratchQ.setFromAxisAngle(WORLD_X, angle);
  scratchQ.multiply(restWQ);
  bone.quaternion.copy(parentWQ).invert().multiply(scratchQ);
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
  const parentWQ = useMemo(() => new THREE.Quaternion(), []);
  const restWQ = useMemo(() => new THREE.Quaternion(), []);
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
        clone.traverse((obj) => {
          if (isMesh(obj)) obj.frustumCulled = false;
        });
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
    applyWorldAxisDelta(
      bones.get("UpperArm_L"),
      rest.get("UpperArm_L"),
      pose.upperArmL[0],
      scratchQ,
      parentWQ,
      restWQ,
    );
    applyWorldAxisDelta(
      bones.get("UpperArm_R"),
      rest.get("UpperArm_R"),
      pose.upperArmR[0],
      scratchQ,
      parentWQ,
      restWQ,
    );
    applyWorldAxisDelta(
      bones.get("LowerArm_L"),
      rest.get("LowerArm_L"),
      pose.lowerArmL[0],
      scratchQ,
      parentWQ,
      restWQ,
    );
    applyWorldAxisDelta(
      bones.get("LowerArm_R"),
      rest.get("LowerArm_R"),
      pose.lowerArmR[0],
      scratchQ,
      parentWQ,
      restWQ,
    );
    applyWorldAxisDelta(
      bones.get("UpperLeg_L"),
      rest.get("UpperLeg_L"),
      pose.upperLegL[0],
      scratchQ,
      parentWQ,
      restWQ,
    );
    applyWorldAxisDelta(
      bones.get("UpperLeg_R"),
      rest.get("UpperLeg_R"),
      pose.upperLegR[0],
      scratchQ,
      parentWQ,
      restWQ,
    );
    applyWorldAxisDelta(
      bones.get("LowerLeg_L"),
      rest.get("LowerLeg_L"),
      pose.lowerLegL[0],
      scratchQ,
      parentWQ,
      restWQ,
    );
    applyWorldAxisDelta(
      bones.get("LowerLeg_R"),
      rest.get("LowerLeg_R"),
      pose.lowerLegR[0],
      scratchQ,
      parentWQ,
      restWQ,
    );
    applyWorldAxisDelta(
      bones.get("Foot_L"),
      rest.get("Foot_L"),
      pose.footL[0],
      scratchQ,
      parentWQ,
      restWQ,
    );
    applyWorldAxisDelta(
      bones.get("Foot_R"),
      rest.get("Foot_R"),
      pose.footR[0],
      scratchQ,
      parentWQ,
      restWQ,
    );
  });

  if (!root) return null;
  return <primitive object={root} />;
}
