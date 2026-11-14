import type { ThreeEvent } from "@react-three/fiber";
import { PastureWorldText } from "./PastureWorldText";
import type { WorldLandmark, WorldStation } from "../world/config/zones";
import { PASTURE_ZONE } from "../world/config/zones";
import { meadowHeight } from "./meadowHeight";
import { NeonHalo, YARD } from "./yardChrome";
import { yardFacing } from "./yardFacing";
import { yardLabelForLandmark } from "./yardLabels";

function landmarkFor(id: string): WorldLandmark | undefined {
  return PASTURE_ZONE.landmarks.find((item) => item.id === id);
}

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

function Workbench({
  x,
  z,
  y,
  rotY = 0,
  onInteract,
}: {
  x: number;
  z: number;
  y: number;
  rotY?: number;
  onInteract: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const label = yardLabelForLandmark("crafting-station");
  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerDown={onInteract}
      {...hoverHandlers()}
    >
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.06, 2.4]} />
        <meshStandardMaterial color={YARD.concrete} roughness={1} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 0.16, 1.6]} />
        <meshStandardMaterial color={YARD.ink} roughness={0.7} />
      </mesh>
      {(
        [
          [-1.2, -0.7],
          [1.2, -0.7],
          [-1.2, 0.7],
          [1.2, 0.7],
        ] as const
      ).map(([px, pz]) => (
        <mesh key={`${px}:${pz}`} position={[px, 0.36, pz]} castShadow>
          <boxGeometry args={[0.16, 0.72, 0.16]} />
          <meshStandardMaterial
            color={YARD.metal}
            roughness={0.55}
            metalness={0.3}
          />
        </mesh>
      ))}
      <mesh position={[-0.7, 0.92, 0.1]} rotation={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.9, 0.12, 0.7]} />
        <meshStandardMaterial color={YARD.paper} roughness={0.85} />
      </mesh>
      <mesh position={[0.7, 0.95, -0.15]} rotation={[0.1, -0.2, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.28, 12]} />
        <meshStandardMaterial color={YARD.accent} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.7, 1.0]} castShadow>
        <boxGeometry args={[2.2, 1.2, 0.1]} />
        <meshStandardMaterial color={YARD.ink2} roughness={0.8} />
      </mesh>
      <mesh position={[-0.45, 1.75, 0.94]} castShadow>
        <boxGeometry args={[0.7, 0.9, 0.04]} />
        <meshStandardMaterial color={YARD.paper} roughness={0.8} />
      </mesh>
      <mesh position={[0.45, 1.7, 0.94]} castShadow>
        <boxGeometry args={[0.7, 0.9, 0.04]} />
        <meshStandardMaterial color={YARD.accent} roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.38, 1.0]}>
        <boxGeometry args={[2.2, 0.1, 0.12]} />
        <meshStandardMaterial
          color={YARD.accent}
          emissive={YARD.accent}
          emissiveIntensity={1.1}
        />
      </mesh>
      <mesh position={[0, 2.26, 1.0]}>
        <boxGeometry args={[2.0, 0.05, 0.1]} />
        <meshStandardMaterial
          color="#2ec8e0"
          emissive="#2ec8e0"
          emissiveIntensity={0.8}
        />
      </mesh>
      <NeonHalo position={[0, 2.38, 1.2]} width={2.6} height={0.45} />
      <PastureWorldText
        position={[0, 2.35, 0]}
        fontSize={0.36}
        anchorX="center"
        anchorY="middle"
        tag={label.tag}
      >
        {label.title}
      </PastureWorldText>
    </group>
  );
}

function MarketStall({
  x,
  z,
  y,
  rotY = 0,
  onInteract,
}: {
  x: number;
  z: number;
  y: number;
  rotY?: number;
  onInteract: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const label = yardLabelForLandmark("market-stall");
  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerDown={onInteract}
      {...hoverHandlers()}
    >
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[4.2, 0.06, 3.2]} />
        <meshStandardMaterial color={YARD.concrete} roughness={1} />
      </mesh>
      <mesh position={[0, 1.35, -0.25]} castShadow receiveShadow>
        <boxGeometry args={[3.6, 2.7, 2.0]} />
        <meshStandardMaterial color="#2c2c2e" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.78, -0.25]}>
        <boxGeometry args={[3.7, 0.18, 2.1]} />
        <meshStandardMaterial color={YARD.paper} roughness={0.65} />
      </mesh>
      <mesh position={[0, 2.22, 0.82]}>
        <boxGeometry args={[2.9, 0.16, 0.18]} />
        <meshStandardMaterial
          color={YARD.accent}
          emissive={YARD.accent}
          emissiveIntensity={1.4}
        />
      </mesh>
      <mesh position={[0, 2.08, 0.82]}>
        <boxGeometry args={[2.7, 0.06, 0.14]} />
        <meshStandardMaterial
          color="#2ec8e0"
          emissive="#2ec8e0"
          emissiveIntensity={0.9}
        />
      </mesh>
      <NeonHalo position={[0, 2.22, 1.05]} width={3.2} height={0.6} />
      <mesh position={[0, 1.25, 0.7]}>
        <boxGeometry args={[2.7, 1.7, 0.08]} />
        <meshStandardMaterial
          color="#3a2a18"
          emissive="#c4883a"
          emissiveIntensity={0.35}
          roughness={0.7}
        />
      </mesh>
      <mesh position={[0, 0.58, 0.78]} receiveShadow>
        <boxGeometry args={[2.5, 0.08, 0.45]} />
        <meshStandardMaterial color="#3a3a3c" roughness={0.6} />
      </mesh>
      {([-0.75, -0.15] as const).map((px, i) => (
        <group
          key={`shoe-${i}`}
          position={[px, 0.78, 0.86]}
          rotation={[0, 0.35, 0]}
        >
          <mesh>
            <boxGeometry args={[0.5, 0.16, 0.24]} />
            <meshStandardMaterial
              color={i ? YARD.paper : YARD.ink}
              roughness={0.65}
            />
          </mesh>
          <mesh position={[0.1, -0.08, 0]}>
            <boxGeometry args={[0.36, 0.06, 0.22]} />
            <meshStandardMaterial color={YARD.accent} roughness={0.55} />
          </mesh>
        </group>
      ))}
      <mesh position={[0.7, 1.85, 0.78]}>
        <boxGeometry args={[1.05, 0.04, 0.06]} />
        <meshStandardMaterial
          color={YARD.metal}
          roughness={0.4}
          metalness={0.4}
        />
      </mesh>
      {([0.4, 0.95] as const).map((px, i) => (
        <group key={`hood-${i}`} position={[px, 1.4, 0.86]}>
          <mesh>
            <boxGeometry args={[0.46, 0.7, 0.18]} />
            <meshStandardMaterial
              color={i ? "#5a4a8a" : "#1a1a1c"}
              roughness={0.85}
            />
          </mesh>
          <mesh position={[0, 0.4, 0]}>
            <sphereGeometry args={[0.18, 8, 6]} />
            <meshStandardMaterial
              color={i ? "#5a4a8a" : "#1a1a1c"}
              roughness={0.85}
            />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.25, 0.98]}>
        <boxGeometry args={[2.62, 1.62, 0.03]} />
        <meshStandardMaterial
          color="#c8e8f4"
          roughness={0.08}
          metalness={0.2}
          transparent
          opacity={0.18}
        />
      </mesh>
      <mesh position={[0, 0.55, 1.05]} receiveShadow>
        <boxGeometry args={[3.1, 0.12, 0.5]} />
        <meshStandardMaterial
          color={YARD.metal}
          roughness={0.45}
          metalness={0.3}
        />
      </mesh>
      <mesh position={[-1.4, 0.4, 1.05]} castShadow>
        <boxGeometry args={[0.5, 0.55, 0.42]} />
        <meshStandardMaterial color="#d2b48a" roughness={0.8} />
      </mesh>
      <mesh position={[1.4, 0.35, 1.05]} castShadow>
        <boxGeometry args={[0.45, 0.45, 0.4]} />
        <meshStandardMaterial color="#e8d5b0" roughness={0.8} />
      </mesh>
      <PastureWorldText
        position={[0, 3.25, 0.4]}
        fontSize={0.38}
        anchorX="center"
        anchorY="middle"
        tag={label.tag}
      >
        {label.title}
      </PastureWorldText>
    </group>
  );
}

function DressingStand({
  x,
  z,
  y,
  rotY = 0,
  onInteract,
}: {
  x: number;
  z: number;
  y: number;
  rotY?: number;
  onInteract: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const label = yardLabelForLandmark("customization-station");
  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerDown={onInteract}
      {...hoverHandlers()}
    >
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[3.2, 0.06, 2.6]} />
        <meshStandardMaterial color={YARD.concreteDark} roughness={1} />
      </mesh>
      <mesh position={[-0.15, 1.2, -0.4]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 2.4, 1.1]} />
        <meshStandardMaterial color={YARD.ink} roughness={0.8} />
      </mesh>
      <mesh position={[-0.15, 1.2, 0.16]} castShadow>
        <boxGeometry args={[0.9, 2.0, 0.08]} />
        <meshStandardMaterial color={YARD.paper} roughness={0.7} />
      </mesh>
      <mesh position={[-0.55, 2.15, 0.18]} castShadow>
        <boxGeometry args={[0.16, 0.16, 0.08]} />
        <meshStandardMaterial color={YARD.accent} roughness={0.4} />
      </mesh>
      <mesh position={[1.15, 1.15, 0.1]} castShadow>
        <boxGeometry args={[0.08, 2.1, 0.7]} />
        <meshStandardMaterial
          color="#c5d0d8"
          roughness={0.12}
          metalness={0.25}
          emissive="#f5f5f0"
          emissiveIntensity={0.12}
        />
      </mesh>
      <mesh position={[1.15, 2.25, 0.1]}>
        <boxGeometry args={[0.12, 0.08, 0.7]} />
        <meshStandardMaterial
          color={YARD.accent}
          emissive={YARD.accent}
          emissiveIntensity={0.55}
        />
      </mesh>
      <mesh position={[0.55, 0.55, 0.7]} castShadow>
        <boxGeometry args={[0.7, 1.1, 0.14]} />
        <meshStandardMaterial
          color={YARD.metal}
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>
      <mesh position={[0.55, 0.9, 0.62]} rotation={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.28, 0.7, 0.08]} />
        <meshStandardMaterial color={YARD.paper} roughness={0.8} />
      </mesh>
      <mesh position={[0.55, 0.85, 0.78]} rotation={[0, -0.3, 0]} castShadow>
        <boxGeometry args={[0.28, 0.7, 0.08]} />
        <meshStandardMaterial color={YARD.accent} roughness={0.8} />
      </mesh>
      <PastureWorldText
        position={[0, 2.95, 0]}
        fontSize={0.3}
        anchorX="center"
        anchorY="middle"
        tag={label.tag}
      >
        {label.title}
      </PastureWorldText>
    </group>
  );
}

function HomePlot({
  x,
  z,
  y,
  rotY = 0,
  onInteract,
}: {
  x: number;
  z: number;
  y: number;
  rotY?: number;
  onInteract: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const label = yardLabelForLandmark("home-plot");
  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerDown={onInteract}
    >
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, 0]}
        receiveShadow
      >
        <planeGeometry args={[5.2, 5.2]} />
        <meshStandardMaterial color={YARD.concreteLight} roughness={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[2.35, 2.55, 4]} />
        <meshStandardMaterial color={YARD.paper} roughness={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <ringGeometry args={[1.1, 1.2, 4]} />
        <meshStandardMaterial color={YARD.accent} roughness={0.6} />
      </mesh>
      {[
        [-2.4, -2.4],
        [2.4, -2.4],
        [-2.4, 2.4],
        [2.4, 2.4],
      ].map(([px, pz]) => (
        <mesh key={px + ":" + pz} position={[px, 0.28, pz]}>
          <boxGeometry args={[0.18, 0.56, 0.18]} />
          <meshStandardMaterial color={YARD.ink} roughness={0.7} />
        </mesh>
      ))}
      <PastureWorldText
        position={[0, 1.15, 0]}
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
          rotY={yardFacing(craftLand.position.x, craftLand.position.z)}
          onInteract={handle(craft)}
        />
      ) : null}
      {market && marketLand ? (
        <MarketStall
          x={marketLand.position.x}
          z={marketLand.position.z}
          y={meadowHeight(marketLand.position.x, marketLand.position.z)}
          rotY={yardFacing(marketLand.position.x, marketLand.position.z)}
          onInteract={handle(market)}
        />
      ) : null}
      {customize && customizeLand ? (
        <DressingStand
          x={customizeLand.position.x}
          z={customizeLand.position.z}
          y={meadowHeight(customizeLand.position.x, customizeLand.position.z)}
          rotY={yardFacing(customizeLand.position.x, customizeLand.position.z)}
          onInteract={handle(customize)}
        />
      ) : null}
      {home && homeLand ? (
        <HomePlot
          x={homeLand.position.x}
          z={homeLand.position.z}
          y={meadowHeight(homeLand.position.x, homeLand.position.z)}
          rotY={yardFacing(homeLand.position.x, homeLand.position.z)}
          onInteract={handle(home)}
        />
      ) : null}
    </group>
  );
}
