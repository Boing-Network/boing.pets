import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { WorldStation, WorldZoneConfig } from "../config/zones";
import type { ControlState } from "../hooks/usePlayerControls";
import { usePetLook } from "../hooks/usePetLook";
import { saveWorldPosition } from "../lib/storage";
import type { EquippedCosmetics } from "../../content/cosmetics";
import { PetFollower } from "./PetFollower";

const SPEED = 6.5;
const SAVE_EVERY_MS = 1500;

export interface LivePose {
  zone: string;
  x: number;
  y: number;
  z: number;
  yaw?: number;
}

export function Player({
  zone,
  controls,
  spawn,
  livePose,
  onStation,
  onNavigateAway,
  owner = null,
  cosmetics,
}: {
  zone: WorldZoneConfig;
  controls: MutableRefObject<ControlState>;
  spawn: { x: number; y: number; z: number };
  livePose: MutableRefObject<LivePose>;
  onStation: (station: WorldStation | null) => void;
  /** Leave plaza / flush presence before multipage navigation. */
  onNavigateAway?: (href: string) => void;
  owner?: string | null;
  cosmetics?: EquippedCosmetics;
}) {
  const body = useRef<THREE.Group>(null);
  const look = usePetLook(owner);
  const velocity = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const lastSave = useRef(0);
  const lastStation = useRef<string | null>(null);
  const interactLatch = useRef(false);

  useFrame((state, delta) => {
    const group = body.current;
    if (!group) return;
    const input = controls.current;
    const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.stickX;
    const moveZ = (input.back ? 1 : 0) - (input.forward ? 1 : 0) - input.stickY;
    velocity.set(moveX, 0, moveZ);
    if (velocity.lengthSq() > 1) velocity.normalize();
    group.position.x += velocity.x * SPEED * delta;
    group.position.z += velocity.z * SPEED * delta;
    group.position.x = THREE.MathUtils.clamp(
      group.position.x,
      zone.bounds.minX,
      zone.bounds.maxX,
    );
    group.position.z = THREE.MathUtils.clamp(
      group.position.z,
      zone.bounds.minZ,
      zone.bounds.maxZ,
    );
    if (velocity.lengthSq() > 0.0001) {
      group.rotation.y = Math.atan2(velocity.x, velocity.z);
    }

    livePose.current = {
      zone: zone.id,
      x: group.position.x,
      y: group.position.y,
      z: group.position.z,
    };

    let nearest: WorldStation | null = null;
    let best = Infinity;
    for (const station of zone.stations) {
      const d = Math.hypot(
        group.position.x - station.position.x,
        group.position.z - station.position.z,
      );
      if (d <= station.radius && d < best) {
        best = d;
        nearest = station;
      }
    }
    const nearestId = nearest?.id ?? null;
    if (nearestId !== lastStation.current) {
      lastStation.current = nearestId;
      onStation(nearest);
    }

    if (input.interact) {
      if (!interactLatch.current && nearest?.careHref) {
        interactLatch.current = true;
        if (onNavigateAway) onNavigateAway(nearest.careHref);
        else window.location.href = nearest.careHref;
      }
    } else {
      interactLatch.current = false;
    }

    const now = performance.now();
    if (now - lastSave.current > SAVE_EVERY_MS) {
      lastSave.current = now;
      saveWorldPosition(zone.id, {
        x: group.position.x,
        y: group.position.y,
        z: group.position.z,
      });
    }

    camTarget.set(
      group.position.x,
      group.position.y + 7.5,
      group.position.z + 11,
    );
    state.camera.position.lerp(camTarget, 1 - Math.pow(0.001, delta));
    lookTarget.set(group.position.x, 1.2, group.position.z);
    state.camera.lookAt(lookTarget);
  });

  return (
    <group ref={body} position={[spawn.x, spawn.y, spawn.z]}>
      <mesh position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.35, 0.55, 4, 8]} />
        <meshStandardMaterial color="#7fa7ff" roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.25, 0]}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshStandardMaterial color="#f3efe6" />
      </mesh>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 16]} />
        <meshBasicMaterial color="#142044" transparent opacity={0.25} />
      </mesh>
      {look ? <PetFollower look={look} cosmetics={cosmetics} /> : null}
    </group>
  );
}
