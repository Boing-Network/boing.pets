import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, type MutableRefObject, type ReactNode } from "react";
import type { Group } from "three";
import type { EquippedCosmetics } from "../../content/cosmetics";
import { pasturePetLabel } from "../../pasture3d/labels";
import { worldSafeText } from "../lib/worldFont";
import { CosmeticAttachments } from "./CosmeticAttachments";

export type PetMeshLook = {
  species?: string;
  hue: number;
  accent: number;
  antenna?: number;
  spots?: number;
};

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
  const body = `hsl(${look.hue} 75% 72%)`;
  const accent = `hsl(${look.accent} 80% 70%)`;

  useFrame(({ clock }) => {
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
      scale={scale}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <group ref={hop}>
        <mesh position={[0, 0.42, 0]} castShadow={false}>
          <sphereGeometry args={[0.42, 16, 16]} />
          <meshStandardMaterial color={body} roughness={0.45} />
        </mesh>
        <mesh position={[-0.16, 0.28, 0.3]}>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshStandardMaterial color={accent} roughness={0.5} />
        </mesh>
        <mesh position={[0.16, 0.28, 0.3]}>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshStandardMaterial color={accent} roughness={0.5} />
        </mesh>
        {(look.antenna || 0) > 0 && !cosmetics?.hat ? (
          <mesh position={[0, 0.82, 0]}>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.2}
            />
          </mesh>
        ) : null}
        {Array.from({ length: Math.min(look.spots || 0, 3) }, (_, i) => (
          <mesh key={i} position={[-0.14 + i * 0.14, 0.38, 0.3]}>
            <sphereGeometry args={[0.045, 6, 6]} />
            <meshStandardMaterial color={accent} transparent opacity={0.7} />
          </mesh>
        ))}
        <CosmeticAttachments
          cosmetics={cosmetics}
          moving={moving}
          movingRef={movingRef}
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
        position={[0, 1.45, 0]}
        center
        sprite
        style={{ pointerEvents: "none" }}
      >
        <div className="pasture-label-stack">
          {bubble ? (
            <div className="pasture-bubble">{worldSafeText(bubble)}</div>
          ) : null}
          <button
            type="button"
            className={
              "pasture-pet-hit" +
              (yours ? " yours" : "") +
              (selected ? " is-selected" : "")
            }
            data-owner-label={label}
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
