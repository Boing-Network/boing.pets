import { Canvas } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { hex32 } from "../core";
import { STARTER_TOWN, type WorldStation } from "./config/zones";
import { usePlayerControls } from "./hooks/usePlayerControls";
import { usePlazaPresence } from "./hooks/usePlazaPresence";
import { WorldHud } from "./hud/WorldHud";
import { loadWorldPosition } from "./lib/storage";
import { Player, type LivePose } from "./scene/Player";
import { RemotePlayers } from "./scene/RemotePlayers";
import { StarterTown } from "./scene/StarterTown";
import "./world.css";

interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export function WorldApp() {
  const controls = usePlayerControls();
  const livePose = useRef<LivePose>({
    zone: STARTER_TOWN.id,
    x: STARTER_TOWN.spawn.x,
    y: STARTER_TOWN.spawn.y,
    z: STARTER_TOWN.spawn.z,
  });
  const [station, setStation] = useState<WorldStation | null>(null);
  const [localOwner, setLocalOwner] = useState<string | null>(null);
  const [notice, setNotice] = useState(
    "Plaza is live — connect Express to join as your wallet name; pets follow wallet players.",
  );
  useEffect(() => {
    void (async () => {
      try {
        const provider = (window as Window & { boing?: Provider }).boing;
        if (!provider) return;
        const accounts = (await provider.request({
          method: "boing_accounts",
          params: [],
        })) as string[];
        if (accounts?.[0]) setLocalOwner(hex32(accounts[0]));
      } catch {
        /* guest local avatar */
      }
    })();
  }, []);
  const [presenceOn, setPresenceOn] = useState(true);
  const preferPerf = useMemo(() => {
    if (typeof window === "undefined") return true;
    return (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(max-width: 900px)").matches
    );
  }, []);
  const spawn = useMemo(() => {
    const saved = loadWorldPosition();
    return saved?.zone === STARTER_TOWN.id ? saved.position : STARTER_TOWN.spawn;
  }, []);
  const onStation = useCallback((next: WorldStation | null) => {
    setStation(next);
  }, []);
  const presence = usePlazaPresence(STARTER_TOWN.id, livePose, presenceOn);

  return (
    <div className="world-shell">
      <Canvas
        shadows={false}
        dpr={preferPerf ? [1, 1.25] : [1, 1.75]}
        camera={{ position: [0, 8, 14], fov: 50, near: 0.1, far: 120 }}
        gl={{
          antialias: !preferPerf,
          powerPreference: preferPerf ? "low-power" : "high-performance",
          alpha: false,
        }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={[STARTER_TOWN.fogColor]} />
          <fog attach="fog" args={[STARTER_TOWN.fogColor, 18, 55]} />
          <ambientLight intensity={0.8} />
          <directionalLight intensity={1.0} position={[12, 18, 8]} />
          <hemisphereLight args={["#d7e9ff", "#6f8f5a", 0.45]} />
          <StarterTown zone={STARTER_TOWN} />
          <Player
            zone={STARTER_TOWN}
            controls={controls}
            spawn={spawn}
            livePose={livePose}
            onStation={onStation}
            owner={localOwner}
          />
          <RemotePlayers players={presence.players} />
        </Suspense>
      </Canvas>
      <WorldHud
        zone={STARTER_TOWN}
        station={station}
        controls={controls}
        livePose={livePose}
        preferPerf={preferPerf}
        notice={notice}
        onNotice={setNotice}
        presenceStatus={presence.status}
        presenceCount={presence.players.length}
        presenceError={presence.error}
        presenceOn={presenceOn}
        onTogglePresence={() => setPresenceOn((v) => !v)}
      />
    </div>
  );
}
