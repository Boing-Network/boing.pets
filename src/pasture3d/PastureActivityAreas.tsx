import type { ThreeEvent } from "@react-three/fiber";
import { POND_PIER_LABEL_LOCAL } from "./meadowFootprints";
import { PastureWorldText } from "./PastureWorldText";
import { yardLabelForLandmark } from "./yardLabels";
import {
  YardCanalKit,
  YardCrystalKit,
  YardGardenKit,
  YardKitchenKit,
  YardRaceBowlKit,
  YardTreasureKit,
} from "./YardKits";
import { YardKitSwap } from "./yardKitLoader";
import type { WorldLandmark, WorldStation } from "../world/config/zones";
import { PASTURE_ZONE } from "../world/config/zones";
import { meadowHeight } from "./meadowHeight";
import type { ActivityStationKind } from "./stationInteract";
import { NeonHalo, YARD } from "./yardChrome";
import { yardFacing } from "./yardFacing";
import * as THREE from "three";

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
  rotY?: number;
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

function CrystalQuarry({ x, z, y, rotY = 0, onInteract }: SitProps) {
  const label = yardLabelForLandmark("crystal-quarry");
  const rocks: Array<[number, number, number, number, number, number]> = [
    [-0.9, 0.45, -0.6, 1.3, 0.9, 1.1],
    [0.85, 0.35, 0.55, 1.1, 0.7, 0.95],
    [0.1, 0.7, -0.9, 0.9, 1.4, 0.8],
    [-0.2, 0.25, 0.95, 0.8, 0.5, 0.7],
  ];
  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerDown={onInteract}
      {...hoverHandlers()}
    >
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[4.2, 0.08, 4.0]} />
        <meshStandardMaterial color={YARD.concreteDark} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <ringGeometry args={[1.7, 1.85, 4]} />
        <meshStandardMaterial color={YARD.paper} roughness={0.7} />
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
            color="#c8f4ff"
            roughness={0.15}
            metalness={0.35}
            emissive="#7ad8f0"
            emissiveIntensity={0.55}
          />
        </mesh>
      ))}
      <mesh position={[-1.4, 0.45, 1.1]} castShadow>
        <boxGeometry args={[0.7, 0.9, 0.12]} />
        <meshStandardMaterial color={YARD.ink} roughness={0.8} />
      </mesh>
      <YardCrystalKit />
      <PastureWorldText
        position={[0, 2.45, 0]}
        fontSize={0.34}
        anchorX="center"
        anchorY="middle"
        tag={label.tag}
      >
        {label.title}
      </PastureWorldText>
    </group>
  );
}

function PondPier({ x, z, y, rotY = 0, onInteract }: SitProps) {
  const label = yardLabelForLandmark("pond-pier");
  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerDown={onInteract}
      {...hoverHandlers()}
    >
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[2.6, 0.12, 2.0]} />
        <meshStandardMaterial color={YARD.concrete} roughness={0.9} />
      </mesh>
      {[-0.7, 0, 0.7].map((px) => (
        <mesh key={px} position={[px, 0.14, 0]} receiveShadow>
          <boxGeometry args={[0.1, 0.04, 1.95]} />
          <meshStandardMaterial color={YARD.ink} roughness={0.8} />
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
          <cylinderGeometry args={[0.07, 0.09, 0.9, 6]} />
          <meshStandardMaterial
            color={YARD.metal}
            roughness={0.45}
            metalness={0.35}
          />
        </mesh>
      ))}
      <mesh position={[-0.9, 0.7, 0]} rotation={[0, 0, 0.15]} castShadow>
        <cylinderGeometry args={[0.03, 0.035, 1.5, 6]} />
        <meshStandardMaterial color={YARD.ink} roughness={0.85} />
      </mesh>
      <mesh position={[-0.95, 0.18, 0.15]} castShadow>
        <boxGeometry args={[0.28, 0.1, 0.22]} />
        <meshStandardMaterial color={YARD.accent} roughness={0.7} />
      </mesh>
      <PastureWorldText
        position={[
          POND_PIER_LABEL_LOCAL.x,
          POND_PIER_LABEL_LOCAL.y,
          POND_PIER_LABEL_LOCAL.z,
        ]}
        fontSize={0.32}
        anchorX="center"
        anchorY="middle"
        tag={label.tag}
      >
        {label.title}
      </PastureWorldText>
    </group>
  );
}

function TreasureDig({ x, z, y, rotY = 0, onInteract }: SitProps) {
  const label = yardLabelForLandmark("treasure-dig");
  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerDown={onInteract}
      {...hoverHandlers()}
    >
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <cylinderGeometry args={[1.75, 1.85, 0.14, 12]} />
        <meshStandardMaterial color={YARD.sand} roughness={1} />
      </mesh>
      <mesh
        position={[0.15, 0.22, -0.1]}
        rotation={[0.1, 0.3, 0]}
        receiveShadow
      >
        <sphereGeometry args={[0.7, 10, 8]} />
        <meshStandardMaterial color="#b8925a" roughness={1} />
      </mesh>
      {(
        [
          [-1.5, -1.1],
          [1.5, -1.1],
          [-1.5, 1.1],
          [1.5, 1.1],
        ] as const
      ).map(([px, pz]) => (
        <mesh key={`${px}:${pz}`} position={[px, 0.4, pz]} castShadow>
          <boxGeometry args={[0.12, 0.8, 0.7]} />
          <meshStandardMaterial color="#c4b48a" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[-0.7, 0.35, 0.5]} rotation={[0.5, 0.4, 0.2]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 1.1, 6]} />
        <meshStandardMaterial
          color={YARD.metal}
          roughness={0.45}
          metalness={0.3}
        />
      </mesh>
      <mesh
        position={[-0.55, 0.85, 0.35]}
        rotation={[0.2, 0.3, 1.1]}
        castShadow
      >
        <boxGeometry args={[0.32, 0.06, 0.22]} />
        <meshStandardMaterial
          color={YARD.metal}
          roughness={0.45}
          metalness={0.3}
        />
      </mesh>
      <mesh position={[0.65, 0.28, 0.55]} castShadow>
        <boxGeometry args={[0.5, 0.28, 0.36]} />
        <meshStandardMaterial color={YARD.ink} roughness={0.75} />
      </mesh>
      <mesh position={[0.65, 0.44, 0.55]} castShadow>
        <boxGeometry args={[0.52, 0.06, 0.38]} />
        <meshStandardMaterial color={YARD.accent} roughness={0.4} />
      </mesh>
      <YardTreasureKit />
      <PastureWorldText
        position={[0, 2.45, 0]}
        fontSize={0.32}
        anchorX="center"
        anchorY="middle"
        tag={label.tag}
      >
        {label.title}
      </PastureWorldText>
    </group>
  );
}

function GardenBeds({ x, z, y, rotY = 0, onInteract }: SitProps) {
  const label = yardLabelForLandmark("garden-beds");
  const beds: Array<[number, number]> = [
    [-1.05, 0],
    [0, 0],
    [1.05, 0],
  ];
  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerDown={onInteract}
      {...hoverHandlers()}
    >
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[3.6, 0.06, 3.0]} />
        <meshStandardMaterial color={YARD.concreteDark} roughness={1} />
      </mesh>
      {beds.map(([px, pz]) => (
        <group key={px} position={[px, 0, pz]}>
          <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.9, 0.36, 2.1]} />
            <meshStandardMaterial color={YARD.concrete} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.42, 0]} receiveShadow>
            <boxGeometry args={[0.74, 0.1, 1.9]} />
            <meshStandardMaterial color={YARD.soil} roughness={1} />
          </mesh>
          {[-0.5, 0, 0.5].map((dz) => (
            <mesh key={dz} position={[0, 0.62, dz]} castShadow>
              <sphereGeometry args={[0.12, 8, 8]} />
              <meshStandardMaterial color={YARD.foliage} roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[1.4, 0.22, 1.1]} rotation={[0.2, 0.4, 0.3]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.55, 6]} />
        <meshStandardMaterial
          color={YARD.metal}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>
      <YardGardenKit />
      <PastureWorldText
        position={[0, 2.4, 0]}
        fontSize={0.32}
        anchorX="center"
        anchorY="middle"
        tag={label.tag}
      >
        {label.title}
      </PastureWorldText>
    </group>
  );
}

function KitchenHut({ x, z, y, rotY = 0, onInteract }: SitProps) {
  const label = yardLabelForLandmark("kitchen-hut");
  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerDown={onInteract}
      {...hoverHandlers()}
    >
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.08, 2.8]} />
        <meshStandardMaterial color={YARD.concreteDark} roughness={1} />
      </mesh>
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 1.3, 1.6]} />
        <meshStandardMaterial color={YARD.ink} roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.48, 0.15]} rotation={[0.22, 0, 0]} castShadow>
        <boxGeometry args={[3.0, 0.08, 2.2]} />
        <meshStandardMaterial color={YARD.paper} roughness={0.75} />
      </mesh>
      {[-1.1, -0.35, 0.4, 1.15].map((px, i) => (
        <mesh key={px} position={[px, 1.5, 0.15]} rotation={[0.22, 0, 0]}>
          <boxGeometry args={[0.28, 0.1, 2.22]} />
          <meshStandardMaterial
            color={i % 2 ? YARD.accent : YARD.ink}
            roughness={0.7}
          />
        </mesh>
      ))}
      <mesh position={[0, 1.55, 1.05]}>
        <boxGeometry args={[2.2, 0.1, 0.12]} />
        <meshStandardMaterial
          color={YARD.accent}
          emissive={YARD.accent}
          emissiveIntensity={1.15}
        />
      </mesh>
      <mesh position={[0, 1.44, 1.05]}>
        <boxGeometry args={[2.0, 0.05, 0.1]} />
        <meshStandardMaterial
          color="#2ec8e0"
          emissive="#2ec8e0"
          emissiveIntensity={0.8}
        />
      </mesh>
      <NeonHalo position={[0, 1.6, 1.25]} width={2.4} height={0.45} />
      <mesh position={[0, 0.85, 0.95]} castShadow>
        <boxGeometry args={[2.0, 0.16, 0.6]} />
        <meshStandardMaterial
          color={YARD.metal}
          roughness={0.45}
          metalness={0.3}
        />
      </mesh>
      <mesh position={[0.7, 1.05, 0.7]} castShadow>
        <cylinderGeometry args={[0.18, 0.2, 0.28, 10]} />
        <meshStandardMaterial
          color={YARD.metal}
          roughness={0.4}
          metalness={0.4}
        />
      </mesh>
      {[-0.7, 0.7].map((px) => (
        <mesh key={px} position={[px, 0.35, 1.15]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.7, 10]} />
          <meshStandardMaterial color={YARD.ink} roughness={0.8} />
        </mesh>
      ))}
      <YardKitchenKit />
      <PastureWorldText
        position={[0, 3.15, 0]}
        fontSize={0.32}
        anchorX="center"
        anchorY="middle"
        tag={label.tag}
      >
        {label.title}
      </PastureWorldText>
    </group>
  );
}

function RaceGate({ x, z, y, rotY = 0, onInteract }: SitProps) {
  const label = yardLabelForLandmark("race-gate");
  const posts: Array<[number, number]> = [
    [-1.3, 0],
    [1.3, 0],
  ];
  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerDown={onInteract}
      {...hoverHandlers()}
    >
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.06, 2.0]} />
        <meshStandardMaterial color={YARD.concreteDark} roughness={1} />
      </mesh>
      {posts.map(([px]) => (
        <mesh key={px} position={[px, 1.15, 0]} castShadow>
          <boxGeometry args={[0.16, 2.3, 0.16]} />
          <meshStandardMaterial color={YARD.ink} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 2.15, 0]} castShadow>
        <boxGeometry args={[2.8, 0.45, 0.12]} />
        <meshStandardMaterial color={YARD.paper} roughness={0.75} />
      </mesh>
      <mesh position={[0, 2.15, 0.08]}>
        <boxGeometry args={[2.6, 0.1, 0.04]} />
        <meshStandardMaterial
          color={YARD.accent}
          emissive={YARD.accent}
          emissiveIntensity={0.7}
        />
      </mesh>
      <NeonHalo position={[0, 2.15, 0.2]} width={2.8} height={0.45} />
      {/* Visual-only track markings; collision stays on the gate landmark. */}
      {[2.4, 4.8, 7.2, 9.6].map((pz) => (
        <mesh key={pz} position={[0, 0.03, pz]} receiveShadow>
          <boxGeometry args={[2.2, 0.04, 0.22]} />
          <meshStandardMaterial color={YARD.paper} roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, 6]} receiveShadow>
        <boxGeometry args={[0.16, 0.03, 12]} />
        <meshStandardMaterial color={YARD.accent} roughness={1} />
      </mesh>
      {[-1.25, 1.25].map((px) =>
        [3, 6, 9].map((pz) => (
          <mesh key={`${px}:${pz}`} position={[px, 0.22, pz]}>
            <coneGeometry args={[0.16, 0.42, 8]} />
            <meshStandardMaterial color={YARD.accent} roughness={0.7} />
          </mesh>
        )),
      )}
      <YardKitSwap
        name="bowl-platform"
        fallback={
          <>
            <mesh
              position={[3.35, 1.05, 2.1]}
              rotation={[Math.PI, 0, 0]}
              scale={[1, 0.48, 1]}
              receiveShadow
            >
              <sphereGeometry
                args={[2.2, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2]}
              />
              <meshStandardMaterial
                color={YARD.concreteDark}
                roughness={0.92}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh position={[3.35, 1.05, 2.1]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[2.2, 0.16, 8, 28]} />
              <meshStandardMaterial
                color={YARD.concreteLight}
                roughness={0.8}
              />
            </mesh>
          </>
        }
      />
      <YardRaceBowlKit />
      <PastureWorldText
        position={[0, 2.85, 0]}
        fontSize={0.32}
        anchorX="center"
        anchorY="middle"
        tag={label.tag}
      >
        {label.title}
      </PastureWorldText>
    </group>
  );
}

export function PastureActivityAreas({
  onInteract,
}: {
  preferPerf?: boolean;
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
            rotY={yardFacing(land.position.x, land.position.z)}
            onInteract={handle(station)}
          />
        );
      })}
      <YardCanalKit />
    </group>
  );
}
