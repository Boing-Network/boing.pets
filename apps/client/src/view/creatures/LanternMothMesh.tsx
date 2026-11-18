import { DoubleSide } from "three";
import type { CreatureSkinPalette } from "../species-skins";

type Props = {
  palette: CreatureSkinPalette;
  selected: boolean;
};

/** Stylized lantern-moth silhouette: fluffy body, glowing core, wide wings. */
export function LanternMothMesh({ palette, selected }: Props) {
  const scale = selected ? 1.1 : 1;
  return (
    <group scale={scale} position={[0, 0.12, 0]}>
      {/* Fluffy body */}
      <mesh position={[0, 0.14, 0]} castShadow>
        <sphereGeometry args={[0.14, 16, 14]} />
        <meshStandardMaterial
          color={palette.primary}
          roughness={0.85}
          metalness={0}
        />
      </mesh>
      {/* Lantern abdomen glow */}
      <mesh position={[0, 0.06, 0.02]}>
        <sphereGeometry args={[0.085, 12, 10]} />
        <meshStandardMaterial
          color={palette.emissive}
          emissive={palette.emissive}
          emissiveIntensity={palette.emissiveIntensity}
          roughness={0.25}
        />
      </mesh>
      <pointLight
        position={[0, 0.08, 0.06]}
        color={palette.emissive}
        intensity={selected ? 1.1 : 0.7}
        distance={2.6}
      />
      {/* Head */}
      <mesh position={[0, 0.24, 0.1]}>
        <sphereGeometry args={[0.08, 12, 10]} />
        <meshStandardMaterial color={palette.primary} roughness={0.8} />
      </mesh>
      {/* Large amber eyes */}
      <mesh position={[-0.035, 0.25, 0.16]}>
        <sphereGeometry args={[0.028, 10, 10]} />
        <meshStandardMaterial
          color="#3B2418"
          emissive="#C48A2A"
          emissiveIntensity={0.4}
          roughness={0.15}
        />
      </mesh>
      <mesh position={[0.035, 0.25, 0.16]}>
        <sphereGeometry args={[0.028, 10, 10]} />
        <meshStandardMaterial
          color="#3B2418"
          emissive="#C48A2A"
          emissiveIntensity={0.4}
          roughness={0.15}
        />
      </mesh>
      {/* Feathered antennae */}
      <mesh position={[-0.05, 0.36, 0.1]} rotation={[0.15, 0, -0.55]}>
        <cylinderGeometry args={[0.006, 0.01, 0.16, 5]} />
        <meshStandardMaterial color={palette.secondary} roughness={0.55} />
      </mesh>
      <mesh position={[0.05, 0.36, 0.1]} rotation={[0.15, 0, 0.55]}>
        <cylinderGeometry args={[0.006, 0.01, 0.16, 5]} />
        <meshStandardMaterial color={palette.secondary} roughness={0.55} />
      </mesh>
      <mesh position={[-0.1, 0.43, 0.07]}>
        <sphereGeometry args={[0.025, 8, 6]} />
        <meshStandardMaterial color={palette.secondary} roughness={0.65} />
      </mesh>
      <mesh position={[0.1, 0.43, 0.07]}>
        <sphereGeometry args={[0.025, 8, 6]} />
        <meshStandardMaterial color={palette.secondary} roughness={0.65} />
      </mesh>
      {/* Wide iridescent wings */}
      <mesh
        position={[-0.2, 0.2, -0.02]}
        rotation={[0.25, 0.45, -0.45]}
        castShadow
      >
        <planeGeometry args={[0.42, 0.28]} />
        <meshStandardMaterial
          color={palette.accent}
          emissive={palette.accent}
          emissiveIntensity={0.75}
          transparent
          opacity={0.78}
          side={DoubleSide}
          roughness={0.2}
          metalness={0.2}
        />
      </mesh>
      <mesh
        position={[0.2, 0.2, -0.02]}
        rotation={[0.25, -0.45, 0.45]}
        castShadow
      >
        <planeGeometry args={[0.42, 0.28]} />
        <meshStandardMaterial
          color={palette.accent}
          emissive={palette.accent}
          emissiveIntensity={0.75}
          transparent
          opacity={0.78}
          side={DoubleSide}
          roughness={0.2}
          metalness={0.2}
        />
      </mesh>
      {/* Wing glow eyespots */}
      <mesh position={[-0.28, 0.22, 0.02]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial
          color={palette.emissive}
          emissive={palette.emissive}
          emissiveIntensity={1}
        />
      </mesh>
      <mesh position={[0.28, 0.22, 0.02]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial
          color={palette.emissive}
          emissive={palette.emissive}
          emissiveIntensity={1}
        />
      </mesh>
      {/* Tiny legs */}
      {(
        [
          [-0.04, 0.02, 0.05],
          [0.04, 0.02, 0.05],
          [0, 0.02, -0.03],
        ] as const
      ).map((pos, index) => (
        <mesh key={index} position={pos}>
          <cylinderGeometry args={[0.007, 0.01, 0.06, 4]} />
          <meshStandardMaterial color={palette.secondary} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
