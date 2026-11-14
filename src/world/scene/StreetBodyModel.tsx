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

function isBone(obj: THREE.Object3D): obj is THREE.Bone {
  return (obj as THREE.Bone).isBone;
}

function tintSlotForMesh(
  name: string,
): "body" | "accent-surface" | "drip" | "face" {
  if (/ChestDrip/.test(name)) return "drip";
  if (/^(Nose|Ear_L|Ear_R|Neck|Elbow_|Knee_)/.test(name))
    return "accent-surface";
  if (/^(Eye_|Pupil_|Catch_|Brow_|Mouth|Cheek)/.test(name)) return "face";
  return "body";
}

function cloneMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!isMesh(obj)) return;
    obj.material = Array.isArray(obj.material)
      ? obj.material.map((mat) => mat.clone())
      : obj.material.clone();
  });
}

function tintStreetBody(root: THREE.Object3D, look: PetModelLook): void {
  const body = petMaterialColor(look.hue, "body");
  const accent = petMaterialColor(look.accent, "accent");
  const dark = body.clone().lerp(new THREE.Color("#2a1810"), 0.35);
  root.traverse((obj) => {
    if (!isMesh(obj)) return;
    const slot = tintSlotForMesh(obj.name);
    if (slot === "face") return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      if (slot === "body") mat.color.copy(body);
      else if (slot === "accent-surface") mat.color.copy(dark);
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
        cloneMaterials(clone);
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
