import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import {
  ConeGeometry,
  MeshBasicMaterial,
  TorusGeometry,
  type Group,
} from "three";
import type { PlayerPresence } from "@boing-pets/contract";
import {
  otherPlayers,
  useSharedWorldStore,
} from "../../state/sharedWorldStore";
import type { WorldModel } from "./world-model";

/** Marker colour: owner violet, wallet gold, guest pale blue. */
export function playerColor(player: Pick<PlayerPresence, "role" | "wallet">) {
  if (player.role === "owner") return "#c9a7ff";
  return player.wallet ? "#ffd27a" : "#9fd8ff";
}

/**
 * Markers keep a readable on-screen size: 1x up close, growing with camera
 * distance (clamped) so a player across the map is still a visible pin.
 */
export function markerScale(cameraDistance: number) {
  return Math.min(6, Math.max(1, cameraDistance / 14));
}

/** Frame-rate independent ease toward the latest server position. */
export function easeToward(current: number, target: number, dt: number) {
  const k = 1 - Math.exp(-dt * 8);
  return current + (target - current) * k;
}

// One geometry/material set for every marker: a few draw calls per player.
const cone = new ConeGeometry(0.28, 0.7, 10);
cone.rotateX(Math.PI);
const ring = new TorusGeometry(0.55, 0.05, 6, 24);
ring.rotateX(Math.PI / 2);
const materials = new Map<string, MeshBasicMaterial>();
function material(color: string) {
  let m = materials.get(color);
  if (m == null) {
    m = new MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    materials.set(color, m);
  }
  return m;
}

function PlayerMarker({
  player,
  model,
}: {
  player: PlayerPresence;
  model: WorldModel;
}) {
  const group = useRef<Group | null>(null);
  const target = useRef({ x: player.x, z: player.z });
  target.current = { x: player.x, z: player.z };
  const color = playerColor(player);
  useFrame((state, delta) => {
    const g = group.current;
    if (g == null) return;
    const dt = Math.min(delta, 0.1);
    g.position.x = easeToward(g.position.x, target.current.x, dt);
    g.position.z = easeToward(g.position.z, target.current.z, dt);
    const scale = markerScale(state.camera.position.distanceTo(g.position));
    g.scale.setScalar(scale);
    g.position.y = model.heightAt(g.position.x, g.position.z) + 1.1 * scale;
    g.children[0]!.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.08;
  });
  return (
    <group
      ref={group}
      position={[player.x, model.heightAt(player.x, player.z) + 1.1, player.z]}
    >
      <mesh geometry={cone} material={material(color)} />
      <mesh geometry={ring} material={material(color)} position={[0, -1, 0]} />
      <Billboard position={[0, 0.75, 0]}>
        <Text
          fontSize={0.42}
          color={color}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.04}
          outlineColor="#041018"
        >
          {player.name}
        </Text>
      </Billboard>
    </group>
  );
}

/**
 * Other connected players at their camera focus, and this client's own focus
 * reported to the server (throttled by the transport).
 */
export function PlayerMarkers({
  model,
  focus,
}: {
  model: WorldModel;
  focus: MutableRefObject<{ x: number; y: number; z: number }>;
}) {
  const controls = useSharedWorldStore((s) => s.controls);
  const players = useSharedWorldStore((s) => s.players);
  const sessionId = useSharedWorldStore((s) => s.sessionId);
  const others = useMemo(
    () => otherPlayers(players, sessionId),
    [players, sessionId],
  );
  useFrame(() => {
    controls?.sendPresence(focus.current.x, focus.current.z);
  });
  if (controls == null) return null;
  return (
    <>
      {others.map((player) => (
        <PlayerMarker key={player.id} player={player} model={model} />
      ))}
    </>
  );
}
