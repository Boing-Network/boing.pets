import { OrbitControls } from "@react-three/drei";
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
  seedPose,
  stepToward,
  type Vec2,
} from "./pathing";
import type { PasturePet } from "./types";
import type { EquippedCosmetics } from "../content/cosmetics";

ensureWorldFontConfig();

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
  const [selected, setSelected] = useState<string | null>(null);
  const mine = pets.find((pet) => pet.owner === owner) || null;
  const cosmetics = mine?.cosmetics;
  const presence = usePlazaPresence(PASTURE_ZONE.id, livePose, true, false, 0, {
    allowSocialSession: true,
    cosmetics,
  });

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
    walkTarget.current = { x, z };
  }, []);

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
      sendChat: presence.sendChat,
      sendCosmetics: presence.sendCosmetics,
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
    presence.sendChat,
    presence.sendCosmetics,
    inspect,
    walkTo,
    handleRef,
  ]);

  return (
    <Canvas
      shadows={false}
      dpr={preferPerf ? [1, 1.25] : [1, 1.75]}
      camera={{ position: [0, 11, 16], fov: 48, near: 0.1, far: 120 }}
      gl={{
        antialias: !preferPerf,
        powerPreference: preferPerf ? "low-power" : "high-performance",
        alpha: false,
      }}
      onCreated={({ gl }) => {
        gl.domElement.dataset.pastureCanvas = "1";
      }}
    >
      <Suspense fallback={null}>
        <color attach="background" args={[PASTURE_ZONE.fogColor]} />
        <fog attach="fog" args={[PASTURE_ZONE.fogColor, 22, 60]} />
        <ambientLight intensity={0.8} />
        <directionalLight intensity={1.0} position={[12, 18, 8]} />
        <hemisphereLight args={["#d7e9ff", "#6f8f5a", 0.45]} />
        <StarterTown zone={PASTURE_ZONE} />
        <PastureWorld
          pets={pets}
          owner={owner}
          mine={mine}
          selected={selected}
          livePose={livePose}
          walkTarget={walkTarget}
          presencePlayers={presence.players}
          chats={presence.chats}
          preferPerf={preferPerf}
          reducedMotion={reducedMotion}
          followOwner={!!mine}
          onInspect={inspect}
          onWalk={walkTo}
        />
      </Suspense>
    </Canvas>
  );
}

function PastureWorld({
  pets,
  owner,
  mine,
  selected,
  livePose,
  walkTarget,
  presencePlayers,
  chats,
  preferPerf,
  reducedMotion,
  followOwner,
  onInspect,
  onWalk,
}: {
  pets: PasturePet[];
  owner: string | null;
  mine: PasturePet | null;
  selected: string | null;
  livePose: MutableRefObject<LivePose>;
  walkTarget: MutableRefObject<Vec2 | null>;
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
  onWalk: (x: number, z: number) => void;
}) {
  const obstacles = useMemo(() => obstaclesForZone(PASTURE_ZONE), []);
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
      },
    };
  };

  return (
    <group>
      <ClickGround enabled={!!mine} onWalk={onWalk} />
      {followOwner ? (
        <FollowCamera livePose={livePose} reducedMotion={reducedMotion} />
      ) : (
        <OrbitControls
          enableDamping={!reducedMotion}
          enablePan
          maxPolarAngle={Math.PI / 2.15}
          minDistance={6}
          maxDistance={36}
          target={[0, 1, 0]}
        />
      )}
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
        const moving =
          Math.hypot(player.x - (pet as unknown as Vec2).x, player.z) > -1;
        return (
          <group key={player.id} position={[player.x, 0, player.z]}>
            <PetMesh
              look={pet.traits}
              name={pet.traits.species || player.name}
              cosmetics={player.cosmetics || pet.cosmetics}
              reducedMotion={reducedMotion}
              selected={selected === player.id}
              yours={player.id === owner}
              moving={moving}
              bubble={bubbleById.get(player.id)}
              onClick={() =>
                onInspect({
                  ...pet,
                  cosmetics: player.cosmetics || pet.cosmetics,
                })
              }
            />
          </group>
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

function ClickGround({
  enabled,
  onWalk,
}: {
  enabled: boolean;
  onWalk: (x: number, z: number) => void;
}) {
  const pointer = useRef<{ x: number; y: number } | null>(null);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.04, 0]}
      onPointerDown={(event) => {
        pointer.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = pointer.current;
        pointer.current = null;
        if (!enabled || !start) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8)
          return;
        const point = event.point;
        onWalk(point.x, point.z);
      }}
    >
      <circleGeometry args={[34, 48]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

function FollowCamera({
  livePose,
  reducedMotion,
}: {
  livePose: MutableRefObject<LivePose>;
  reducedMotion: boolean;
}) {
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const pose = livePose.current;
    camTarget.set(pose.x, pose.y + 8, pose.z + 12);
    if (reducedMotion) state.camera.position.copy(camTarget);
    else state.camera.position.lerp(camTarget, 1 - Math.pow(0.001, delta));
    lookTarget.set(pose.x, 1.1, pose.z);
    state.camera.lookAt(lookTarget);
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

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    if (!started.current) {
      node.position.set(livePose.current.x, 0, livePose.current.z);
      started.current = true;
    }
    const target = walkTarget.current;
    if (target) {
      const stepped = stepToward(
        { x: node.position.x, z: node.position.z },
        target,
        delta,
        WALK_SPEED,
        PASTURE_ZONE,
        obstacles,
      );
      node.position.x = stepped.pos.x;
      node.position.z = stepped.pos.z;
      if (stepped.yaw !== null) node.rotation.y = stepped.yaw;
      moving.current = !stepped.arrived;
      if (stepped.arrived) walkTarget.current = null;
    } else {
      moving.current = false;
    }
    livePose.current = {
      zone: PASTURE_ZONE.id,
      x: node.position.x,
      y: 0,
      z: node.position.z,
    };
  });

  return (
    <group
      ref={group}
      position={[livePose.current.x, 0, livePose.current.z]}
      userData={{ pasturePet: pet.owner }}
    >
      <PetMesh
        look={pet.traits}
        name={pet.traits.species}
        cosmetics={pet.cosmetics}
        reducedMotion={reducedMotion}
        selected={selected}
        yours
        moving={moving.current}
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
    () => seedPose(pet.owner, index, PASTURE_ZONE),
    [pet.owner, index],
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
    if (stepped.yaw !== null) node.rotation.y = stepped.yaw;
    moving.current = !stepped.arrived;
  });

  return (
    <group ref={group} position={[spawn.x, 0, spawn.z]}>
      <PetMesh
        look={pet.traits}
        name={pet.traits.species}
        cosmetics={lod ? undefined : pet.cosmetics}
        reducedMotion={reducedMotion}
        selected={selected}
        moving={moving.current}
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
