import { Text } from "@react-three/drei";
import type { PresencePlayer } from "../lib/presenceProtocol";

export function RemotePlayers({ players }: { players: PresencePlayer[] }) {
  return (
    <group>
      {players.map((player) => (
        <group key={player.id} position={[player.x, player.y, player.z]}>
          <mesh position={[0, 0.55, 0]}>
            <capsuleGeometry args={[0.32, 0.5, 4, 8]} />
            <meshStandardMaterial color={player.color} roughness={0.55} />
          </mesh>
          <mesh position={[0, 1.2, 0]}>
            <sphereGeometry args={[0.24, 10, 10]} />
            <meshStandardMaterial color="#f7f2ea" />
          </mesh>
          <Text
            position={[0, 1.75, 0]}
            fontSize={0.28}
            color="#123055"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.015}
            outlineColor="#ffffff"
          >
            {player.name}
          </Text>
        </group>
      ))}
    </group>
  );
}
