import { Canvas, useFrame } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { PASTURE_ZONE } from "../world/config/zones";
import {
  usePlazaPresence,
  type PresenceChat,
} from "../world/hooks/usePlazaPresence";
import { ensureWorldFontConfig } from "../world/lib/configureWorldFonts";
import type { LivePose } from "../world/scene/Player";
import { PetMesh } from "../world/scene/PetMesh";
import { StarterTown } from "../world/scene/StarterTown";
import {
  obstaclesForZone,
  randomWanderTarget,
  resolveClickTarget,
  seedPose,
  stepToward,
  type Vec2,
} from "./pathing";
import { approachSpeed, desiredWalkSpeed, lerpAngle, retarget } from "./motion";
import { meadowHeight } from "./meadowHeight";
import { Meadow } from "./Meadow";
import type { PasturePet } from "./types";
import type { EquippedCosmetics } from "../content/cosmetics";
import {
  shouldPromoteForChat,
  shouldSilentRejoin,
} from "../world/lib/plazaChatAuth";
import {
  PASTURE_ZOOM_DEFAULT,
  cameraOccludersForZone,
  clampZoom,
  resolveFollowCamera,
  zoomBySteps,
  zoomFromWheel,
} from "./camera";
import { pasturePetLabel } from "./labels";

ensureWorldFontConfig();

const HINT_KEY = "boing-pets-pasture-hint-v1";

export type PastureDebug = {
  getPetCount: () => number;
  getOwnPosition: () => Vec2;
  walkTo: (x: number, z: number) => void;
  inspectOwner: (owner: string) => void;
  getPlayers: () => Array<{ id: string; x: number; z: number }>;
  getChats: () => PresenceChat[];
  getEquipped: (owner: string) => EquippedCosmetics | undefined;
  sendChat: (text: string) => boolean;
  sendCosmetics: (cosmetics?: EquippedCosmetics) => void;
  getZoom: () => number;
  setZoom: (distance: number) => void;
  zoomBy: (steps: number) => void;
  resetCamera: () => void;
};

export type PastureAppProps = {
  pets: PasturePet[];
  owner: string | null;
  onInspect: (pet: PasturePet) => void;
  onChats?: (chats: PresenceChat[]) => void;
  onStatus?: (text: string) => void;
  handleRef?: MutableRefObject<PastureDebug | null>;
};

const WALK_SPEED = 5.2;
const WANDER_SPEED = 1.35;
const PASTURE_OBSTACLES = obstaclesForZone(PASTURE_ZONE);

function usePrefers() {
  return useMemo(() => {
    if (typeof window === "undefined")
      return { preferPerf: true, reducedMotion: false };
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const preferPerf =
      reducedMotion ||
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(max-width: 900px)").matches;
    return { preferPerf, reducedMotion };
  }, []);
}

function readHintOpen() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HINT_KEY) !== "1";
  } catch {
    return true;
  }
}

export function PastureApp({
  pets,
  owner,
  onInspect,
  onChats,
  onStatus,
  handleRef,
}: PastureAppProps) {
  const { preferPerf, reducedMotion } = usePrefers();
  const livePose = useRef<LivePose>({
    zone: PASTURE_ZONE.id,
    x: PASTURE_ZONE.spawn.x,
    y: 0,
    z: PASTURE_ZONE.spawn.z,
  });
  const walkTarget = useRef<Vec2 | null>(null);
  const zoomRef = useRef(PASTURE_ZOOM_DEFAULT);
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(PASTURE_ZOOM_DEFAULT);
  const [ready, setReady] = useState(false);
  const [hintOpen, setHintOpen] = useState(readHintOpen);
  const [selected, setSelected] = useState<string | null>(null);
  const [joinNonce, setJoinNonce] = useState(0);
  const [allowPrompt, setAllowPrompt] = useState(false);
  const silentRejoin = useRef(false);
  const pendingChat = useRef<string | null>(null);
  const mine = pets.find((pet) => pet.owner === owner) || null;
  const cosmetics = mine?.cosmetics;
  const presence = usePlazaPresence(
    PASTURE_ZONE.id,
    livePose,
    true,
    allowPrompt,
    joinNonce,
    {
      allowSocialSession: true,
      cosmetics,
    },
  );

  const applyZoom = useCallback((distance: number) => {
    const next = clampZoom(distance);
    zoomRef.current = next;
    setZoom(next);
    return next;
  }, []);

  const dismissHint = useCallback(() => {
    setHintOpen(false);
    try {
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  useEffect(() => {
    if (
      !shouldSilentRejoin({
        walletBound: presence.walletBound,
        status: presence.status,
        owner,
        alreadyAttempted: silentRejoin.current,
      })
    )
      return;
    silentRejoin.current = true;
    setAllowPrompt(false);
    setJoinNonce((n) => n + 1);
  }, [owner, presence.walletBound, presence.status]);

  useEffect(() => {
    if (!presence.walletBound || presence.status !== "live") return;
    const queued = pendingChat.current;
    if (!queued) return;
    pendingChat.current = null;
    presence.sendChat(queued);
  }, [presence.walletBound, presence.status, presence.sendChat]);

  useEffect(() => {
    onChats?.(presence.chats);
  }, [presence.chats, onChats]);

  useEffect(() => {
    if (!onStatus) return;
    if (presence.error) {
      onStatus(presence.error);
      return;
    }
    if (presence.status === "live") {
      onStatus(
        presence.walletBound
          ? `Online in the pasture · ${presence.players.length} other wanderer${presence.players.length === 1 ? "" : "s"}`
          : "Spectating the pasture — connect to walk as your buddy and chat.",
      );
      return;
    }
    if (presence.status === "connecting") onStatus("Joining the pasture…");
  }, [
    presence.status,
    presence.error,
    presence.walletBound,
    presence.players.length,
    onStatus,
  ]);

  const inspect = useCallback(
    (pet: PasturePet) => {
      setSelected(pet.owner);
      onInspect(pet);
    },
    [onInspect],
  );

  const walkTo = useCallback((x: number, z: number) => {
    const target = resolveClickTarget(
      { x, z },
      PASTURE_ZONE,
      PASTURE_OBSTACLES,
    );
    walkTarget.current = retarget(walkTarget.current, target);
  }, []);

  const sendChat = useCallback(
    (text: string) => {
      if (presence.walletBound) return presence.sendChat(text);
      if (!shouldPromoteForChat({ walletBound: presence.walletBound, owner }))
        return false;
      pendingChat.current = text;
      silentRejoin.current = true;
      setAllowPrompt(true);
      setJoinNonce((n) => n + 1);
      return true;
    },
    [owner, presence.walletBound, presence.sendChat],
  );

  const resetCamera = useCallback(() => {
    applyZoom(PASTURE_ZOOM_DEFAULT);
  }, [applyZoom]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      applyZoom(zoomFromWheel(zoomRef.current, event.deltaY, event.deltaMode));
      dismissHint();
    };
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStart = 0;
    let zoomStart = PASTURE_ZOOM_DEFAULT;
    const pinchDistance = () => {
      const pts = [...pointers.values()];
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
    };
    const onDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        pinchStart = pinchDistance();
        zoomStart = zoomRef.current;
      }
    };
    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2 && pinchStart > 1) {
        event.preventDefault();
        applyZoom(zoomStart * (pinchStart / pinchDistance()));
        dismissHint();
      }
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchStart = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [applyZoom, dismissHint]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      )
        return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        applyZoom(zoomBySteps(zoomRef.current, -1));
        dismissHint();
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        applyZoom(zoomBySteps(zoomRef.current, 1));
        dismissHint();
      } else if (event.key === "0") {
        event.preventDefault();
        resetCamera();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [applyZoom, dismissHint, resetCamera]);

  useEffect(() => {
    const debug: PastureDebug = {
      getPetCount: () =>
        Math.max(
          document.querySelectorAll(".pasture-pet-hit").length,
          Math.min(pets.length, 24),
        ),
      getOwnPosition: () => ({ x: livePose.current.x, z: livePose.current.z }),
      walkTo,
      inspectOwner: (id) => {
        const pet = pets.find((item) => item.owner === id);
        if (pet) inspect(pet);
      },
      getPlayers: () =>
        presence.players.map((p) => ({ id: p.id, x: p.x, z: p.z })),
      getChats: () => presence.chats,
      getEquipped: (id) =>
        id === owner
          ? cosmetics
          : pets.find((item) => item.owner === id)?.cosmetics ||
            presence.players.find((p) => p.id === id)?.cosmetics,
      sendChat,
      sendCosmetics: presence.sendCosmetics,
      getZoom: () => zoomRef.current,
      setZoom: (distance) => applyZoom(distance),
      zoomBy: (steps) => applyZoom(zoomBySteps(zoomRef.current, steps)),
      resetCamera,
    };
    if (handleRef) handleRef.current = debug;
    if (typeof window !== "undefined") window.__pasture3d = debug;
    return () => {
      if (handleRef) handleRef.current = null;
      if (typeof window !== "undefined" && window.__pasture3d === debug)
        delete window.__pasture3d;
    };
  }, [
    pets,
    owner,
    cosmetics,
    presence.players,
    presence.chats,
    sendChat,
    presence.sendCosmetics,
    inspect,
    walkTo,
    handleRef,
    applyZoom,
    resetCamera,
  ]);

  return (
    <div className="pasture-3d-stage" ref={stageRef}>
      {!ready ? (
        <div className="pasture-loading" role="status">
          Growing the meadow…
        </div>
      ) : null}
      {hintOpen ? (
        <div className="pasture-hint" role="status">
          <p>
            Click the meadow to walk. Scroll or pinch to zoom. Press Enter to
            chat. Use + / - or the buttons to zoom, and 0 to reset.
          </p>
          <button type="button" className="quiet" onClick={dismissHint}>
            Got it
          </button>
        </div>
      ) : null}
      <div className="pasture-cam-controls" role="group" aria-label="Camera">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => {
            applyZoom(zoomBySteps(zoomRef.current, -1));
            dismissHint();
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => {
            applyZoom(zoomBySteps(zoomRef.current, 1));
            dismissHint();
          }}
        >
          -
        </button>
        <button type="button" aria-label="Reset camera" onClick={resetCamera}>
          Reset
        </button>
      </div>
      <Canvas
        shadows={false}
        dpr={preferPerf ? [1, 1.25] : [1, 1.75]}
        camera={{ position: [0, 11, 16], fov: 46, near: 0.1, far: 180 }}
        gl={{
          antialias: !preferPerf,
          powerPreference: preferPerf ? "low-power" : "high-performance",
          alpha: false,
        }}
        onCreated={({ gl }) => {
          gl.domElement.dataset.pastureCanvas = "1";
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          setReady(true);
        }}
        onPointerDown={dismissHint}
      >
        <Suspense fallback={null}>
          <color attach="background" args={["#b9d7ef"]} />
          <fog attach="fog" args={["#c9d9b8", 28, 78]} />
          <ambientLight intensity={0.32} />
          <hemisphereLight args={["#cfe4ff", "#7a9a5c", 0.55]} />
          <directionalLight
            intensity={1.35}
            color="#fff1d0"
            position={[22, 28, 12]}
          />
          <directionalLight
            intensity={0.22}
            color="#9bb7ff"
            position={[-18, 10, -12]}
          />
          <Meadow
            preferPerf={preferPerf}
            onWalk={walkTo}
            walkEnabled={!!mine}
          />
          <StarterTown
            zone={PASTURE_ZONE}
            hideGround
            hideTrees
            heightAt={meadowHeight}
          />
          <PastureWorld
            pets={pets}
            owner={owner}
            mine={mine}
            selected={selected}
            livePose={livePose}
            walkTarget={walkTarget}
            zoomRef={zoomRef}
            presencePlayers={presence.players}
            chats={presence.chats}
            preferPerf={preferPerf}
            reducedMotion={reducedMotion}
            followOwner={!!mine}
            onInspect={inspect}
          />
        </Suspense>
      </Canvas>
      <span className="visually-hidden" aria-live="polite">
        Zoom {zoom.toFixed(1)}
      </span>
    </div>
  );
}

function PastureWorld({
  pets,
  owner,
  mine,
  selected,
  livePose,
  walkTarget,
  zoomRef,
  presencePlayers,
  chats,
  preferPerf,
  reducedMotion,
  followOwner,
  onInspect,
}: {
  pets: PasturePet[];
  owner: string | null;
  mine: PasturePet | null;
  selected: string | null;
  livePose: MutableRefObject<LivePose>;
  walkTarget: MutableRefObject<Vec2 | null>;
  zoomRef: MutableRefObject<number>;
  presencePlayers: Array<{
    id: string;
    name: string;
    color: string;
    x: number;
    y: number;
    z: number;
    cosmetics?: EquippedCosmetics;
  }>;
  chats: PresenceChat[];
  preferPerf: boolean;
  reducedMotion: boolean;
  followOwner: boolean;
  onInspect: (pet: PasturePet) => void;
}) {
  const obstacles = PASTURE_OBSTACLES;
  const cap = preferPerf ? 16 : 24;
  const liveIds = useMemo(() => {
    const ids = new Set(presencePlayers.map((p) => p.id));
    if (mine) ids.add(mine.owner);
    return ids;
  }, [presencePlayers, mine]);

  const offline = useMemo(() => {
    const list = pets.filter((pet) => !liveIds.has(pet.owner));
    return list.slice(0, Math.max(0, cap - 1 - presencePlayers.length));
  }, [pets, liveIds, cap, presencePlayers.length]);

  const bubbleById = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, string>();
    for (const chat of chats) {
      if (now - chat.at < 6000) map.set(chat.id, chat.text);
    }
    return map;
  }, [chats]);

  const lookFor = (id: string, fallbackName: string): PasturePet => {
    const found = pets.find((pet) => pet.owner === id);
    if (found) return found;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return {
      owner: id,
      traits: {
        species: fallbackName || "Buddy",
        hue: h % 360,
        accent: (h >>> 8) % 360,
        antenna: h % 2,
        spots: h % 3,
        shape: 0,
      },
    };
  };

  return (
    <group>
      <FollowCamera
        livePose={livePose}
        zoomRef={zoomRef}
        reducedMotion={reducedMotion}
        followOwner={followOwner}
      />
      {mine ? (
        <LocalPet
          pet={mine}
          livePose={livePose}
          walkTarget={walkTarget}
          obstacles={obstacles}
          reducedMotion={reducedMotion}
          selected={selected === mine.owner}
          bubble={bubbleById.get(mine.owner)}
          onInspect={() => onInspect(mine)}
        />
      ) : null}
      {presencePlayers.map((player) => {
        if (mine && player.id === mine.owner) return null;
        const pet = lookFor(player.id, player.name);
        return (
          <RemotePet
            key={player.id}
            pet={pet}
            player={player}
            owner={owner}
            selected={selected === player.id}
            reducedMotion={reducedMotion}
            bubble={bubbleById.get(player.id)}
            onInspect={() =>
              onInspect({
                ...pet,
                cosmetics: player.cosmetics || pet.cosmetics,
              })
            }
          />
        );
      })}
      {offline.map((pet, index) => (
        <WanderingPet
          key={pet.owner}
          pet={pet}
          index={index}
          obstacles={obstacles}
          reducedMotion={reducedMotion}
          selected={selected === pet.owner}
          bubble={bubbleById.get(pet.owner)}
          preferPerf={preferPerf}
          onInspect={() => onInspect(pet)}
        />
      ))}
    </group>
  );
}

function FollowCamera({
  livePose,
  zoomRef,
  reducedMotion,
  followOwner,
}: {
  livePose: MutableRefObject<LivePose>;
  zoomRef: MutableRefObject<number>;
  reducedMotion: boolean;
  followOwner: boolean;
}) {
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const lookSmooth = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const boxes = useMemo(() => cameraOccludersForZone(PASTURE_ZONE), []);
  const started = useRef(false);

  useFrame((state, delta) => {
    const pose = followOwner
      ? livePose.current
      : { x: PASTURE_ZONE.spawn.x, y: 0, z: PASTURE_ZONE.spawn.z };
    const ground = meadowHeight(pose.x, pose.z);
    const look = { x: pose.x, y: ground + 1.15, z: pose.z };
    const cam = resolveFollowCamera(look, zoomRef.current, meadowHeight, boxes);
    camTarget.set(cam.x, cam.y, cam.z);
    lookTarget.set(look.x, look.y, look.z);
    if (!started.current || reducedMotion) {
      state.camera.position.copy(camTarget);
      lookSmooth.copy(lookTarget);
      started.current = true;
    } else {
      const k = 1 - Math.pow(0.05, delta);
      state.camera.position.lerp(camTarget, k);
      lookSmooth.lerp(lookTarget, k);
    }
    state.camera.lookAt(lookSmooth);
  });
  return null;
}

function LocalPet({
  pet,
  livePose,
  walkTarget,
  obstacles,
  reducedMotion,
  selected,
  bubble,
  onInspect,
}: {
  pet: PasturePet;
  livePose: MutableRefObject<LivePose>;
  walkTarget: MutableRefObject<Vec2 | null>;
  obstacles: ReturnType<typeof obstaclesForZone>;
  reducedMotion: boolean;
  selected: boolean;
  bubble?: string;
  onInspect: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const moving = useRef(false);
  const started = useRef(false);
  const yaw = useRef(0);
  const speed = useRef(0);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    if (!started.current) {
      const y0 = meadowHeight(livePose.current.x, livePose.current.z);
      node.position.set(livePose.current.x, y0, livePose.current.z);
      started.current = true;
    }
    const target = walkTarget.current;
    if (target) {
      const here = { x: node.position.x, z: node.position.z };
      const dist = Math.hypot(target.x - here.x, target.z - here.z);
      const desired = desiredWalkSpeed(dist, WALK_SPEED);
      speed.current = approachSpeed(speed.current, desired, delta);
      const stepped = stepToward(
        here,
        target,
        delta,
        Math.max(speed.current, dist < 0.08 ? 0 : 0.35),
        PASTURE_ZONE,
        obstacles,
      );
      node.position.x = stepped.pos.x;
      node.position.z = stepped.pos.z;
      if (stepped.yaw !== null) {
        const turn = reducedMotion ? 1 : 1 - Math.pow(0.0008, delta);
        yaw.current = lerpAngle(yaw.current, stepped.yaw, turn);
        node.rotation.y = yaw.current;
      }
      moving.current = !stepped.arrived;
      if (stepped.arrived) {
        walkTarget.current = null;
        speed.current = 0;
      }
    } else {
      moving.current = false;
      speed.current = approachSpeed(speed.current, 0, delta);
    }
    node.position.y = meadowHeight(node.position.x, node.position.z);
    livePose.current = {
      zone: PASTURE_ZONE.id,
      x: node.position.x,
      y: 0,
      z: node.position.z,
    };
  });

  const label = pasturePetLabel({ species: pet.traits.species });

  return (
    <group
      ref={group}
      position={[
        livePose.current.x,
        meadowHeight(livePose.current.x, livePose.current.z),
        livePose.current.z,
      ]}
      userData={{ pasturePet: pet.owner }}
    >
      <PetMesh
        look={pet.traits}
        name={label}
        cosmetics={pet.cosmetics}
        reducedMotion={reducedMotion}
        selected={selected}
        yours
        movingRef={moving}
        bubble={bubble}
        onClick={onInspect}
      />
    </group>
  );
}

function WanderingPet({
  pet,
  index,
  obstacles,
  reducedMotion,
  selected,
  bubble,
  preferPerf,
  onInspect,
}: {
  pet: PasturePet;
  index: number;
  obstacles: ReturnType<typeof obstaclesForZone>;
  reducedMotion: boolean;
  selected: boolean;
  bubble?: string;
  preferPerf: boolean;
  onInspect: () => void;
}) {
  const spawn = useMemo(
    () => seedPose(pet.owner, index, PASTURE_ZONE, obstacles),
    [pet.owner, index, obstacles],
  );
  const group = useRef<THREE.Group>(null);
  const target = useRef<Vec2>(spawn);
  const nextPick = useRef(0);
  const moving = useRef(false);
  const lod = preferPerf || index > 8;

  useFrame((state, delta) => {
    const node = group.current;
    if (!node) return;
    if (reducedMotion) return;
    const now = state.clock.elapsedTime;
    if (now >= nextPick.current) {
      target.current = randomWanderTarget(
        (Math.floor(now * 10) + index * 17) >>> 0,
        PASTURE_ZONE,
        obstacles,
      );
      nextPick.current = now + 3.5 + (index % 5) * 0.7;
    }
    const stepped = stepToward(
      { x: node.position.x, z: node.position.z },
      target.current,
      delta,
      WANDER_SPEED,
      PASTURE_ZONE,
      obstacles,
    );
    node.position.x = stepped.pos.x;
    node.position.z = stepped.pos.z;
    node.position.y = meadowHeight(node.position.x, node.position.z);
    if (stepped.yaw !== null) {
      node.rotation.y = lerpAngle(
        node.rotation.y,
        stepped.yaw,
        1 - Math.pow(0.002, delta),
      );
    }
    moving.current = !stepped.arrived;
  });

  return (
    <group
      ref={group}
      position={[spawn.x, meadowHeight(spawn.x, spawn.z), spawn.z]}
    >
      <PetMesh
        look={pet.traits}
        name={pasturePetLabel({ species: pet.traits.species })}
        cosmetics={lod ? undefined : pet.cosmetics}
        reducedMotion={reducedMotion}
        selected={selected}
        movingRef={moving}
        bubble={bubble}
        onClick={onInspect}
      />
    </group>
  );
}

function RemotePet({
  pet,
  player,
  owner,
  selected,
  reducedMotion,
  bubble,
  onInspect,
}: {
  pet: PasturePet;
  player: {
    id: string;
    name: string;
    color: string;
    x: number;
    y: number;
    z: number;
    cosmetics?: EquippedCosmetics;
  };
  owner: string | null;
  selected: boolean;
  reducedMotion: boolean;
  bubble?: string;
  onInspect: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const moving = useRef(false);
  const started = useRef(false);
  const yaw = useRef(0);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    if (!started.current) {
      node.position.set(player.x, meadowHeight(player.x, player.z), player.z);
      started.current = true;
    }
    const dx = player.x - node.position.x;
    const dz = player.z - node.position.z;
    const dist = Math.hypot(dx, dz);
    const k = reducedMotion ? 1 : 1 - Math.pow(0.004, delta);
    node.position.x += dx * k;
    node.position.z += dz * k;
    node.position.y = meadowHeight(node.position.x, node.position.z);
    if (dist > 0.05) {
      const targetYaw = Math.atan2(dx, dz);
      yaw.current = lerpAngle(
        yaw.current,
        targetYaw,
        1 - Math.pow(0.001, delta),
      );
      node.rotation.y = yaw.current;
    }
    moving.current = dist > 0.12;
  });

  return (
    <group
      ref={group}
      position={[player.x, meadowHeight(player.x, player.z), player.z]}
    >
      <PetMesh
        look={pet.traits}
        name={pasturePetLabel({
          species: pet.traits.species,
          fallback: player.name,
        })}
        cosmetics={player.cosmetics || pet.cosmetics}
        reducedMotion={reducedMotion}
        selected={selected}
        yours={player.id === owner}
        movingRef={moving}
        bubble={bubble}
        onClick={onInspect}
      />
    </group>
  );
}

declare global {
  interface Window {
    __pasture3d?: PastureDebug;
  }
}
