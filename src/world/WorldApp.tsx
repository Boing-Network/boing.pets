import { Canvas } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { tryRestoreWalletSession } from "../wallet/session";
import { STARTER_TOWN, type WorldStation } from "./config/zones";
import { usePlayerControls } from "./hooks/usePlayerControls";
import { usePlazaPresence } from "./hooks/usePlazaPresence";
import { WorldHud } from "./hud/WorldHud";
import { loadWorldPosition } from "./lib/storage";
import { loadPresenceToken } from "./lib/presenceTokenCache";
import { Player, type LivePose } from "./scene/Player";
import { RemotePlayers } from "./scene/RemotePlayers";
import { StarterTown } from "./scene/StarterTown";
import { ensureWorldFontConfig } from "./lib/configureWorldFonts";
import "./world.css";

ensureWorldFontConfig();

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
  const [presenceOn, setPresenceOn] = useState(true);
  const [allowPrompt, setAllowPrompt] = useState(false);
  const [joinNonce, setJoinNonce] = useState(0);
  const [notice, setNotice] = useState(
    "Plaza is live — guests join instantly; Join plaza once to appear as your Express wallet.",
  );

  useEffect(() => {
    void (async () => {
      const session = await tryRestoreWalletSession();
      if (!session) return;
      setLocalOwner(session.owner);
      const cached = loadPresenceToken(session.owner, STARTER_TOWN.id);
      setNotice(
        cached
          ? "Express restored — rejoining the plaza as your wallet."
          : "Express connected — click Join plaza once to appear as your wallet name (sign is cached for this session).",
      );
    })();
  }, []);

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
    return saved?.zone === STARTER_TOWN.id
      ? saved.position
      : STARTER_TOWN.spawn;
  }, []);
  const onStation = useCallback((next: WorldStation | null) => {
    setStation(next);
  }, []);
  const presence = usePlazaPresence(
    STARTER_TOWN.id,
    livePose,
    presenceOn,
    allowPrompt,
    joinNonce,
  );

  useEffect(() => {
    if (!presenceOn) return;
    if (presence.walletBound) {
      setNotice("You are in the plaza as your Express wallet.");
      return;
    }
    if (localOwner) {
      setNotice(
        "Joined as a guest for now — click Appear as wallet to sign once (cached for this session).",
      );
    }
  }, [presence.walletBound, presenceOn, localOwner]);

  const onTogglePresence = useCallback(() => {
    if (presenceOn && !presence.walletBound && localOwner) {
      setAllowPrompt(true);
      setJoinNonce((n) => n + 1);
      setNotice("Approve Express to appear as your wallet…");
      return;
    }
    if (presenceOn) {
      setPresenceOn(false);
      setAllowPrompt(false);
      setNotice("Left the plaza. Join again when you are ready.");
      return;
    }
    setAllowPrompt(true);
    setJoinNonce((n) => n + 1);
    setPresenceOn(true);
    setNotice("Joining plaza… approve Express if asked (cached afterward).");
  }, [presenceOn, presence.walletBound, localOwner]);

  const leavePlaza = useCallback(() => {
    setPresenceOn(false);
    setAllowPrompt(false);
  }, []);

  const navigateAway = useCallback(
    (href: string) => {
      leavePlaza();
      window.setTimeout(() => {
        window.location.assign(href);
      }, 50);
    },
    [leavePlaza],
  );

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
            onNavigateAway={navigateAway}
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
        walletBound={presence.walletBound}
        canPromoteWallet={!!localOwner && !presence.walletBound}
        onTogglePresence={onTogglePresence}
        onLeavePlaza={leavePlaza}
      />
    </div>
  );
}
