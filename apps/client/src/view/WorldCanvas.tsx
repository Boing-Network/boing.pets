import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { CreatureStatus, type CreatureView } from "@boing-pets/contract";
import { useUiStore } from "../state/uiStore";
import { useWorldViewStore } from "../state/worldViewStore";
import { CreatureToken } from "./CreatureToken";
import { layoutForSlug } from "./layout";
import { TerritoryMesh } from "./TerritoryMesh";

function WorldScene() {
  const view = useWorldViewStore((s) => s.view);
  const selectedCreatureId = useUiStore((s) => s.selectedCreatureId);
  const selectCreature = useUiStore((s) => s.selectCreature);

  if (!view) {
    return null;
  }

  const territoriesById = new Map(
    view.territories.map((t) => [t.id, t] as const),
  );
  const living: CreatureView[] = view.creatures.filter(
    (c) => c.status === CreatureStatus.ALIVE,
  );

  return (
    <>
      <color attach="background" args={["#1a2218"]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
      >
        <planeGeometry args={[24, 16]} />
        <meshStandardMaterial color="#12180f" roughness={1} />
      </mesh>

      {view.links.map((link) => {
        const from = territoriesById.get(link.fromId);
        const to = territoriesById.get(link.toId);
        if (!from || !to) return null;
        // Drawn once per undirected pair by only rendering when fromId < toId.
        if (link.fromId > link.toId) return null;
        const fromLayout = layoutForSlug(from.slug);
        const toLayout = layoutForSlug(to.slug);
        const midX = (fromLayout.x + toLayout.x) / 2;
        const midZ = (fromLayout.z + toLayout.z) / 2;
        const dx = toLayout.x - fromLayout.x;
        const dz = toLayout.z - fromLayout.z;
        const length = Math.hypot(dx, dz);
        const angle = Math.atan2(dz, dx);
        return (
          <mesh
            key={`${link.fromId}-${link.toId}`}
            position={[midX, 0.03, midZ]}
            rotation={[0, -angle, 0]}
          >
            <boxGeometry args={[length, 0.02, 0.08]} />
            <meshBasicMaterial color="#4a5a40" transparent opacity={0.7} />
          </mesh>
        );
      })}

      {view.territories.map((territory) => (
        <TerritoryMesh key={territory.id} territory={territory} />
      ))}

      {living.map((creature) => (
        <CreatureToken
          key={creature.id}
          creature={creature}
          worldSeed={view.world.seed}
          viewTick={view.world.lastTick}
          territoriesById={territoriesById}
          selected={selectedCreatureId === creature.id}
          onSelect={selectCreature}
        />
      ))}

      <OrbitControls
        enablePan
        maxPolarAngle={Math.PI / 2.15}
        minDistance={4}
        maxDistance={22}
        target={[0, 0, 0]}
      />
    </>
  );
}

export function WorldCanvas() {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 11, 10], fov: 42, near: 0.1, far: 100 }}
      gl={{ antialias: true }}
    >
      <WorldScene />
    </Canvas>
  );
}
