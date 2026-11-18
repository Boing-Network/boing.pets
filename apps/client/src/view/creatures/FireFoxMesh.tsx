import type { CreatureSkinPalette } from "../species-skins";

type Props = {
  palette: CreatureSkinPalette;
  selected: boolean;
};

/** Stylized fire-fox silhouette: tall ears, bushy flame-tail, glowing chest. */
export function FireFoxMesh({ palette, selected }: Props) {
  const scale = selected ? 1.1 : 1;
  return (
    <group scale={scale}>
      {/* Torso */}
      <mesh position={[0, 0.18, 0.02]} scale={[0.85, 0.7, 1.15]} castShadow>
        <sphereGeometry args={[0.16, 16, 14]} />
        <meshStandardMaterial
          color={palette.primary}
          roughness={0.5}
          metalness={0.05}
        />
      </mesh>
      {/* Chest cream + ember */}
      <mesh position={[0, 0.15, 0.12]} scale={[0.7, 0.65, 0.55]}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <meshStandardMaterial color={palette.secondary} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.16, 0.17]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial
          color={palette.emissive}
          emissive={palette.emissive}
          emissiveIntensity={palette.emissiveIntensity}
        />
      </mesh>
      <pointLight
        position={[0, 0.16, 0.22]}
        color={palette.emissive}
        intensity={selected ? 0.9 : 0.5}
        distance={2.2}
      />
      {/* Head */}
      <mesh position={[0, 0.34, 0.12]} castShadow>
        <sphereGeometry args={[0.11, 14, 12]} />
        <meshStandardMaterial color={palette.primary} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.31, 0.2]} rotation={[0.4, 0, 0]}>
        <coneGeometry args={[0.04, 0.08, 8]} />
        <meshStandardMaterial color={palette.secondary} roughness={0.5} />
      </mesh>
      {/* Tall ears */}
      <mesh position={[-0.07, 0.48, 0.08]} rotation={[0.15, 0, -0.3]}>
        <coneGeometry args={[0.045, 0.16, 6]} />
        <meshStandardMaterial color={palette.primary} roughness={0.45} />
      </mesh>
      <mesh position={[0.07, 0.48, 0.08]} rotation={[0.15, 0, 0.3]}>
        <coneGeometry args={[0.045, 0.16, 6]} />
        <meshStandardMaterial color={palette.primary} roughness={0.45} />
      </mesh>
      <mesh position={[-0.07, 0.49, 0.09]} rotation={[0.15, 0, -0.3]}>
        <coneGeometry args={[0.022, 0.1, 5]} />
        <meshStandardMaterial color={palette.accent} roughness={0.6} />
      </mesh>
      <mesh position={[0.07, 0.49, 0.09]} rotation={[0.15, 0, 0.3]}>
        <coneGeometry args={[0.022, 0.1, 5]} />
        <meshStandardMaterial color={palette.accent} roughness={0.6} />
      </mesh>
      {/* Eyes */}
      <mesh position={[-0.035, 0.36, 0.2]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial
          color="#1A120C"
          emissive="#E07020"
          emissiveIntensity={0.55}
        />
      </mesh>
      <mesh position={[0.035, 0.36, 0.2]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial
          color="#1A120C"
          emissive="#E07020"
          emissiveIntensity={0.55}
        />
      </mesh>
      {/* Dark socks */}
      {(
        [
          [-0.07, 0.05, 0.08],
          [0.07, 0.05, 0.08],
          [-0.06, 0.05, -0.08],
          [0.06, 0.05, -0.08],
        ] as const
      ).map((pos, index) => (
        <mesh key={index} position={pos}>
          <cylinderGeometry args={[0.022, 0.026, 0.1, 6]} />
          <meshStandardMaterial color={palette.accent} roughness={0.7} />
        </mesh>
      ))}
      {/* Bushy flame tail (signature silhouette) */}
      <mesh position={[0, 0.2, -0.18]} rotation={[0.9, 0, 0]} castShadow>
        <sphereGeometry args={[0.11, 12, 10]} />
        <meshStandardMaterial color={palette.primary} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.34, -0.28]} rotation={[1.05, 0, 0]}>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial
          color={palette.accent}
          emissive={palette.emissive}
          emissiveIntensity={0.55}
        />
      </mesh>
      <mesh position={[0, 0.46, -0.34]}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshStandardMaterial
          color={palette.emissive}
          emissive={palette.emissive}
          emissiveIntensity={1.2}
        />
      </mesh>
    </group>
  );
}
