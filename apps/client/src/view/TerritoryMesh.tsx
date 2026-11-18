import { Text } from "@react-three/drei";
import type { TerritoryView } from "@boing-pets/contract";
import { layoutForSlug } from "./layout";

type Props = {
  territory: TerritoryView;
};

export function TerritoryMesh({ territory }: Props) {
  const layout = layoutForSlug(territory.slug);
  return (
    <group position={[layout.x, 0, layout.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[layout.visualRadius, 48]} />
        <meshStandardMaterial
          color={layout.color}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[layout.visualRadius - 0.06, layout.visualRadius, 48]}
        />
        <meshBasicMaterial color="#1c2418" transparent opacity={0.35} />
      </mesh>
      <Text
        position={[0, 0.08, layout.visualRadius + 0.35]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.28}
        color="#e8efe3"
        anchorX="center"
        anchorY="middle"
      >
        {territory.name}
      </Text>
    </group>
  );
}
