import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import type { Group } from "three";
import type { CreaturePose } from "../motion/pose";
import type { CreatureSkinPalette } from "../species-skins";
import { GroundContact } from "./GroundContact";
import { furMaterial, hardMaterial, loreGlow } from "./materials";

type Props = {
  palette: CreatureSkinPalette;
  selected: boolean;
  pose: RefObject<CreaturePose>;
};

/**
 * Moss-stag: sage coat, cream underside, wood antlers with moss, soft cyan
 * biolights (lichen, not neon stickers).
 */
export function MossStagMesh({ palette, selected, pose }: Props) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const frontLegs = useRef<Group>(null);
  const hindLegs = useRef<Group>(null);
  const coat = furMaterial(palette.primary, 0.93);
  const cream = furMaterial(palette.secondary, 0.94);
  const legFur = furMaterial("#C8C0B0", 0.9);
  const moss = furMaterial("#3F6B45", 0.96);
  const wood = hardMaterial(palette.accent, 0.8);
  const hoof = hardMaterial("#1A1612", 0.72);
  const bio = loreGlow(palette, selected ? 0.9 : 0.55);

  useFrame(() => {
    const p = pose.current;
    if (!p || !root.current) return;
    root.current.rotation.x = p.bodyPitch * 0.35;
    if (head.current) head.current.rotation.x = p.headPitch;
    const swing = Math.sin(p.gait * Math.PI * 2) * 0.32 * p.gaitWeight;
    if (frontLegs.current) frontLegs.current.rotation.x = swing;
    if (hindLegs.current) hindLegs.current.rotation.x = -swing * 0.85;
  });

  return (
    <group ref={root}>
      <GroundContact radius={0.36} opacity={selected ? 0.52 : 0.4} />

      {/* Elongated body with fur volume */}
      <mesh position={[0, 0.26, 0]} scale={[0.78, 0.68, 1.5]} castShadow>
        <sphereGeometry args={[0.16, 18, 16]} />
        <meshStandardMaterial {...coat} />
      </mesh>
      <mesh position={[0, 0.17, 0.04]} scale={[0.58, 0.42, 1.15]}>
        <sphereGeometry args={[0.13, 14, 12]} />
        <meshStandardMaterial {...cream} />
      </mesh>
      {/* Leafy withers / neck mane */}
      <mesh position={[0, 0.36, 0.06]} scale={[0.75, 0.58, 0.75]}>
        <sphereGeometry args={[0.12, 12, 10]} />
        <meshStandardMaterial {...moss} />
      </mesh>
      {(
        [
          [-0.05, 0.4, 0.1],
          [0.05, 0.4, 0.1],
          [0, 0.42, 0.02],
        ] as const
      ).map((pos, i) => (
        <mesh key={`tuft-${i}`} position={pos} scale={[0.8, 1.1, 0.7]}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshStandardMaterial {...moss} />
        </mesh>
      ))}

      <group ref={head}>
        <mesh position={[0, 0.44, 0.24]} castShadow>
          <sphereGeometry args={[0.095, 16, 14]} />
          <meshStandardMaterial {...coat} />
        </mesh>
        <mesh position={[0, 0.41, 0.32]} rotation={[0.32, 0, 0]}>
          <coneGeometry args={[0.036, 0.095, 8]} />
          <meshStandardMaterial {...cream} />
        </mesh>
        <mesh position={[0, 0.405, 0.365]}>
          <sphereGeometry args={[0.016, 8, 8]} />
          <meshStandardMaterial {...hoof} />
        </mesh>
        {/* Soft dark eyes */}
        <mesh position={[-0.036, 0.46, 0.3]}>
          <sphereGeometry args={[0.017, 10, 10]} />
          <meshStandardMaterial color="#1C1814" roughness={0.35} />
        </mesh>
        <mesh position={[0.036, 0.46, 0.3]}>
          <sphereGeometry args={[0.017, 10, 10]} />
          <meshStandardMaterial color="#1C1814" roughness={0.35} />
        </mesh>
        {/* Ears */}
        <mesh position={[-0.07, 0.52, 0.2]} rotation={[0.2, 0, -0.45]}>
          <coneGeometry args={[0.028, 0.09, 6]} />
          <meshStandardMaterial {...coat} />
        </mesh>
        <mesh position={[0.07, 0.52, 0.2]} rotation={[0.2, 0, 0.45]}>
          <coneGeometry args={[0.028, 0.09, 6]} />
          <meshStandardMaterial {...coat} />
        </mesh>

        {/* Branch antlers + moss */}
        <mesh position={[-0.06, 0.6, 0.18]} rotation={[0.1, 0, -0.35]}>
          <cylinderGeometry args={[0.014, 0.02, 0.24, 6]} />
          <meshStandardMaterial {...wood} />
        </mesh>
        <mesh position={[0.06, 0.6, 0.18]} rotation={[0.1, 0, 0.35]}>
          <cylinderGeometry args={[0.014, 0.02, 0.24, 6]} />
          <meshStandardMaterial {...wood} />
        </mesh>
        <mesh position={[-0.125, 0.7, 0.14]} rotation={[0.05, 0.25, -1.05]}>
          <cylinderGeometry args={[0.01, 0.012, 0.13, 5]} />
          <meshStandardMaterial {...wood} />
        </mesh>
        <mesh position={[0.125, 0.7, 0.14]} rotation={[0.05, -0.25, 1.05]}>
          <cylinderGeometry args={[0.01, 0.012, 0.13, 5]} />
          <meshStandardMaterial {...wood} />
        </mesh>
        <mesh position={[-0.08, 0.74, 0.2]} rotation={[-0.4, 0, -0.2]}>
          <cylinderGeometry args={[0.008, 0.01, 0.1, 5]} />
          <meshStandardMaterial {...wood} />
        </mesh>
        <mesh position={[0.08, 0.74, 0.2]} rotation={[-0.4, 0, 0.2]}>
          <cylinderGeometry args={[0.008, 0.01, 0.1, 5]} />
          <meshStandardMaterial {...wood} />
        </mesh>
        <mesh position={[-0.1, 0.64, 0.16]} scale={[1.1, 0.85, 1]}>
          <sphereGeometry args={[0.034, 8, 6]} />
          <meshStandardMaterial {...moss} />
        </mesh>
        <mesh position={[0.1, 0.64, 0.16]} scale={[1.1, 0.85, 1]}>
          <sphereGeometry args={[0.034, 8, 6]} />
          <meshStandardMaterial {...moss} />
        </mesh>
        <mesh position={[-0.14, 0.72, 0.12]} scale={[0.7, 0.9, 0.7]}>
          <sphereGeometry args={[0.022, 6, 6]} />
          <meshStandardMaterial {...moss} />
        </mesh>
        <mesh position={[0.14, 0.72, 0.12]} scale={[0.7, 0.9, 0.7]}>
          <sphereGeometry args={[0.022, 6, 6]} />
          <meshStandardMaterial {...moss} />
        </mesh>
      </group>

      {/* Soft cyan biolights (lichen / firefly, atmospheric) */}
      {(
        [
          [-0.048, 0.45, 0.28],
          [0.048, 0.45, 0.28],
          [-0.11, 0.28, -0.04],
          [0.11, 0.28, -0.04],
          [0, 0.3, -0.15],
          [-0.055, 0.32, 0.06],
          [0.055, 0.32, 0.06],
        ] as const
      ).map((pos, index) => (
        <mesh key={`bio-${index}`} position={pos}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshStandardMaterial {...bio} />
        </mesh>
      ))}
      <pointLight
        position={[0, 0.34, 0]}
        color={palette.emissive}
        intensity={selected ? 0.28 : 0.14}
        distance={1.8}
        decay={2}
      />

      <group ref={frontLegs}>
        {(
          [
            [-0.085, 0.09, 0.14],
            [0.085, 0.09, 0.14],
          ] as const
        ).map((pos, index) => (
          <group key={`fl-${index}`} position={pos}>
            <mesh position={[0, 0.02, 0]}>
              <cylinderGeometry args={[0.022, 0.028, 0.1, 7]} />
              <meshStandardMaterial {...coat} />
            </mesh>
            <mesh position={[0, -0.05, 0]}>
              <cylinderGeometry args={[0.018, 0.022, 0.1, 7]} />
              <meshStandardMaterial {...legFur} />
            </mesh>
            <mesh position={[0, -0.1, 0.01]} scale={[1.1, 0.55, 1.3]}>
              <sphereGeometry args={[0.028, 8, 6]} />
              <meshStandardMaterial {...hoof} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={hindLegs}>
        {(
          [
            [-0.075, 0.09, -0.14],
            [0.075, 0.09, -0.14],
          ] as const
        ).map((pos, index) => (
          <group key={`hl-${index}`} position={pos}>
            <mesh position={[0, 0.02, 0]}>
              <cylinderGeometry args={[0.024, 0.03, 0.1, 7]} />
              <meshStandardMaterial {...coat} />
            </mesh>
            <mesh position={[0, -0.05, 0]}>
              <cylinderGeometry args={[0.018, 0.022, 0.1, 7]} />
              <meshStandardMaterial {...legFur} />
            </mesh>
            <mesh position={[0, -0.1, 0.01]} scale={[1.1, 0.55, 1.3]}>
              <sphereGeometry args={[0.028, 8, 6]} />
              <meshStandardMaterial {...hoof} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
