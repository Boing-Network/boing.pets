import type { CreatureSkinPalette } from "../species-skins";

type Props = {
  palette: CreatureSkinPalette;
  selected: boolean;
};

/** Stylized moss-stag silhouette: long body, branch antlers, cyan biolights. */
export function MossStagMesh({ palette, selected }: Props) {
  const scale = selected ? 1.1 : 1;
  return (
    <group scale={scale}>
      {/* Elongated body */}
      <mesh position={[0, 0.24, 0]} scale={[0.75, 0.65, 1.45]} castShadow>
        <sphereGeometry args={[0.16, 16, 14]} />
        <meshStandardMaterial
          color={palette.primary}
          roughness={0.7}
          metalness={0.02}
        />
      </mesh>
      {/* Cream underside */}
      <mesh position={[0, 0.16, 0.05]} scale={[0.55, 0.4, 1.1]}>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshStandardMaterial color={palette.secondary} roughness={0.65} />
      </mesh>
      {/* Leafy neck / withers */}
      <mesh position={[0, 0.34, 0.08]} scale={[0.7, 0.55, 0.7]}>
        <sphereGeometry args={[0.12, 10, 8]} />
        <meshStandardMaterial color="#3F6B45" roughness={0.85} />
      </mesh>
      {/* Head + muzzle */}
      <mesh position={[0, 0.42, 0.22]} castShadow>
        <sphereGeometry args={[0.09, 14, 12]} />
        <meshStandardMaterial color={palette.primary} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.39, 0.3]} rotation={[0.35, 0, 0]}>
        <coneGeometry args={[0.035, 0.09, 8]} />
        <meshStandardMaterial color={palette.secondary} roughness={0.6} />
      </mesh>
      <mesh position={[-0.035, 0.44, 0.28]}>
        <sphereGeometry args={[0.016, 8, 8]} />
        <meshStandardMaterial color="#1C1814" />
      </mesh>
      <mesh position={[0.035, 0.44, 0.28]}>
        <sphereGeometry args={[0.016, 8, 8]} />
        <meshStandardMaterial color="#1C1814" />
      </mesh>
      {/* Branch antlers (tall readable silhouette) */}
      <mesh position={[-0.06, 0.58, 0.16]} rotation={[0.1, 0, -0.35]}>
        <cylinderGeometry args={[0.014, 0.02, 0.22, 6]} />
        <meshStandardMaterial color={palette.accent} roughness={0.75} />
      </mesh>
      <mesh position={[0.06, 0.58, 0.16]} rotation={[0.1, 0, 0.35]}>
        <cylinderGeometry args={[0.014, 0.02, 0.22, 6]} />
        <meshStandardMaterial color={palette.accent} roughness={0.75} />
      </mesh>
      <mesh position={[-0.12, 0.68, 0.12]} rotation={[0.05, 0.25, -1.05]}>
        <cylinderGeometry args={[0.01, 0.012, 0.12, 5]} />
        <meshStandardMaterial color={palette.accent} roughness={0.75} />
      </mesh>
      <mesh position={[0.12, 0.68, 0.12]} rotation={[0.05, -0.25, 1.05]}>
        <cylinderGeometry args={[0.01, 0.012, 0.12, 5]} />
        <meshStandardMaterial color={palette.accent} roughness={0.75} />
      </mesh>
      <mesh position={[-0.08, 0.72, 0.18]} rotation={[-0.4, 0, -0.2]}>
        <cylinderGeometry args={[0.008, 0.01, 0.09, 5]} />
        <meshStandardMaterial color={palette.accent} roughness={0.75} />
      </mesh>
      <mesh position={[0.08, 0.72, 0.18]} rotation={[-0.4, 0, 0.2]}>
        <cylinderGeometry args={[0.008, 0.01, 0.09, 5]} />
        <meshStandardMaterial color={palette.accent} roughness={0.75} />
      </mesh>
      {/* Moss clumps on antlers */}
      <mesh position={[-0.1, 0.62, 0.14]}>
        <sphereGeometry args={[0.03, 8, 6]} />
        <meshStandardMaterial color="#3F6B45" roughness={0.9} />
      </mesh>
      <mesh position={[0.1, 0.62, 0.14]}>
        <sphereGeometry args={[0.03, 8, 6]} />
        <meshStandardMaterial color="#3F6B45" roughness={0.9} />
      </mesh>
      {/* Cyan biolights */}
      {(
        [
          [-0.045, 0.43, 0.26],
          [0.045, 0.43, 0.26],
          [-0.1, 0.26, -0.05],
          [0.1, 0.26, -0.05],
          [0, 0.28, -0.14],
          [-0.05, 0.3, 0.05],
          [0.05, 0.3, 0.05],
        ] as const
      ).map((pos, index) => (
        <mesh key={index} position={pos}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshStandardMaterial
            color={palette.emissive}
            emissive={palette.emissive}
            emissiveIntensity={palette.emissiveIntensity}
          />
        </mesh>
      ))}
      <pointLight
        position={[0, 0.32, 0]}
        color={palette.emissive}
        intensity={selected ? 0.65 : 0.35}
        distance={2}
      />
      {/* Tall legs */}
      {(
        [
          [-0.08, 0.08, 0.12],
          [0.08, 0.08, 0.12],
          [-0.07, 0.08, -0.12],
          [0.07, 0.08, -0.12],
        ] as const
      ).map((pos, index) => (
        <mesh key={index} position={pos}>
          <cylinderGeometry args={[0.018, 0.024, 0.16, 6]} />
          <meshStandardMaterial color={palette.secondary} roughness={0.7} />
        </mesh>
      ))}
      {(
        [
          [-0.08, 0.01, 0.12],
          [0.08, 0.01, 0.12],
          [-0.07, 0.01, -0.12],
          [0.07, 0.01, -0.12],
        ] as const
      ).map((pos, index) => (
        <mesh key={`h-${index}`} position={pos}>
          <cylinderGeometry args={[0.024, 0.024, 0.03, 6]} />
          <meshStandardMaterial color="#1A1612" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}
