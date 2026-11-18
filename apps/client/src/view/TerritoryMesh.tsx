import { Text } from "@react-three/drei";
import type { TerritoryView } from "@boing-pets/contract";
import { layoutForSlug } from "./layout";

type Props = {
  territory: TerritoryView;
};

/** Bioluminescent flora markers around a territory shore. */
function FloraRing({ radius }: { radius: number }) {
  const count = 10;
  const markers = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const r = radius * 0.78;
    return {
      x: Math.cos(angle) * r,
      z: Math.sin(angle) * r,
      h: 0.18 + (index % 3) * 0.08,
    };
  });
  return (
    <group>
      {markers.map((m, index) => (
        <mesh key={index} position={[m.x, m.h / 2, m.z]}>
          <cylinderGeometry args={[0.015, 0.03, m.h, 5]} />
          <meshStandardMaterial
            color="#1c4a3a"
            emissive="#3ad4b0"
            emissiveIntensity={0.55 + (index % 3) * 0.12}
            roughness={0.45}
          />
        </mesh>
      ))}
    </group>
  );
}

export function TerritoryMesh({ territory }: Props) {
  const layout = layoutForSlug(territory.slug);
  return (
    <group position={[layout.x, 0, layout.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[layout.visualRadius, 48]} />
        <meshStandardMaterial
          color={layout.color}
          emissive={layout.emissive}
          emissiveIntensity={0.22}
          roughness={0.8}
          metalness={0.05}
        />
      </mesh>
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[layout.visualRadius - 0.08, layout.visualRadius, 48]}
        />
        <meshBasicMaterial color={layout.rim} transparent opacity={0.55} />
      </mesh>
      <FloraRing radius={layout.visualRadius} />
      <Text
        position={[0, 0.12, layout.visualRadius + 0.4]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.28}
        color="#d7efe8"
        anchorX="center"
        anchorY="middle"
      >
        {territory.name}
      </Text>
    </group>
  );
}
