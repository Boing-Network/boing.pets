import type { ThreeEvent } from "@react-three/fiber";
import { WorldText } from "../world/scene/WorldText";
import type { WorldLandmark, WorldStation } from "../world/config/zones";
import { PASTURE_ZONE } from "../world/config/zones";
import { meadowHeight } from "./meadowHeight";

function landmarkFor(id: string): WorldLandmark | undefined {
  return PASTURE_ZONE.landmarks.find((item) => item.id === id);
}

function Workbench({
  x,
  z,
  y,
  onInteract,
}: {
  x: number;
  z: number;
  y: number;
  onInteract: (event: ThreeEvent<PointerEvent>) => void;
}) {
  return (
    <group
      position={[x, y, z]}
      onPointerDown={onInteract}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.06, 2.4]} />
        <meshStandardMaterial color="#8d7a58" roughness={1} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 0.14, 1.7]} />
        <meshStandardMaterial color="#c4a06a" roughness={0.7} />
      </mesh>
      {(
        [
          [-1.2, -0.7],
          [1.2, -0.7],
          [-1.2, 0.7],
          [1.2, 0.7],
        ] as const
      ).map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 0.36, z]} castShadow>
          <boxGeometry args={[0.16, 0.72, 0.16]} />
          <meshStandardMaterial color="#6d4a32" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[-0.7, 0.86, 0.15]} rotation={[0, 0.4, 0.15]} castShadow>
        <boxGeometry args={[0.7, 0.08, 0.18]} />
        <meshStandardMaterial
          color="#8a8f96"
          roughness={0.45}
          metalness={0.25}
        />
      </mesh>
      <mesh position={[0.55, 0.95, -0.2]} rotation={[0.5, 0.2, 0.1]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 0.7, 6]} />
        <meshStandardMaterial color="#7a5134" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.55, -1.05]} castShadow>
        <boxGeometry args={[1.7, 0.7, 0.12]} />
        <meshStandardMaterial color="#a67c4e" roughness={0.8} />
      </mesh>
      <WorldText
        position={[0, 2.35, 0]}
        fontSize={0.36}
        color="#123055"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#ffffff"
      >
        Crafting Station
      </WorldText>
    </group>
  );
}

function MarketStall({
  x,
  z,
  y,
  onInteract,
}: {
  x: number;
  z: number;
  y: number;
  onInteract: (event: ThreeEvent<PointerEvent>) => void;
}) {
  return (
    <group
      position={[x, y, z]}
      onPointerDown={onInteract}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[4.0, 0.06, 3.0]} />
        <meshStandardMaterial color="#8d7a58" roughness={1} />
      </mesh>
      {(
        [
          [-1.5, -1.0],
          [1.5, -1.0],
          [-1.5, 1.0],
          [1.5, 1.0],
        ] as const
      ).map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 1.15, z]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 2.3, 6]} />
          <meshStandardMaterial color="#6d4a32" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.85, 0.15]} castShadow receiveShadow>
        <boxGeometry args={[3.1, 0.16, 1.3]} />
        <meshStandardMaterial color="#d7b07a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.48, 0.15]} castShadow>
        <boxGeometry args={[2.9, 0.6, 1.1]} />
        <meshStandardMaterial color="#a36b3a" roughness={0.8} />
      </mesh>
      <mesh
        position={[0, 2.35, 0]}
        rotation={[0.18, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[3.6, 0.08, 2.6]} />
        <meshStandardMaterial color="#e8b86d" roughness={0.75} />
      </mesh>
      <mesh position={[0, 2.42, 0]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[3.62, 0.02, 0.55]} />
        <meshStandardMaterial color="#c45c4a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.7, -1.25]} castShadow>
        <boxGeometry args={[1.85, 0.7, 0.1]} />
        <meshStandardMaterial color="#f3d9a4" roughness={0.8} />
      </mesh>
      <WorldText
        position={[0, 3.15, 0]}
        fontSize={0.38}
        color="#123055"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#ffffff"
      >
        Market Stall
      </WorldText>
    </group>
  );
}

export function PastureStations({
  onInteract,
}: {
  preferPerf?: boolean;
  onInteract: (station: WorldStation) => void;
}) {
  const craft = PASTURE_ZONE.stations.find((s) => s.kind === "craft");
  const market = PASTURE_ZONE.stations.find((s) => s.kind === "market");
  const craftLand = landmarkFor("crafting-station");
  const marketLand = landmarkFor("market-stall");
  const handle =
    (station: WorldStation | undefined) =>
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (station) onInteract(station);
    };
  return (
    <group>
      {craft && craftLand ? (
        <Workbench
          x={craftLand.position.x}
          z={craftLand.position.z}
          y={meadowHeight(craftLand.position.x, craftLand.position.z)}
          onInteract={handle(craft)}
        />
      ) : null}
      {market && marketLand ? (
        <MarketStall
          x={marketLand.position.x}
          z={marketLand.position.z}
          y={meadowHeight(marketLand.position.x, marketLand.position.z)}
          onInteract={handle(market)}
        />
      ) : null}
    </group>
  );
}
