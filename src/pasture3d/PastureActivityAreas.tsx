import type { ThreeEvent } from "@react-three/fiber";
import { POND_PIER_LABEL_LOCAL } from "./meadowFootprints";
import { PastureWorldText } from "./PastureWorldText";
import type { WorldLandmark, WorldStation } from "../world/config/zones";
import { PASTURE_ZONE } from "../world/config/zones";
import { meadowHeight } from "./meadowHeight";
import type { ActivityStationKind } from "./stationInteract";

function landmarkFor(id: string): WorldLandmark | undefined {
  return PASTURE_ZONE.landmarks.find((item) => item.id === id);
}

function stationFor(kind: ActivityStationKind): WorldStation | undefined {
  return PASTURE_ZONE.stations.find((item) => item.kind === kind);
}

type SitProps = {
  x: number;
  z: number;
  y: number;
  onInteract: (event: ThreeEvent<PointerEvent>) => void;
};

function hoverHandlers() {
  return {
    onPointerOver: () => {
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      document.body.style.cursor = "";
    },
  };
}

function CrystalQuarry({ x, z, y, onInteract }: SitProps) {
  const rocks: Array<[number, number, number, number, number, number]> = [
    [-0.9, 0.45, -0.6, 1.3, 0.9, 1.1],
    [0.85, 0.35, 0.55, 1.1, 0.7, 0.95],
    [0.1, 0.7, -0.9, 0.9, 1.4, 0.8],
    [-0.2, 0.25, 0.95, 0.8, 0.5, 0.7],
  ];
  return (
    <group position={[x, y, z]} onPointerDown={onInteract} {...hoverHandlers()}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[2.1, 2.15, 0.08, 8]} />
        <meshStandardMaterial color="#6d6560" roughness={1} />
      </mesh>
      {rocks.map(([px, py, pz, w, h, d], i) => (
        <mesh
          key={i}
          position={[px, py, pz]}
          rotation={[0, i * 0.7, 0.08]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial
            color={i % 2 ? "#8a8f96" : "#7a736c"}
            roughness={0.9}
          />
        </mesh>
      ))}
      {(
        [
          [0.15, 1.35, -0.2],
          [-0.35, 1.15, 0.2],
          [0.55, 1.05, 0.15],
        ] as const
      ).map(([px, py, pz], i) => (
        <mesh
          key={`c${i}`}
          position={[px, py, pz]}
          rotation={[0.2, i, 0.4]}
          castShadow
        >
          <octahedronGeometry args={[0.22 + i * 0.04, 0]} />
          <meshStandardMaterial
            color="#9fd4e8"
            roughness={0.2}
            metalness={0.35}
            emissive="#6fb8d0"
            emissiveIntensity={0.35}
          />
        </mesh>
      ))}
      <mesh position={[-1.15, 0.55, 0.7]} rotation={[0.2, 0.4, 0.6]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 0.9, 6]} />
        <meshStandardMaterial color="#6d4a32" roughness={0.85} />
      </mesh>
      <mesh
        position={[-1.15, 1.05, 0.55]}
        rotation={[0.1, 0.2, 1.1]}
        castShadow
      >
        <boxGeometry args={[0.28, 0.08, 0.18]} />
        <meshStandardMaterial
          color="#8a8f96"
          roughness={0.45}
          metalness={0.3}
        />
      </mesh>
      <PastureWorldText
        position={[0, 2.45, 0]}
        fontSize={0.34}
        color="#123055"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#ffffff"
      >
        Crystal Quarry
      </PastureWorldText>
    </group>
  );
}

function PondPier({ x, z, y, onInteract }: SitProps) {
  return (
    <group position={[x, y, z]} onPointerDown={onInteract} {...hoverHandlers()}>
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[2.6, 0.12, 2.0]} />
        <meshStandardMaterial color="#c4a06a" roughness={0.85} />
      </mesh>
      {[-0.7, 0, 0.7].map((px) => (
        <mesh key={px} position={[px, 0.14, 0]} receiveShadow>
          <boxGeometry args={[0.18, 0.04, 1.95]} />
          <meshStandardMaterial color="#8d6a3c" roughness={0.9} />
        </mesh>
      ))}
      {(
        [
          [-1.15, -0.85],
          [1.15, -0.85],
          [-1.15, 0.85],
          [1.15, 0.85],
        ] as const
      ).map(([px, pz]) => (
        <mesh key={`${px}:${pz}`} position={[px, 0.45, pz]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 0.9, 6]} />
          <meshStandardMaterial color="#6d4a32" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[-0.9, 0.7, 0]} rotation={[0, 0, 0.15]} castShadow>
        <cylinderGeometry args={[0.03, 0.035, 1.5, 6]} />
        <meshStandardMaterial color="#7a5134" roughness={0.85} />
      </mesh>
      <mesh position={[-0.95, 0.15, 0.15]} castShadow>
        <boxGeometry args={[0.22, 0.08, 0.28]} />
        <meshStandardMaterial color="#6f9b5a" roughness={0.8} />
      </mesh>
      <PastureWorldText
        position={[
          POND_PIER_LABEL_LOCAL.x,
          POND_PIER_LABEL_LOCAL.y,
          POND_PIER_LABEL_LOCAL.z,
        ]}
        fontSize={0.32}
        color="#123055"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#ffffff"
      >
        Pond Pier
      </PastureWorldText>
    </group>
  );
}

function TreasureDig({ x, z, y, onInteract }: SitProps) {
  return (
    <group position={[x, y, z]} onPointerDown={onInteract} {...hoverHandlers()}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <cylinderGeometry args={[1.7, 1.75, 0.08, 12]} />
        <meshStandardMaterial color="#c9a66b" roughness={1} />
      </mesh>
      <mesh
        position={[0.15, 0.22, -0.1]}
        rotation={[0.1, 0.3, 0]}
        receiveShadow
      >
        <sphereGeometry args={[0.7, 10, 8]} />
        <meshStandardMaterial color="#b8925a" roughness={1} />
      </mesh>
      <mesh position={[-0.7, 0.35, 0.5]} rotation={[0.5, 0.4, 0.2]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 1.1, 6]} />
        <meshStandardMaterial color="#6d4a32" roughness={0.85} />
      </mesh>
      <mesh
        position={[-0.55, 0.85, 0.35]}
        rotation={[0.2, 0.3, 1.1]}
        castShadow
      >
        <boxGeometry args={[0.32, 0.06, 0.22]} />
        <meshStandardMaterial
          color="#8a8f96"
          roughness={0.45}
          metalness={0.3}
        />
      </mesh>
      <mesh position={[0.65, 0.28, 0.55]} castShadow>
        <boxGeometry args={[0.5, 0.28, 0.36]} />
        <meshStandardMaterial color="#8a5a2b" roughness={0.75} />
      </mesh>
      <mesh position={[0.65, 0.44, 0.55]} castShadow>
        <boxGeometry args={[0.52, 0.06, 0.38]} />
        <meshStandardMaterial color="#e6c36a" roughness={0.4} metalness={0.4} />
      </mesh>
      <PastureWorldText
        position={[0, 2.45, 0]}
        fontSize={0.32}
        color="#123055"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#ffffff"
      >
        Treasure Dig
      </PastureWorldText>
    </group>
  );
}

function GardenBeds({ x, z, y, onInteract }: SitProps) {
  const beds: Array<[number, number]> = [
    [-1.05, 0],
    [0, 0],
    [1.05, 0],
  ];
  return (
    <group position={[x, y, z]} onPointerDown={onInteract} {...hoverHandlers()}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[3.6, 0.06, 3.0]} />
        <meshStandardMaterial color="#7a8f58" roughness={1} />
      </mesh>
      {beds.map(([px, pz]) => (
        <group key={px} position={[px, 0, pz]}>
          <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.9, 0.22, 2.1]} />
            <meshStandardMaterial color="#6d4a32" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.28, 0]} receiveShadow>
            <boxGeometry args={[0.74, 0.1, 1.9]} />
            <meshStandardMaterial color="#5a3a22" roughness={1} />
          </mesh>
          {[-0.5, 0, 0.5].map((dz) => (
            <mesh key={dz} position={[0, 0.48, dz]} castShadow>
              <sphereGeometry args={[0.12, 8, 8]} />
              <meshStandardMaterial color="#6f9b5a" roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[1.4, 0.22, 1.1]} rotation={[0.2, 0.4, 0.3]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.55, 6]} />
        <meshStandardMaterial color="#8a8f96" roughness={0.4} metalness={0.3} />
      </mesh>
      <PastureWorldText
        position={[0, 2.4, 0]}
        fontSize={0.32}
        color="#123055"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#ffffff"
      >
        Garden Beds
      </PastureWorldText>
    </group>
  );
}

function KitchenHut({ x, z, y, onInteract }: SitProps) {
  return (
    <group position={[x, y, z]} onPointerDown={onInteract} {...hoverHandlers()}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.08, 2.8]} />
        <meshStandardMaterial color="#8d7a58" roughness={1} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 1.8, 2.1]} />
        <meshStandardMaterial color="#d9896b" roughness={0.85} />
      </mesh>
      <mesh position={[0, 2.15, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[2.05, 1.1, 4]} />
        <meshStandardMaterial color="#8a4a3a" roughness={0.8} />
      </mesh>
      <mesh position={[0.7, 2.55, -0.2]} castShadow>
        <boxGeometry args={[0.32, 0.7, 0.32]} />
        <meshStandardMaterial color="#7a5a52" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.55, 1.08]} castShadow>
        <boxGeometry args={[0.7, 1.05, 0.1]} />
        <meshStandardMaterial color="#6d4a32" roughness={0.85} />
      </mesh>
      <mesh position={[-0.7, 1.15, 1.07]} castShadow>
        <boxGeometry args={[0.42, 0.36, 0.08]} />
        <meshStandardMaterial
          color="#c5e8f4"
          roughness={0.15}
          metalness={0.15}
          emissive="#9fd4e8"
          emissiveIntensity={0.12}
        />
      </mesh>
      <mesh position={[0.85, 0.28, 0.9]} castShadow>
        <cylinderGeometry args={[0.28, 0.3, 0.35, 10]} />
        <meshStandardMaterial
          color="#8a8f96"
          roughness={0.4}
          metalness={0.35}
        />
      </mesh>
      <PastureWorldText
        position={[0, 3.15, 0]}
        fontSize={0.32}
        color="#123055"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#ffffff"
      >
        Pasture Kitchen
      </PastureWorldText>
    </group>
  );
}

function RaceGate({ x, z, y, onInteract }: SitProps) {
  const posts: Array<[number, number]> = [
    [-1.3, 0],
    [1.3, 0],
  ];
  return (
    <group position={[x, y, z]} onPointerDown={onInteract} {...hoverHandlers()}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.06, 2.0]} />
        <meshStandardMaterial color="#8d7a58" roughness={1} />
      </mesh>
      {posts.map(([px]) => (
        <mesh key={px} position={[px, 1.15, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.11, 2.3, 8]} />
          <meshStandardMaterial color="#6d4a32" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 2.15, 0]} castShadow>
        <boxGeometry args={[2.8, 0.55, 0.1]} />
        <meshStandardMaterial color="#e8c27a" roughness={0.75} />
      </mesh>
      <mesh position={[0, 2.15, 0.06]} castShadow>
        <boxGeometry args={[2.6, 0.12, 0.04]} />
        <meshStandardMaterial color="#c45c4a" roughness={0.7} />
      </mesh>
      {/* Visual-only track markings; collision stays on the gate landmark. */}
      {[2.4, 4.8, 7.2, 9.6].map((pz) => (
        <mesh key={pz} position={[0, 0.03, pz]} receiveShadow>
          <boxGeometry args={[2.2, 0.04, 0.28]} />
          <meshStandardMaterial color="#f4efe4" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, 6]} receiveShadow>
        <boxGeometry args={[0.18, 0.03, 12]} />
        <meshStandardMaterial color="#e8c27a" roughness={1} />
      </mesh>
      <PastureWorldText
        position={[0, 2.85, 0]}
        fontSize={0.32}
        color="#123055"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#ffffff"
      >
        Race Track
      </PastureWorldText>
    </group>
  );
}

export function PastureActivityAreas({
  onInteract,
}: {
  onInteract: (station: WorldStation) => void;
}) {
  const handle =
    (station: WorldStation | undefined) =>
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (station) onInteract(station);
    };
  const items = [
    { kind: "mine" as const, id: "crystal-quarry", Mesh: CrystalQuarry },
    { kind: "fish" as const, id: "pond-pier", Mesh: PondPier },
    { kind: "treasure" as const, id: "treasure-dig", Mesh: TreasureDig },
    { kind: "garden" as const, id: "garden-beds", Mesh: GardenBeds },
    { kind: "cook" as const, id: "kitchen-hut", Mesh: KitchenHut },
    { kind: "race" as const, id: "race-gate", Mesh: RaceGate },
  ];
  return (
    <group>
      {items.map(({ kind, id, Mesh }) => {
        const station = stationFor(kind);
        const land = landmarkFor(id);
        if (!station || !land) return null;
        return (
          <Mesh
            key={id}
            x={land.position.x}
            z={land.position.z}
            y={meadowHeight(land.position.x, land.position.z)}
            onInteract={handle(station)}
          />
        );
      })}
    </group>
  );
}
