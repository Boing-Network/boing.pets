import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { PetLook } from "../lib/petLook";

export function PetFollower({
  look,
  offset = [-0.78, 0, 0.2] as [number, number, number],
}: {
  look: PetLook;
  offset?: [number, number, number];
}) {
  const group = useRef<Group>(null);
  const body = `hsl(${look.hue} 75% 72%)`;
  const accent = `hsl(${look.accent} 80% 70%)`;

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.position.y =
      offset[1] + Math.sin(clock.elapsedTime * 3.2) * 0.05;
  });

  return (
    <group ref={group} position={offset}>
      <mesh position={[0, 0.26, 0]} castShadow={false}>
        <sphereGeometry args={[0.26, 12, 12]} />
        <meshStandardMaterial color={body} roughness={0.45} />
      </mesh>
      <mesh position={[-0.12, 0.12, 0.16]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color={accent} roughness={0.5} />
      </mesh>
      <mesh position={[0.12, 0.12, 0.16]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color={accent} roughness={0.5} />
      </mesh>
      {look.antenna > 0 ? (
        <mesh position={[0, 0.52, 0]}>
          <sphereGeometry args={[0.055, 8, 8]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.2} />
        </mesh>
      ) : null}
      {Array.from({ length: Math.min(look.spots, 3) }, (_, i) => (
        <mesh
          key={i}
          position={[-0.1 + i * 0.1, 0.22, 0.18]}
        >
          <sphereGeometry args={[0.035, 6, 6]} />
          <meshStandardMaterial color={accent} transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}
