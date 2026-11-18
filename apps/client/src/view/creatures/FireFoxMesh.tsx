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
 * Fire-fox: burnt-orange fur, cream chest, dark socks, soft ember mark.
 * Fur is suggested with layered tufts and high roughness — not flat plastic.
 */
export function FireFoxMesh({ palette, selected, pose }: Props) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const frontLegs = useRef<Group>(null);
  const hindLegs = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const fur = furMaterial(palette.primary, 0.9);
  const cream = furMaterial(palette.secondary, 0.93);
  const dark = hardMaterial(palette.accent, 0.82);
  const ember = loreGlow(palette, selected ? 1.15 : 0.85);
  const mane = furMaterial("#C86A32", 0.94);
  const tip = furMaterial("#3A2A22", 0.88);

  useFrame(() => {
    const p = pose.current;
    if (!p || !root.current) return;
    root.current.rotation.x = p.bodyPitch * 0.35;
    if (head.current) head.current.rotation.x = p.headPitch;
    const swing = Math.sin(p.gait * Math.PI * 2) * 0.42 * p.gaitWeight;
    if (frontLegs.current) frontLegs.current.rotation.x = swing;
    if (hindLegs.current) hindLegs.current.rotation.x = -swing * 0.9;
    if (tail.current) {
      tail.current.rotation.x = 0.15 + Math.sin(p.gait * Math.PI * 2) * 0.08;
      tail.current.rotation.z = Math.sin(p.gait * Math.PI * 2 + 0.6) * 0.12;
    }
  });

  return (
    <group ref={root}>
      <GroundContact radius={0.3} opacity={selected ? 0.5 : 0.38} />

      {/* Torso + layered fur volume */}
      <mesh position={[0, 0.2, 0.02]} scale={[0.9, 0.72, 1.2]} castShadow>
        <sphereGeometry args={[0.16, 18, 16]} />
        <meshStandardMaterial {...fur} />
      </mesh>
      <mesh position={[0, 0.24, -0.02]} scale={[0.72, 0.45, 0.95]}>
        <sphereGeometry args={[0.14, 12, 10]} />
        <meshStandardMaterial {...mane} />
      </mesh>
      {/* Chest cream + soft ember (lore glow, atmospheric) */}
      <mesh position={[0, 0.16, 0.13]} scale={[0.72, 0.68, 0.58]}>
        <sphereGeometry args={[0.1, 14, 12]} />
        <meshStandardMaterial {...cream} />
      </mesh>
      <mesh position={[0, 0.17, 0.18]}>
        <sphereGeometry args={[0.038, 12, 12]} />
        <meshStandardMaterial {...ember} />
      </mesh>
      <pointLight
        position={[0, 0.17, 0.22]}
        color={palette.emissive}
        intensity={selected ? 0.45 : 0.22}
        distance={1.6}
        decay={2}
      />

      {/* Neck mane tufts */}
      {(
        [
          [-0.06, 0.28, 0.1],
          [0.06, 0.28, 0.1],
          [0, 0.3, 0.06],
        ] as const
      ).map((pos, i) => (
        <mesh key={`mane-${i}`} position={pos} scale={[0.7, 1, 0.7]}>
          <sphereGeometry args={[0.045, 8, 6]} />
          <meshStandardMaterial {...cream} />
        </mesh>
      ))}

      <group ref={head}>
        <mesh position={[0, 0.36, 0.13]} castShadow>
          <sphereGeometry args={[0.11, 16, 14]} />
          <meshStandardMaterial {...fur} />
        </mesh>
        <mesh position={[0, 0.33, 0.21]} rotation={[0.35, 0, 0]}>
          <coneGeometry args={[0.042, 0.085, 8]} />
          <meshStandardMaterial {...cream} />
        </mesh>
        <mesh position={[0, 0.325, 0.255]}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshStandardMaterial {...dark} />
        </mesh>
        {/* Tall ears with dark rims */}
        <mesh position={[-0.07, 0.5, 0.09]} rotation={[0.12, 0, -0.28]}>
          <coneGeometry args={[0.048, 0.17, 7]} />
          <meshStandardMaterial {...fur} />
        </mesh>
        <mesh position={[0.07, 0.5, 0.09]} rotation={[0.12, 0, 0.28]}>
          <coneGeometry args={[0.048, 0.17, 7]} />
          <meshStandardMaterial {...fur} />
        </mesh>
        <mesh position={[-0.07, 0.51, 0.1]} rotation={[0.12, 0, -0.28]}>
          <coneGeometry args={[0.024, 0.11, 6]} />
          <meshStandardMaterial {...cream} />
        </mesh>
        <mesh position={[0.07, 0.51, 0.1]} rotation={[0.12, 0, 0.28]}>
          <coneGeometry args={[0.024, 0.11, 6]} />
          <meshStandardMaterial {...cream} />
        </mesh>
        <mesh position={[-0.075, 0.58, 0.08]}>
          <sphereGeometry args={[0.018, 6, 6]} />
          <meshStandardMaterial {...tip} />
        </mesh>
        <mesh position={[0.075, 0.58, 0.08]}>
          <sphereGeometry args={[0.018, 6, 6]} />
          <meshStandardMaterial {...tip} />
        </mesh>
        {/* Amber eyes — luminous, not neon */}
        <mesh position={[-0.036, 0.38, 0.21]}>
          <sphereGeometry args={[0.02, 10, 10]} />
          <meshStandardMaterial
            color="#1A120C"
            emissive="#C86828"
            emissiveIntensity={0.28}
            roughness={0.25}
          />
        </mesh>
        <mesh position={[0.036, 0.38, 0.21]}>
          <sphereGeometry args={[0.02, 10, 10]} />
          <meshStandardMaterial
            color="#1A120C"
            emissive="#C86828"
            emissiveIntensity={0.28}
            roughness={0.25}
          />
        </mesh>
      </group>

      {/* Dark socks */}
      <group ref={frontLegs}>
        {(
          [
            [-0.075, 0.055, 0.1],
            [0.075, 0.055, 0.1],
          ] as const
        ).map((pos, index) => (
          <group key={`fl-${index}`} position={pos}>
            <mesh position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.024, 0.028, 0.08, 7]} />
              <meshStandardMaterial {...fur} />
            </mesh>
            <mesh position={[0, -0.02, 0]}>
              <cylinderGeometry args={[0.022, 0.026, 0.07, 7]} />
              <meshStandardMaterial {...dark} />
            </mesh>
            <mesh position={[0, -0.055, 0.01]} scale={[1, 0.55, 1.25]}>
              <sphereGeometry args={[0.028, 8, 6]} />
              <meshStandardMaterial {...dark} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={hindLegs}>
        {(
          [
            [-0.07, 0.055, -0.1],
            [0.07, 0.055, -0.1],
          ] as const
        ).map((pos, index) => (
          <group key={`hl-${index}`} position={pos}>
            <mesh position={[0, 0.045, 0]}>
              <cylinderGeometry args={[0.026, 0.03, 0.09, 7]} />
              <meshStandardMaterial {...fur} />
            </mesh>
            <mesh position={[0, -0.02, 0]}>
              <cylinderGeometry args={[0.022, 0.026, 0.07, 7]} />
              <meshStandardMaterial {...dark} />
            </mesh>
            <mesh position={[0, -0.055, 0.01]} scale={[1, 0.55, 1.25]}>
              <sphereGeometry args={[0.028, 8, 6]} />
              <meshStandardMaterial {...dark} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Bushy flame-tipped tail */}
      <group ref={tail} position={[0, 0.18, -0.16]}>
        <mesh position={[0, 0.04, -0.04]} rotation={[0.85, 0, 0]} castShadow>
          <sphereGeometry args={[0.1, 14, 12]} />
          <meshStandardMaterial {...fur} />
        </mesh>
        <mesh position={[0, 0.14, -0.12]} rotation={[1.0, 0, 0]}>
          <sphereGeometry args={[0.085, 12, 10]} />
          <meshStandardMaterial {...mane} />
        </mesh>
        <mesh position={[0, 0.24, -0.18]}>
          <sphereGeometry args={[0.055, 10, 8]} />
          <meshStandardMaterial {...tip} />
        </mesh>
        <mesh position={[0, 0.3, -0.2]}>
          <sphereGeometry args={[0.028, 8, 8]} />
          <meshStandardMaterial {...loreGlow(palette, 0.35)} />
        </mesh>
      </group>
    </group>
  );
}
