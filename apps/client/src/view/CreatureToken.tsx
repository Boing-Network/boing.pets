import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import type { CreatureView, TerritoryView } from "@boing-pets/contract";
import { useWorldViewStore } from "../state/worldViewStore";
import { CreaturePresentation } from "./creatures/CreaturePresentation";
import { worldScaleForSkin } from "./creatures/materials";
import { behaviorFor, locomotionForSpecies } from "./motion/behavior";
import { NEUTRAL_POSE, mixPose, type CreaturePose } from "./motion/pose";
import {
  buildLeg,
  estimateSimTick,
  gaitPhase,
  legKey,
  sampleLeg,
  walkSpeed,
  type Leg,
} from "./motion/trajectory";
import { skinForSpecies } from "./species-skins";
import { worldTime } from "./world/gfx";
import { hash01 } from "./world/noise";
import type { WorldModel } from "./world/world-model";

type Props = {
  creature: CreatureView;
  worldSeed: number;
  viewTick: number;
  territoriesById: Map<number, TerritoryView>;
  model: WorldModel;
  selected: boolean;
  onSelect: (creatureId: number) => void;
  onFocus?: (point: { x: number; y: number; z: number }) => void;
};

/**
 * `?debug` exposes rendered positions on `window.__livingPetsPositions` so
 * headless checks can compare two clients. Off by default.
 */
const DEBUG_POSITIONS =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("debug");

function publishDebugPosition(
  id: number,
  point: { x: number; y: number; z: number },
  simTick: number,
): void {
  const w = window as unknown as {
    __livingPetsPositions?: Record<
      number,
      { x: number; y: number; z: number; simTick: number }
    >;
  };
  w.__livingPetsPositions ??= {};
  w.__livingPetsPositions[id] = { ...point, simTick };
}

/** Visual offsets larger than this snap instead of gliding (world units). */
const SNAP_DISTANCE = 30;
/** How fast an interruption offset fades (1/s). */
const SETTLE_RATE = 3.5;

function yawToward(
  yaw: number,
  want: number,
  dt: number,
  rate: number,
): number {
  let diff = want - yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return yaw + diff * Math.min(1, dt * rate);
}

/**
 * Places a creature on its authoritative movement leg (host-planned spots,
 * see `motion/trajectory.ts`) at the shared fractional sim tick, so every
 * client shows it in the same place. The gait phase comes from distance
 * walked, so feet match speed at every time scale. When the host replaces a
 * leg mid-walk, the visual offset eases out instead of popping.
 */
export function CreatureToken({
  creature,
  worldSeed,
  viewTick,
  territoriesById,
  model,
  selected,
  onSelect,
  onFocus,
}: Props) {
  void territoriesById;
  const group = useRef<Group>(null);
  const poseRef = useRef<CreaturePose>(NEUTRAL_POSE);
  const state = useRef({
    leg: null as Leg | null,
    legModel: null as WorldModel | null,
    x: 0,
    y: 0,
    z: 0,
    offsetX: 0,
    offsetZ: 0,
    yaw: hash01(worldSeed, creature.id, 9) * Math.PI * 2,
    lastDistance: 0,
    speed: 0,
    pose: NEUTRAL_POSE,
    ready: false,
  });

  const skin = skinForSpecies(creature.speciesId);
  const locomotion = locomotionForSpecies(creature.speciesId);
  const behavior = behaviorFor(creature.currentGoal, creature.currentAction);
  const phase0 = useMemo(
    () => hash01(worldSeed, creature.id, 3) * 100,
    [worldSeed, creature.id],
  );
  const flier = locomotion === "fly" || locomotion === "hover";

  useFrame((_, delta) => {
    const s = state.current;
    const now = worldTime.value + phase0;
    const dt = Math.min(0.05, delta);
    const { clock, clockReceivedAtMs } = useWorldViewStore.getState();
    const scale = clock?.scale ?? 1;
    const msPerTick = clock?.msPerTick ?? 60_000;
    const simTick = estimateSimTick(
      clock,
      clockReceivedAtMs,
      performance.now(),
      viewTick,
    );

    // New leg from the host: rebuild the route once (cheap key check per
    // frame), and keep the visual position continuous with a decaying offset.
    const key = legKey(creature, scale);
    const leg =
      s.leg != null && s.leg.key === key && s.legModel === model
        ? s.leg
        : buildLeg(model, creature, locomotion, scale, msPerTick);
    if (leg !== s.leg) {
      const first = sampleLeg(leg, simTick);
      if (s.ready) {
        const ox = s.x - first.x;
        const oz = s.z - first.z;
        const far = Math.hypot(ox, oz) > SNAP_DISTANCE;
        s.offsetX = far ? 0 : ox;
        s.offsetZ = far ? 0 : oz;
      }
      s.lastDistance = first.distance;
      s.leg = leg;
      s.legModel = model;
    }

    const sample = sampleLeg(leg, simTick);
    const decay = Math.exp(-dt * SETTLE_RATE);
    s.offsetX *= decay;
    s.offsetZ *= decay;
    const x = sample.x + s.offsetX;
    const z = sample.z + s.offsetZ;

    // Speed in world units per real second, smoothed, for gait weight.
    const travelled = Math.max(0, sample.distance - s.lastDistance);
    s.lastDistance = sample.distance;
    const instant = dt > 0 ? travelled / dt : 0;
    s.speed += (instant - s.speed) * Math.min(1, dt * 6);
    const pace = Math.min(1.4, s.speed / walkSpeed(locomotion));
    const walking = sample.moving && pace > 0.04;

    const groundY = model.heightAt(x, z);
    const y = sample.moving ? groundY : Math.max(groundY, sample.y);

    if (s.ready && Math.hypot(x - s.x, z - s.z) > 0.002) {
      s.yaw = yawToward(s.yaw, Math.atan2(x - s.x, z - s.z), dt, 6);
    } else if (sample.heading != null && walking) {
      s.yaw = yawToward(s.yaw, sample.heading, dt, 6);
    }
    s.x = x;
    s.y = y;
    s.z = z;
    s.ready = true;

    const pulse = (rate: number) => (Math.sin(now * rate) + 1) * 0.5;
    let pose: CreaturePose;
    if (walking) {
      pose = {
        ...NEUTRAL_POSE,
        gait: flier
          ? (now * (1.6 + pace * 1.6)) % 1
          : gaitPhase(sample.distance, locomotion),
        gaitWeight: flier ? 0.6 + pace * 0.4 : Math.min(1, 0.35 + pace),
        bob: flier
          ? 0.35 + pulse(2.4) * 0.12
          : Math.abs(
              Math.sin(gaitPhase(sample.distance, locomotion) * Math.PI * 2),
            ) *
            0.035 *
            pace,
        headPitch: behavior === "forage" ? -0.18 : -0.04,
        bodyPitch: 0.02 * pace,
      };
    } else {
      pose = arrivedPose(behavior, now, pulse, flier);
      if (behavior === "drink") {
        // Face the nearest still water.
        let best: { x: number; z: number } | null = null;
        let bestDist = Infinity;
        for (const body of model.bodies) {
          const d = Math.hypot(body.center.x - s.x, body.center.z - s.z);
          if (d < bestDist) {
            bestDist = d;
            best = body.center;
          }
        }
        if (best) {
          s.yaw = yawToward(
            s.yaw,
            Math.atan2(best.x - s.x, best.z - s.z),
            dt,
            4,
          );
        }
      } else if (behavior === "idle" || behavior === "guard") {
        // Look around in place.
        s.yaw += Math.sin(now * 0.31) * dt * 0.25;
      }
    }

    s.pose = mixPose(s.pose, pose, Math.min(1, dt * 5));
    poseRef.current = s.pose;

    const hover = flier
      ? 0.9 + s.pose.bob
      : 0.02 + s.pose.bob - s.pose.crouch * 0.12;

    if (group.current) {
      group.current.position.set(s.x, s.y + hover, s.z);
      group.current.rotation.set(s.pose.bodyPitch, s.yaw, 0);
    }

    onFocus?.({ x: s.x, y: s.y + hover, z: s.z });
    if (DEBUG_POSITIONS) {
      // The authoritative (pre-offset) leg position is what clients share.
      publishDebugPosition(
        creature.id,
        { x: sample.x, y: s.y, z: sample.z },
        simTick,
      );
    }
  });

  const scale = worldScaleForSkin(skin.id, selected);

  return (
    <group
      ref={group}
      scale={scale}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(creature.id);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(creature.id);
      }}
    >
      <mesh visible={false}>
        <sphereGeometry args={[0.7, 12, 12]} />
        <meshBasicMaterial />
      </mesh>
      {selected ? (
        <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.34, 0.42, 36]} />
          <meshBasicMaterial
            color={skin.emissive}
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>
      ) : null}
      <CreaturePresentation
        speciesId={creature.speciesId}
        selected={selected}
        pose={poseRef}
      />
    </group>
  );
}

/** Pose once the creature has reached the spot its action plays at. */
function arrivedPose(
  behavior: ReturnType<typeof behaviorFor>,
  now: number,
  pulse: (rate: number) => number,
  flier: boolean,
): CreaturePose {
  switch (behavior) {
    case "forage": {
      // Graze: nose down, look up, nose down.
      const local = (now % 6) / 6;
      return {
        ...NEUTRAL_POSE,
        headPitch: local < 0.7 ? -0.7 : -0.2,
        bodyPitch: local < 0.7 ? 0.18 : 0.06,
        crouch: local < 0.7 ? 0.2 : 0.08,
        bob: flier ? 0.15 : 0,
      };
    }
    case "drink":
      return {
        ...NEUTRAL_POSE,
        headPitch: -0.85,
        bodyPitch: 0.28,
        crouch: 0.35,
        bob: flier ? 0.05 : Math.sin(now * 2.2) * 0.015,
      };
    case "rest":
    case "sleep":
      return {
        ...NEUTRAL_POSE,
        headPitch: behavior === "sleep" ? 0.35 : -0.15,
        bodyPitch: behavior === "sleep" ? 0.4 : 0.15,
        crouch: behavior === "sleep" ? 0.55 : 0.3,
        bob: flier ? 0.08 + pulse(1.2) * 0.04 : 0,
      };
    case "social":
    case "court":
    case "approach":
      return {
        ...NEUTRAL_POSE,
        headPitch:
          behavior === "court" ? 0.2 + Math.sin(now * 1.7) * 0.1 : 0.05,
        bob: flier ? 0.35 + pulse(3) * 0.1 : pulse(2.5) * 0.02,
        gaitWeight: flier ? 0.5 : 0.1,
        gait: (now * 1.2) % 1,
      };
    case "guard":
      return {
        ...NEUTRAL_POSE,
        headPitch: 0.12,
        bob: flier ? 0.3 : 0,
        gaitWeight: flier ? 0.4 : 0,
        gait: (now * 1.4) % 1,
      };
    case "nurse":
      return {
        ...NEUTRAL_POSE,
        headPitch: -0.2,
        crouch: 0.25,
        bob: flier ? 0.2 : 0,
      };
    case "idle":
    case "wander":
    case "travel":
    default:
      return {
        ...NEUTRAL_POSE,
        headPitch: Math.sin(now * 0.7) * 0.08,
        bob: flier ? 0.28 + pulse(1.6) * 0.08 : 0,
        gaitWeight: flier ? 0.35 : 0,
        gait: (now * 1.2) % 1,
      };
  }
}
