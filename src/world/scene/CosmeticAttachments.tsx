import { useFrame } from "@react-three/fiber";
import { useRef, type MutableRefObject } from "react";
import type { Group } from "three";
import type { EquippedCosmetics } from "../../content/cosmetics";

/** Visual attachments for equipped cosmetics. Positions assume a ~0.45 body radius. */
export function CosmeticAttachments({
  cosmetics,
  moving = false,
  movingRef,
  scale = 1,
  hatY,
  accessoryY,
  accessoryRadius,
}: {
  cosmetics?: EquippedCosmetics;
  moving?: boolean;
  movingRef?: MutableRefObject<boolean>;
  scale?: number;
  hatY?: number;
  accessoryY?: number;
  accessoryRadius?: number;
}) {
  if (!cosmetics) return null;
  return (
    <group scale={scale}>
      {cosmetics.hat ? <Hat id={cosmetics.hat} hatY={hatY} /> : null}
      {cosmetics.accessory ? (
        <Accessory
          id={cosmetics.accessory}
          y={accessoryY}
          radius={accessoryRadius}
        />
      ) : null}
      {cosmetics.trail ? (
        <Trail id={cosmetics.trail} moving={moving} movingRef={movingRef} />
      ) : null}
    </group>
  );
}

function Hat({ id, hatY }: { id: string; hatY?: number }) {
  if (id === "hat-antenna") {
    return (
      <group position={[0, hatY ?? 0.62, 0]}>
        <mesh>
          <cylinderGeometry args={[0.02, 0.02, 0.28, 6]} />
          <meshStandardMaterial
            color="#c9d4e8"
            metalness={0.4}
            roughness={0.35}
          />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial
            color="#7fd0ff"
            emissive="#4aa7ff"
            emissiveIntensity={0.55}
          />
        </mesh>
      </group>
    );
  }
  if (id === "hat-stardust") {
    return (
      <group position={[0, hatY ?? 0.58, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.22, 0.03, 8, 20]} />
          <meshStandardMaterial
            color="#f4e7a0"
            emissive="#ffe08a"
            emissiveIntensity={0.4}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <octahedronGeometry args={[0.08, 0]} />
          <meshStandardMaterial
            color="#fff4c8"
            emissive="#ffd36a"
            emissiveIntensity={0.5}
          />
        </mesh>
      </group>
    );
  }
  // hat-ribbon and unknown hats
  return (
    <group position={[0, hatY ?? 0.5, 0]}>
      <mesh>
        <cylinderGeometry args={[0.22, 0.24, 0.12, 12]} />
        <meshStandardMaterial color="#c45b7a" roughness={0.55} />
      </mesh>
      <mesh position={[0.16, -0.02, 0.1]} rotation={[0.2, 0.4, 0.6]}>
        <boxGeometry args={[0.16, 0.04, 0.08]} />
        <meshStandardMaterial color="#f2d38a" roughness={0.5} />
      </mesh>
    </group>
  );
}

function Accessory({
  id,
  y,
  radius,
}: {
  id: string;
  y?: number;
  radius?: number;
}) {
  const aurora = id === "frame-aurora";
  return (
    <mesh position={[0, y ?? 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius ?? 0.52, 0.035, 8, 24]} />
      <meshStandardMaterial
        color={aurora ? "#8ce0ff" : "#e8c27a"}
        emissive={aurora ? "#66b8ff" : "#a67c2a"}
        emissiveIntensity={aurora ? 0.45 : 0.2}
        metalness={aurora ? 0.2 : 0.65}
        roughness={0.35}
      />
    </mesh>
  );
}

/** Grip for an equipped pick. Parent this to the StreetBody `held` hand anchor. */
export function HeldPick({ id }: { id: string }) {
  const crystal = id === "tool-pick-crystal";
  const aether = id === "tool-pick-aether";
  const wood = id === "tool-pick-wood";
  const head = crystal
    ? "#9be7ff"
    : aether
      ? "#e4c6ff"
      : wood
        ? "#c4a574"
        : "#d5dbe3";
  const handle = wood ? "#6b4a2a" : "#5c5148";
  return (
    <group>
      {/* Local +Y runs down the hand bone toward the fingers. */}
      <mesh position={[0, 0.16, 0.02]} castShadow>
        <cylinderGeometry args={[0.018, 0.022, 0.34, 6]} />
        <meshStandardMaterial color={handle} roughness={0.65} />
      </mesh>
      <mesh position={[0.02, 0.34, 0.04]} rotation={[0.35, 0, 0.15]} castShadow>
        <boxGeometry args={[0.16, 0.045, 0.07]} />
        <meshStandardMaterial
          color={head}
          metalness={wood ? 0.15 : 0.75}
          roughness={wood ? 0.55 : 0.28}
          emissive={crystal || aether ? head : "#000000"}
          emissiveIntensity={crystal || aether ? 0.35 : 0}
        />
      </mesh>
    </group>
  );
}

function Trail({
  id,
  moving,
  movingRef,
}: {
  id: string;
  moving: boolean;
  movingRef?: MutableRefObject<boolean>;
}) {
  const group = useRef<Group>(null);
  const crystal = id === "tool-pick-crystal";
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    const isMoving = movingRef?.current ?? moving;
    group.current.children.forEach((child, i) => {
      child.position.y = 0.12 + Math.sin(t * 4 + i) * (isMoving ? 0.08 : 0.03);
      const mat = (child as { material?: { opacity: number } }).material;
      if (mat) mat.opacity = isMoving ? 0.55 - i * 0.15 : 0.2;
    });
  });
  return (
    <group>
      <group ref={group} position={[0, 0.08, -0.35]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0, -0.18 * i]}>
            <sphereGeometry args={[0.07 - i * 0.015, 6, 6]} />
            <meshStandardMaterial
              color={crystal ? "#9be7ff" : "#d7c4a0"}
              transparent
              opacity={0.4}
              emissive={crystal ? "#5ad0ff" : "#c9b089"}
              emissiveIntensity={0.2}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}
