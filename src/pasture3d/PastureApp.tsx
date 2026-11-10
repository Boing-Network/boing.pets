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
import { approachSpeed, desiredWalkSpeed, lerpAngle, retarget } from "./motion";
import { meadowHeight } from "./meadowHeight";
import { Meadow } from "./Meadow";
import type { PasturePet } from "./types";
import type { EquippedCosmetics } from "../content/cosmetics";
import {
  shouldPromoteForChat,
  shouldSilentRejoin,
} from "../world/lib/plazaChatAuth";

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
    walkTarget.current = retarget(walkTarget.current, { x, z });
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
  ]);

  return (
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
      }}
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
        <Meadow preferPerf={preferPerf} onWalk={walkTo} walkEnabled={!!mine} />
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
          presencePlayers={presence.players}
          chats={presence.chats}
          preferPerf={preferPerf}
          reducedMotion={reducedMotion}
          followOwner={!!mine}
          onInspect={inspect}
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
  reducedMotion,
}: {
  livePose: MutableRefObject<LivePose>;
  reducedMotion: boolean;
}) {
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const pose = livePose.current;
    const ground = meadowHeight(pose.x, pose.z);
    camTarget.set(pose.x, ground + pose.y + 8.2, pose.z + 13);
    if (reducedMotion) state.camera.position.copy(camTarget);
    else state.camera.position.lerp(camTarget, 1 - Math.pow(0.001, delta));
    lookTarget.set(pose.x, ground + 1.15, pose.z);
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
        name={pet.traits.species}
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
        name={pet.traits.species}
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
        name={pet.traits.species || player.name}
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
