import { DoubleSide } from "three";
import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import type { Group } from "three";
import type { CreaturePose } from "../motion/pose";
import type { CreatureSkinPalette } from "../species-skins";
import { GroundContact } from "./GroundContact";
import {
  downMaterial,
  hardMaterial,
  loreGlow,
  wingMembrane,
} from "./materials";

type Props = {
  palette: CreatureSkinPalette;
  selected: boolean;
  pose: RefObject<CreaturePose>;
};

/**
 * Lantern-moth: downy white body, warm lantern core, iridescent membranes.
 * Glow is an inner volume light — soft and atmospheric, not neon discs.
 */
export function LanternMothMesh({ palette, selected, pose }: Props) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const leftWing = useRef<Group>(null);
  const rightWing = useRef<Group>(null);
  const down = downMaterial(palette.primary);
  const fluff = downMaterial("#E8E6F2");
  const antenna = hardMaterial(palette.secondary, 0.7);
  const leg = hardMaterial("#5A4A6A", 0.75);
  const core = loreGlow(palette, selected ? 1.05 : 0.75);
  const wing = wingMembrane(palette.accent);

  useFrame(() => {
    const p = pose.current;
    if (!p || !root.current) return;
    root.current.rotation.x = p.bodyPitch * 0.25;
    if (head.current) head.current.rotation.x = p.headPitch * 0.5;
    const flap =
      Math.sin(p.gait * Math.PI * 2) * 0.5 * Math.max(0.25, p.gaitWeight);
    if (leftWing.current) leftWing.current.rotation.z = 0.32 + flap;
    if (rightWing.current) rightWing.current.rotation.z = -0.32 - flap;
  });

  return (
    <group ref={root} position={[0, 0.1, 0]}>
      {/* Soft ground pool under hovering moth */}
      <GroundContact radius={0.34} opacity={selected ? 0.36 : 0.26} y={-0.08} />

      {/* Fluffy body with layered down suggestion */}
      <mesh position={[0, 0.14, 0]} castShadow>
        <sphereGeometry args={[0.14, 18, 16]} />
        <meshStandardMaterial {...down} />
      </mesh>
      <mesh position={[0, 0.16, -0.02]} scale={[0.95, 0.85, 1.05]}>
        <sphereGeometry args={[0.12, 12, 10]} />
        <meshStandardMaterial {...fluff} />
      </mesh>
      {(
        [
          [-0.08, 0.18, 0.02],
          [0.08, 0.18, 0.02],
          [0, 0.2, -0.06],
          [0, 0.1, 0.08],
        ] as const
      ).map((pos, i) => (
        <mesh key={`tuft-${i}`} position={pos} scale={[0.85, 1, 0.85]}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshStandardMaterial {...down} />
        </mesh>
      ))}

      {/* Inner lantern — warm volume glow */}
      <mesh position={[0, 0.08, 0.02]}>
        <sphereGeometry args={[0.078, 14, 12]} />
        <meshStandardMaterial {...core} />
      </mesh>
      <mesh position={[0, 0.08, 0.02]} scale={1.15}>
        <sphereGeometry args={[0.078, 12, 10]} />
        <meshStandardMaterial
          color={palette.emissive}
          emissive={palette.emissive}
          emissiveIntensity={palette.emissiveIntensity * 0.35}
          transparent
          opacity={0.28}
          depthWrite={false}
          roughness={0.6}
        />
      </mesh>
      <pointLight
        position={[0, 0.08, 0.04]}
        color={palette.emissive}
        intensity={selected ? 0.55 : 0.32}
        distance={2.0}
        decay={2}
      />

      <group ref={head}>
        <mesh position={[0, 0.24, 0.1]}>
          <sphereGeometry args={[0.078, 14, 12]} />
          <meshStandardMaterial {...down} />
        </mesh>
        {/* Dark liquid eyes with warm catchlight */}
        <mesh position={[-0.034, 0.25, 0.155]}>
          <sphereGeometry args={[0.028, 12, 12]} />
          <meshStandardMaterial
            color="#1A1410"
            emissive="#8A6020"
            emissiveIntensity={0.18}
            roughness={0.12}
            metalness={0.15}
          />
        </mesh>
        <mesh position={[0.034, 0.25, 0.155]}>
          <sphereGeometry args={[0.028, 12, 12]} />
          <meshStandardMaterial
            color="#1A1410"
            emissive="#8A6020"
            emissiveIntensity={0.18}
            roughness={0.12}
            metalness={0.15}
          />
        </mesh>
        {/* Feathered antennae */}
        <mesh position={[-0.05, 0.36, 0.1]} rotation={[0.15, 0, -0.55]}>
          <cylinderGeometry args={[0.005, 0.01, 0.16, 5]} />
          <meshStandardMaterial {...antenna} />
        </mesh>
        <mesh position={[0.05, 0.36, 0.1]} rotation={[0.15, 0, 0.55]}>
          <cylinderGeometry args={[0.005, 0.01, 0.16, 5]} />
          <meshStandardMaterial {...antenna} />
        </mesh>
        <mesh position={[-0.1, 0.43, 0.07]} scale={[1.2, 0.7, 0.8]}>
          <sphereGeometry args={[0.024, 8, 6]} />
          <meshStandardMaterial {...antenna} />
        </mesh>
        <mesh position={[0.1, 0.43, 0.07]} scale={[1.2, 0.7, 0.8]}>
          <sphereGeometry args={[0.024, 8, 6]} />
          <meshStandardMaterial {...antenna} />
        </mesh>
      </group>

      {/* Four-wing suggestion: soft oval membranes (not neon rectangles) */}
      <group ref={leftWing} position={[-0.05, 0.16, -0.02]}>
        <mesh
          position={[-0.15, 0.05, 0]}
          rotation={[0.2, 0.4, -0.4]}
          scale={[1, 0.7, 1]}
          castShadow
        >
          <circleGeometry args={[0.2, 18]} />
          <meshStandardMaterial {...wing} side={DoubleSide} />
        </mesh>
        <mesh
          position={[-0.12, -0.04, 0.02]}
          rotation={[0.35, 0.35, -0.55]}
          scale={[1, 0.65, 1]}
        >
          <circleGeometry args={[0.13, 14]} />
          <meshStandardMaterial {...wing} side={DoubleSide} opacity={0.45} />
        </mesh>
      </group>
      <group ref={rightWing} position={[0.05, 0.16, -0.02]}>
        <mesh
          position={[0.15, 0.05, 0]}
          rotation={[0.2, -0.4, 0.4]}
          scale={[1, 0.7, 1]}
          castShadow
        >
          <circleGeometry args={[0.2, 18]} />
          <meshStandardMaterial {...wing} side={DoubleSide} />
        </mesh>
        <mesh
          position={[0.12, -0.04, 0.02]}
          rotation={[0.35, -0.35, 0.55]}
          scale={[1, 0.65, 1]}
        >
          <circleGeometry args={[0.13, 14]} />
          <meshStandardMaterial {...wing} side={DoubleSide} opacity={0.45} />
        </mesh>
      </group>

      {/* Tiny tucked legs */}
      {(
        [
          [-0.045, 0.02, 0.05],
          [0.045, 0.02, 0.05],
          [-0.03, 0.02, -0.02],
          [0.03, 0.02, -0.02],
          [0, 0.015, 0.08],
          [0, 0.015, -0.05],
        ] as const
      ).map((pos, index) => (
        <mesh key={`leg-${index}`} position={pos} rotation={[0.4, 0, 0]}>
          <cylinderGeometry args={[0.006, 0.009, 0.055, 4]} />
          <meshStandardMaterial {...leg} />
        </mesh>
      ))}
    </group>
  );
}
