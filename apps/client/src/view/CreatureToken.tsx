import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import {
  Action,
  ActionTargetKind,
  type CreatureView,
  type TerritoryView,
} from "@boing-pets/contract";
import { CreaturePresentation } from "./creatures/CreaturePresentation";
import { worldScaleForSkin } from "./creatures/materials";
import {
  drinkShore,
  explorePoint,
  foodPatch,
  nestSpot,
  regionHome,
  roamDuration,
  roamWaypoints,
  socialRing,
  trailPoint,
  type Anchor,
} from "./motion/anchors";
import { behaviorFor, locomotionForSpecies } from "./motion/behavior";
import { NEUTRAL_POSE, mixPose, type CreaturePose } from "./motion/pose";
import { relocateProgress } from "./presentation";
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

type Point = { x: number; y: number; z: number };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

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
 * Presentation placement and locomotion. Positions are derived from the
 * creature's current goal/action and the open world model — never from the
 * sim kernel. Free-roam paths can cross Meadow / Thicket / Ridge; wall-clock
 * easing keeps motion smooth between ticks.
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
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    behaviorKey: "",
    path: [] as Point[],
    pathIndex: 0,
    from: { x: 0, y: 0, z: 0 } as Point,
    to: { x: 0, y: 0, z: 0 } as Point,
    segmentStarted: 0,
    segmentDuration: 1,
    pose: NEUTRAL_POSE,
    targetPose: NEUTRAL_POSE,
    ready: false,
  });

  const skin = skinForSpecies(creature.speciesId);
  const locomotion = locomotionForSpecies(creature.speciesId);
  const behavior = behaviorFor(creature.currentGoal, creature.currentAction);
  const phase0 = useMemo(
    () => hash01(worldSeed, creature.id, 3) * 100,
    [worldSeed, creature.id],
  );

  const region =
    model.regionByTerritoryId.get(creature.territoryId) ?? model.regions[0]!;

  const anchors = useMemo(() => {
    const food = [0, 1, 2, 3, 4, 5].map((i) =>
      foodPatch(model, region, worldSeed, creature.id, i),
    );
    const explore = [0, 1, 2, 3, 4].map((i) =>
      explorePoint(model, region, worldSeed, creature.id, i),
    );
    return {
      home: regionHome(model, region, worldSeed, creature.id),
      drink: drinkShore(model, region, worldSeed, creature.id),
      nest: nestSpot(model, region, worldSeed, creature.id),
      social: socialRing(model, region, worldSeed, creature.id),
      food,
      explore,
    };
  }, [model, region, worldSeed, creature.id]);

  useEffect(() => {
    const s = state.current;
    const start = anchors.home;
    s.x = start.x;
    s.y = start.y;
    s.z = start.z;
    s.from = start;
    s.to = start;
    s.path = [];
    s.pathIndex = 0;
    s.behaviorKey = "";
    s.ready = true;
  }, [anchors]);

  useFrame((_, delta) => {
    const s = state.current;
    if (!s.ready) return;
    const now = worldTime.value + phase0;
    const dt = Math.min(0.05, delta);

    let target: Point = anchors.home;
    let baseDuration = 4;
    let moving = true;
    let pose: CreaturePose = { ...NEUTRAL_POSE };
    const pulse = (rate: number) => (Math.sin(now * rate) + 1) * 0.5;

    if (
      creature.currentAction === Action.RELOCATE &&
      creature.actionTargetKind === ActionTargetKind.TERRITORY &&
      creature.actionTargetId != null
    ) {
      const t = relocateProgress(
        viewTick,
        creature.actionStartedTick,
        creature.actionEndsTick,
      );
      const along =
        trailPoint(model, creature.territoryId, creature.actionTargetId, t) ??
        anchors.home;
      s.x = along.x;
      s.y = along.y;
      s.z = along.z;
      pose = {
        ...NEUTRAL_POSE,
        gait: (now * (locomotion === "trot" ? 3.2 : 2.2)) % 1,
        gaitWeight: 1,
        bob: locomotion === "fly" ? 0.35 + pulse(2.4) * 0.12 : pulse(6) * 0.04,
        headPitch: -0.05,
      };
    } else {
      switch (behavior) {
        case "forage": {
          // Longer cycle so creatures finish cross-region walks before the next patch.
          const cycle = 9.5;
          const idx = Math.floor(now / cycle) % anchors.food.length;
          target = anchors.food[idx]!;
          baseDuration = 6;
          const local = (now % cycle) / cycle;
          if (local < 0.62) {
            moving = true;
            pose = {
              ...NEUTRAL_POSE,
              gait: (now * 2.8) % 1,
              gaitWeight: 0.9,
              headPitch: -0.25,
              bob: locomotion === "fly" ? 0.25 : pulse(7) * 0.03,
            };
          } else if (local < 0.82) {
            moving = false;
            pose = {
              ...NEUTRAL_POSE,
              headPitch: -0.7,
              bodyPitch: 0.18,
              crouch: 0.2,
              bob: locomotion === "fly" ? 0.15 : 0,
              gaitWeight: 0,
              gait: 0,
            };
          } else {
            moving = false;
            pose = {
              ...NEUTRAL_POSE,
              headPitch: -0.35,
              bodyPitch: 0.08,
              crouch: 0.12,
              bob: pulse(4) * 0.02,
              gaitWeight: 0.15,
              gait: (now * 1.4) % 1,
            };
          }
          break;
        }
        case "drink": {
          target = anchors.drink;
          baseDuration = 4;
          const dist = Math.hypot(s.x - target.x, s.z - target.z);
          if (dist > 0.55) {
            moving = true;
            pose = {
              ...NEUTRAL_POSE,
              gait: (now * 2.4) % 1,
              gaitWeight: 0.85,
              bob: locomotion === "fly" ? 0.2 : pulse(6) * 0.03,
              headPitch: -0.1,
            };
          } else {
            moving = false;
            pose = {
              ...NEUTRAL_POSE,
              headPitch: -0.85,
              bodyPitch: 0.28,
              crouch: 0.35,
              bob: locomotion === "fly" ? 0.05 : Math.sin(now * 2.2) * 0.015,
              gaitWeight: 0,
              gait: 0,
            };
          }
          break;
        }
        case "rest":
        case "sleep": {
          target = anchors.nest;
          baseDuration = 6;
          const dist = Math.hypot(s.x - target.x, s.z - target.z);
          if (dist > 0.7) {
            moving = true;
            pose = {
              ...NEUTRAL_POSE,
              gait: (now * 1.8) % 1,
              gaitWeight: 0.55,
              bob: locomotion === "fly" ? 0.2 : 0,
            };
          } else {
            moving = false;
            pose = {
              ...NEUTRAL_POSE,
              headPitch: behavior === "sleep" ? 0.35 : -0.15,
              bodyPitch: behavior === "sleep" ? 0.4 : 0.15,
              crouch: behavior === "sleep" ? 0.55 : 0.3,
              bob: locomotion === "fly" ? 0.08 + pulse(1.2) * 0.04 : 0,
              gaitWeight: 0,
              gait: 0,
            };
          }
          break;
        }
        case "social":
        case "court":
        case "approach": {
          const orbit = now * (behavior === "court" ? 0.55 : 0.35);
          const radius = behavior === "court" ? 2.2 : 3.4;
          const ox = anchors.social.x + Math.cos(orbit + creature.id) * radius;
          const oz = anchors.social.z + Math.sin(orbit + creature.id) * radius;
          target = { x: ox, z: oz, y: model.heightAt(ox, oz) };
          baseDuration = 3.5;
          moving = true;
          pose = {
            ...NEUTRAL_POSE,
            gait: (now * 2.2) % 1,
            gaitWeight: 0.7,
            headPitch: behavior === "court" ? 0.15 : 0.05,
            bob:
              locomotion === "fly" ? 0.35 + pulse(3) * 0.1 : pulse(5) * 0.025,
          };
          break;
        }
        case "guard":
        case "nurse": {
          const patrol = now * 0.5;
          const ox = anchors.nest.x + Math.cos(patrol) * 2.4;
          const oz = anchors.nest.z + Math.sin(patrol) * 2.4;
          target = { x: ox, z: oz, y: model.heightAt(ox, oz) };
          baseDuration = 3;
          moving = behavior === "guard";
          pose = {
            ...NEUTRAL_POSE,
            gait: (now * (behavior === "guard" ? 2.0 : 0.8)) % 1,
            gaitWeight: behavior === "guard" ? 0.6 : 0.15,
            headPitch: behavior === "nurse" ? -0.2 : 0.1,
            crouch: behavior === "nurse" ? 0.25 : 0,
            bob: locomotion === "fly" ? 0.25 : 0,
          };
          break;
        }
        case "wander":
        case "travel": {
          const cycle = 14;
          const idx = Math.floor(now / cycle) % anchors.explore.length;
          target = anchors.explore[idx]!;
          baseDuration = 8;
          moving = true;
          pose = {
            ...NEUTRAL_POSE,
            gait: (now * (locomotion === "trot" ? 3.0 : 2.0)) % 1,
            gaitWeight: 1,
            bob:
              locomotion === "fly" ? 0.4 + pulse(2.5) * 0.15 : pulse(6) * 0.04,
            headPitch: 0.05,
          };
          break;
        }
        case "idle":
        default: {
          target = anchors.home;
          baseDuration = 10;
          const local = (now % 12) / 12;
          moving = local < 0.45 || local > 0.82;
          if (moving) {
            const other =
              anchors.explore[creature.id % anchors.explore.length]!;
            target = local < 0.45 ? other : anchors.home;
            pose = {
              ...NEUTRAL_POSE,
              gait: (now * 1.8) % 1,
              gaitWeight: 0.45,
              bob: locomotion === "fly" ? 0.3 + pulse(2) * 0.1 : 0,
            };
          } else {
            pose = {
              ...NEUTRAL_POSE,
              headPitch: Math.sin(now * 0.7) * 0.08,
              bob: locomotion === "fly" ? 0.28 + pulse(1.6) * 0.08 : 0,
              gaitWeight: locomotion === "fly" ? 0.35 : 0,
              gait: (now * 1.2) % 1,
            };
          }
          break;
        }
      }

      const key = `${behavior}:${target.x.toFixed(1)}:${target.z.toFixed(1)}`;
      if (key !== s.behaviorKey) {
        s.behaviorKey = key;
        const here: Anchor = { x: s.x, y: s.y, z: s.z };
        const path = moving ? roamWaypoints(model, here, target) : [target];
        s.path = path;
        s.pathIndex = 0;
        s.from = here;
        s.to = path[0]!;
        s.segmentStarted = worldTime.value;
        const total = roamDuration(path, here, baseDuration);
        const per =
          (total / Math.max(1, path.length)) *
          (0.85 + hash01(worldSeed, creature.id, 5) * 0.3);
        s.segmentDuration = Math.max(0.8, per);
      }

      if (moving) {
        let u = ease(
          Math.min(
            1,
            (worldTime.value - s.segmentStarted) /
              Math.max(0.2, s.segmentDuration),
          ),
        );
        // Advance through open-world waypoints without popping.
        while (u >= 1 && s.pathIndex < s.path.length - 1) {
          s.pathIndex += 1;
          s.from = { x: s.x, y: s.y, z: s.z };
          s.to = s.path[s.pathIndex]!;
          s.segmentStarted = worldTime.value;
          u = 0;
        }
        s.x = lerp(s.from.x, s.to.x, u);
        s.z = lerp(s.from.z, s.to.z, u);
        s.y = model.heightAt(s.x, s.z);
        const dx = s.to.x - s.from.x;
        const dz = s.to.z - s.from.z;
        if (Math.hypot(dx, dz) > 0.05) {
          s.yaw = yawToward(s.yaw, Math.atan2(dx, dz), dt, 5.5);
        }
      } else {
        s.x = lerp(s.x, target.x, Math.min(1, dt * 2.4));
        s.z = lerp(s.z, target.z, Math.min(1, dt * 2.4));
        s.y = model.heightAt(s.x, s.z);
        if (behavior === "drink") {
          // Face the nearest still water, not only the home-region pond.
          let best = model.bodies[region.index] ?? null;
          let bestDist = Infinity;
          for (const body of model.bodies) {
            const d = Math.hypot(body.center.x - s.x, body.center.z - s.z);
            if (d < bestDist) {
              bestDist = d;
              best = body;
            }
          }
          if (best) {
            s.yaw = yawToward(
              s.yaw,
              Math.atan2(best.center.x - s.x, best.center.z - s.z),
              dt,
              4,
            );
          }
        }
      }
    }

    s.targetPose = pose;
    s.pose = mixPose(s.pose, s.targetPose, Math.min(1, dt * 5));
    poseRef.current = s.pose;

    const hover =
      locomotion === "fly" || locomotion === "hover"
        ? 0.9 + s.pose.bob
        : 0.02 + s.pose.bob - s.pose.crouch * 0.12;

    if (group.current) {
      group.current.position.set(s.x, s.y + hover, s.z);
      group.current.rotation.set(s.pose.bodyPitch, s.yaw, 0);
    }

    onFocus?.({ x: s.x, y: s.y + hover, z: s.z });
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
