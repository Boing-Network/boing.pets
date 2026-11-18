import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { CreatureStatus, type CreatureView } from "@boing-pets/contract";
import { useUiStore } from "../state/uiStore";
import { useWorldViewStore } from "../state/worldViewStore";
import { CreatureToken } from "./CreatureToken";
import { layoutForSlug } from "./layout";
import { TerritoryMesh } from "./TerritoryMesh";
import { WorldAtmosphere } from "./WorldAtmosphere";

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
      <WorldAtmosphere />

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
            position={[midX, 0.04, midZ]}
            rotation={[0, -angle, 0]}
          >
            <boxGeometry args={[length, 0.025, 0.1]} />
            <meshStandardMaterial
              color="#1a3a40"
              emissive="#2ec4b0"
              emissiveIntensity={0.45}
              transparent
              opacity={0.75}
            />
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
        maxPolarAngle={Math.PI / 2.05}
        minDistance={5}
        maxDistance={30}
        target={[0, 0.6, 0.5]}
      />
    </>
  );
}

export function WorldCanvas() {
  return (
    <Canvas
      shadows
      camera={{ position: [1.5, 7.2, 13.5], fov: 40, near: 0.1, far: 90 }}
      gl={{ antialias: true }}
    >
      <WorldScene />
    </Canvas>
  );
}
