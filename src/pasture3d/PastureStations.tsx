import type { ThreeEvent } from "@react-three/fiber";
import { PastureWorldText } from "./PastureWorldText";
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
      <PastureWorldText
        position={[0, 2.35, 0]}
        fontSize={0.36}
        color="#123055"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#ffffff"
      >
        Crafting Station
      </PastureWorldText>
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
      <PastureWorldText
        position={[0, 3.15, 0]}
        fontSize={0.38}
        color="#123055"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#ffffff"
      >
        Market Stall
      </PastureWorldText>
    </group>
  );
}

function DressingStand({
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
        <cylinderGeometry args={[1.55, 1.55, 0.06, 20]} />
        <meshStandardMaterial color="#8f6f9a" roughness={1} />
      </mesh>
      <mesh position={[0, 0.07, 0]} receiveShadow>
        <cylinderGeometry args={[1.25, 1.25, 0.05, 20]} />
        <meshStandardMaterial color="#d7c6e4" roughness={0.95} />
      </mesh>
      <mesh position={[-0.85, 1.15, -0.15]} castShadow receiveShadow>
        <boxGeometry args={[0.95, 2.2, 0.7]} />
        <meshStandardMaterial color="#5d3b4c" roughness={0.75} />
      </mesh>
      <mesh position={[-1.08, 1.2, 0.22]} castShadow>
        <boxGeometry args={[0.42, 1.9, 0.08]} />
        <meshStandardMaterial color="#7a5164" roughness={0.7} />
      </mesh>
      <mesh position={[-0.62, 1.2, 0.22]} castShadow>
        <boxGeometry args={[0.42, 1.9, 0.08]} />
        <meshStandardMaterial color="#7a5164" roughness={0.7} />
      </mesh>
      <mesh position={[-0.95, 1.2, 0.28]} castShadow>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial
          color="#e6c36a"
          roughness={0.35}
          metalness={0.55}
        />
      </mesh>
      <mesh position={[-0.75, 1.2, 0.28]} castShadow>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial
          color="#e6c36a"
          roughness={0.35}
          metalness={0.55}
        />
      </mesh>
      <mesh position={[0.7, 0.15, 0.15]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 0.28, 10]} />
        <meshStandardMaterial
          color="#c9d0d8"
          roughness={0.4}
          metalness={0.35}
        />
      </mesh>
      <mesh position={[0.7, 0.7, 0.15]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.9, 8]} />
        <meshStandardMaterial color="#b7bec6" roughness={0.4} metalness={0.4} />
      </mesh>
      <mesh position={[0.7, 1.55, 0.15]} castShadow>
        <cylinderGeometry args={[0.48, 0.48, 0.08, 20]} />
        <meshStandardMaterial color="#dfe6ee" roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[0.7, 1.55, 0.16]} rotation={[0.05, 0, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 0.05, 20]} />
        <meshStandardMaterial
          color="#c5e8f4"
          roughness={0.12}
          metalness={0.2}
          emissive="#9fd4e8"
          emissiveIntensity={0.18}
        />
      </mesh>
      <mesh position={[0.15, 0.28, 0.55]} castShadow>
        <cylinderGeometry args={[0.22, 0.24, 0.12, 10]} />
        <meshStandardMaterial color="#6d4a32" roughness={0.85} />
      </mesh>
      <mesh position={[0.15, 0.48, 0.55]} castShadow>
        <boxGeometry args={[0.42, 0.08, 0.42]} />
        <meshStandardMaterial color="#c4a06a" roughness={0.7} />
      </mesh>
      <mesh
        position={[-0.85, 2.05, 0.2]}
        rotation={[0.2, 0.1, 0.15]}
        castShadow
      >
        <boxGeometry args={[0.34, 0.16, 0.28]} />
        <meshStandardMaterial color="#6f9b5a" roughness={0.8} />
      </mesh>
      <PastureWorldText
        position={[0, 2.95, 0]}
        fontSize={0.3}
        color="#123055"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.022}
        outlineColor="#ffffff"
      >
        Customization Station
      </PastureWorldText>
    </group>
  );
}

function HomePlot({
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
    <group position={[x, y, z]} onPointerDown={onInteract}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, 0]}
        receiveShadow
      >
        <planeGeometry args={[5.2, 5.2]} />
        <meshStandardMaterial color="#e8d5b0" roughness={0.9} />
      </mesh>
      {[-1.5, -0.5, 0.5, 1.5].flatMap((gx) =>
        [-1.5, -0.5, 0.5, 1.5].map((gz) => (
          <mesh
            key={gx + ":" + gz}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[gx, 0.04, gz]}
          >
            <planeGeometry args={[0.88, 0.88]} />
            <meshStandardMaterial
              color="#f3e6c8"
              roughness={0.85}
              transparent
              opacity={0.85}
            />
          </mesh>
        )),
      )}
      {[
        [-2.4, -2.4],
        [2.4, -2.4],
        [-2.4, 2.4],
        [2.4, 2.4],
      ].map(([px, pz]) => (
        <mesh key={px + ":" + pz} position={[px, 0.35, pz]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.7} />
        </mesh>
      ))}
      <PastureWorldText
        position={[0, 1.15, 0]}
        fontSize={0.32}
        color="#5a3a1c"
        outlineWidth={0.022}
        outlineColor="#ffffff"
      >
        Home Plot
      </PastureWorldText>
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
  const customize = PASTURE_ZONE.stations.find((s) => s.kind === "customize");
  const home = PASTURE_ZONE.stations.find((s) => s.kind === "home");
  const craftLand = landmarkFor("crafting-station");
  const marketLand = landmarkFor("market-stall");
  const customizeLand = landmarkFor("customization-station");
  const homeLand = landmarkFor("home-plot");
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
      {customize && customizeLand ? (
        <DressingStand
          x={customizeLand.position.x}
          z={customizeLand.position.z}
          y={meadowHeight(customizeLand.position.x, customizeLand.position.z)}
          onInteract={handle(customize)}
        />
      ) : null}
      {home && homeLand ? (
        <HomePlot
          x={homeLand.position.x}
          z={homeLand.position.z}
          y={meadowHeight(homeLand.position.x, homeLand.position.z)}
          onInteract={handle(home)}
        />
      ) : null}
    </group>
  );
}
