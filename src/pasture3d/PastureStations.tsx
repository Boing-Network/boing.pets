import type { ThreeEvent } from "@react-three/fiber";
import { PastureWorldText } from "./PastureWorldText";
import type { WorldLandmark, WorldStation } from "../world/config/zones";
import { PASTURE_ZONE } from "../world/config/zones";
import { meadowHeight } from "./meadowHeight";
import { NeonHalo, YARD } from "./yardChrome";
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
  onInteract,
}: {
  x: number;
  z: number;
  y: number;
  onInteract: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const label = yardLabelForLandmark("crafting-station");
  return (
    <group position={[x, y, z]} onPointerDown={onInteract} {...hoverHandlers()}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.06, 2.4]} />
        <meshStandardMaterial color={YARD.concreteDark} roughness={1} />
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
      <mesh position={[0, 1.7, -1.0]} castShadow>
        <boxGeometry args={[2.2, 1.2, 0.1]} />
        <meshStandardMaterial color={YARD.ink2} roughness={0.8} />
      </mesh>
      <mesh position={[-0.45, 1.75, -0.94]} castShadow>
        <boxGeometry args={[0.7, 0.9, 0.04]} />
        <meshStandardMaterial color={YARD.paper} roughness={0.8} />
      </mesh>
      <mesh position={[0.45, 1.7, -0.94]} castShadow>
        <boxGeometry args={[0.7, 0.9, 0.04]} />
        <meshStandardMaterial color={YARD.accent} roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.38, -1.0]}>
        <boxGeometry args={[2.2, 0.1, 0.12]} />
        <meshStandardMaterial
          color={YARD.accent}
          emissive={YARD.accent}
          emissiveIntensity={0.7}
        />
      </mesh>
      <NeonHalo position={[0, 2.38, -0.85]} width={2.4} height={0.4} />
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
  onInteract,
}: {
  x: number;
  z: number;
  y: number;
  onInteract: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const label = yardLabelForLandmark("market-stall");
  return (
    <group position={[x, y, z]} onPointerDown={onInteract} {...hoverHandlers()}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[4.0, 0.06, 3.0]} />
        <meshStandardMaterial color={YARD.concreteDark} roughness={1} />
      </mesh>
      <mesh position={[0, 1.25, -0.35]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 2.5, 1.8]} />
        <meshStandardMaterial color={YARD.ink} roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.58, -0.35]}>
        <boxGeometry args={[3.5, 0.16, 1.9]} />
        <meshStandardMaterial color={YARD.paper} roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.78, -0.2]}>
        <boxGeometry args={[2.4, 0.12, 0.18]} />
        <meshStandardMaterial
          color={YARD.accent}
          emissive={YARD.accent}
          emissiveIntensity={0.85}
        />
      </mesh>
      <NeonHalo position={[0, 2.78, 0.15]} width={2.8} height={0.5} />
      <mesh position={[0, 1.2, 0.58]} castShadow>
        <boxGeometry args={[2.2, 1.4, 0.08]} />
        <meshStandardMaterial
          color="#1a3040"
          emissive="#ff9a4a"
          emissiveIntensity={0.22}
          roughness={0.2}
          metalness={0.15}
        />
      </mesh>
      <mesh position={[0, 0.7, 0.7]} castShadow receiveShadow>
        <boxGeometry args={[3.0, 0.14, 0.8]} />
        <meshStandardMaterial
          color={YARD.metal}
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>
      {(
        [
          [-1.2, 0.55],
          [1.2, 0.55],
        ] as const
      ).map(([px, pz], i) => (
        <mesh key={i} position={[px, 0.4, pz]} castShadow>
          <boxGeometry args={[0.55, 0.5, 0.45]} />
          <meshStandardMaterial
            color={i ? YARD.paper : YARD.accent}
            roughness={0.8}
          />
        </mesh>
      ))}
      <PastureWorldText
        position={[0, 3.15, 0]}
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
  onInteract,
}: {
  x: number;
  z: number;
  y: number;
  onInteract: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const label = yardLabelForLandmark("customization-station");
  return (
    <group position={[x, y, z]} onPointerDown={onInteract} {...hoverHandlers()}>
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
  onInteract,
}: {
  x: number;
  z: number;
  y: number;
  onInteract: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const label = yardLabelForLandmark("home-plot");
  return (
    <group position={[x, y, z]} onPointerDown={onInteract}>
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
