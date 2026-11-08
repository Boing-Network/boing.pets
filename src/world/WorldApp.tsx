import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useMemo, useState } from "react";
import { STARTER_TOWN, type WorldStation } from "./config/zones";
import { usePlayerControls } from "./hooks/usePlayerControls";
import { WorldHud } from "./hud/WorldHud";
import { loadWorldPosition } from "./lib/storage";
import { Player } from "./scene/Player";
import { StarterTown } from "./scene/StarterTown";
import "./world.css";

export function WorldApp() {
  const controls = usePlayerControls();
  const [station, setStation] = useState<WorldStation | null>(null);
  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const spawn = useMemo(() => {
    const saved = loadWorldPosition();
    return saved?.zone === STARTER_TOWN.id ? saved.position : STARTER_TOWN.spawn;
  }, []);
  const onStation = useCallback((next: WorldStation | null) => {
    setStation(next);
  }, []);

  return (
    <div className="world-shell">
      <Canvas
        shadows={!reducedMotion}
        dpr={[1, 1.75]}
        camera={{ position: [0, 8, 14], fov: 50, near: 0.1, far: 120 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={[STARTER_TOWN.fogColor]} />
          <fog attach="fog" args={[STARTER_TOWN.fogColor, 18, 55]} />
          <ambientLight intensity={0.75} />
          <directionalLight
            castShadow={!reducedMotion}
            intensity={1.05}
            position={[12, 18, 8]}
            shadow-mapSize={[1024, 1024]}
          />
          <hemisphereLight args={["#d7e9ff", "#6f8f5a", 0.45]} />
          <StarterTown zone={STARTER_TOWN} />
          <Player
            zone={STARTER_TOWN}
            controls={controls}
            spawn={spawn}
            onStation={onStation}
          />
        </Suspense>
      </Canvas>
      <WorldHud
        zone={STARTER_TOWN}
        station={station}
        controls={controls}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
