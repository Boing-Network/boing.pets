import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { Vector3, type Group } from "three";
import type { EquippedCosmetics } from "../../content/cosmetics";
import {
  pastureBubbleVisible,
  pastureNameplateVisible,
  pasturePetLabel,
} from "../../pasture3d/labels";
import { worldSafeText } from "../lib/worldFont";
import {
  UNIT_SPHERE,
  UNIT_SPHERE_LO,
  petModelParams,
  smileTubeGeometry,
  type PetModelLook,
} from "../lib/petModel";
import { CosmeticAttachments } from "./CosmeticAttachments";
import { PetFeatureMesh } from "./PetFeatureMesh";

const _worldPos = new Vector3();

export type PetMeshLook = PetModelLook;

export function PetMesh({
  look,
  name,
  cosmetics,
  moving = false,
  movingRef,
  reducedMotion = false,
  selected = false,
  yours = false,
  bubble,
  onClick,
  scale = 1,
  children,
}: {
  look: PetMeshLook;
  name?: string;
  cosmetics?: EquippedCosmetics;
  moving?: boolean;
  movingRef?: MutableRefObject<boolean>;
  reducedMotion?: boolean;
  selected?: boolean;
  yours?: boolean;
  bubble?: string;
  onClick?: () => void;
  scale?: number;
  children?: ReactNode;
}) {
  const hop = useRef<Group>(null);
  const root = useRef<Group>(null);
  const nameRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const model = useMemo(() => petModelParams(look), [look]);

  useFrame(({ camera, clock }) => {
    if (root.current && (nameRef.current || bubbleRef.current)) {
      root.current.getWorldPosition(_worldPos);
      const dist = camera.position.distanceTo(_worldPos);
      if (nameRef.current) {
        nameRef.current.style.visibility = pastureNameplateVisible(dist)
          ? "visible"
          : "hidden";
      }
      if (bubbleRef.current) {
        bubbleRef.current.style.visibility = pastureBubbleVisible(dist)
          ? "visible"
          : "hidden";
      }
    }
    if (!hop.current || reducedMotion) return;
    const isMoving = movingRef?.current ?? moving;
    hop.current.position.y =
      Math.sin(clock.elapsedTime * (isMoving ? 11 : 2.4)) *
      (isMoving ? 0.1 : 0.04);
    hop.current.rotation.z = isMoving
      ? Math.sin(clock.elapsedTime * 11) * 0.06
      : Math.sin(clock.elapsedTime * 2.4) * 0.02;
  });

  const label = pasturePetLabel({ species: look.species, fallback: name });

  return (
    <group
      ref={root}
      scale={scale}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <group ref={hop}>
        <mesh
          geometry={UNIT_SPHERE}
          position={[model.body.cx, model.body.cy, model.body.cz]}
          scale={[model.body.x, model.body.y, model.body.z]}
          castShadow={false}
        >
          <meshStandardMaterial
            color={model.bodyColor}
            roughness={0.5}
            metalness={0}
          />
        </mesh>
        {model.feet.map((foot, i) => (
          <mesh
            key={"foot-" + i}
            geometry={UNIT_SPHERE_LO}
            position={[foot.x, foot.y, foot.z]}
            scale={[foot.cx, foot.cy, foot.cz]}
          >
            <meshStandardMaterial
              color={model.accentColor}
              roughness={0.52}
              metalness={0}
            />
          </mesh>
        ))}
        <PetFeatureMesh model={model} accent={model.accentColor} />
        {model.spots.map((spot, i) => (
          <mesh
            key={"spot-" + i}
            geometry={UNIT_SPHERE_LO}
            position={[spot.x, spot.y, spot.z]}
            scale={spot.r}
          >
            <meshStandardMaterial
              color={model.accentColor}
              transparent
              opacity={0.6}
              roughness={0.55}
              metalness={0}
            />
          </mesh>
        ))}
        {model.eyes.map((eye, i) => (
          <mesh
            key={"eye-" + i}
            geometry={UNIT_SPHERE_LO}
            position={[eye.x, eye.y, eye.z]}
            scale={eye.r}
          >
            <meshStandardMaterial
              color={model.faceColor}
              roughness={0.4}
              metalness={0}
            />
          </mesh>
        ))}
        <mesh geometry={smileTubeGeometry()} position={[0, model.body.cy, 0]}>
          <meshStandardMaterial
            color={model.faceColor}
            roughness={0.4}
            metalness={0}
          />
        </mesh>
        {model.showAntenna && !cosmetics?.hat ? (
          <mesh
            geometry={UNIT_SPHERE_LO}
            position={[model.antenna.x, model.antenna.y, model.antenna.z]}
            scale={model.antenna.r}
          >
            <meshStandardMaterial
              color={model.accentColor}
              emissive={model.accentColor}
              emissiveIntensity={0.2}
              roughness={0.45}
            />
          </mesh>
        ) : null}
        <CosmeticAttachments
          cosmetics={cosmetics}
          moving={moving}
          movingRef={movingRef}
          hatY={model.hatAnchorY}
          accessoryY={model.accessoryY}
          accessoryRadius={model.accessoryRadius}
        />
        {children}
      </group>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 16]} />
        <meshBasicMaterial
          color={selected || yours ? "#fff4b8" : "#142044"}
          transparent
          opacity={selected || yours ? 0.45 : 0.22}
        />
      </mesh>
      <Html
        position={[0, model.labelY, 0]}
        center
        sprite
        style={{ pointerEvents: "none" }}
      >
        <div className="pasture-label-stack">
          {bubble ? (
            <div ref={bubbleRef} className="pasture-bubble">
              {worldSafeText(bubble)}
            </div>
          ) : null}
          <button
            ref={nameRef}
            type="button"
            className={
              "pasture-pet-hit" +
              (yours ? " yours" : "") +
              (selected ? " is-selected" : "")
            }
            data-owner-label={label}
            data-species={model.species}
            data-feature={model.featureKind}
            style={{ pointerEvents: "auto" }}
            onClick={(event) => {
              event.stopPropagation();
              onClick?.();
            }}
          >
            {label}
          </button>
        </div>
      </Html>
    </group>
  );
}
