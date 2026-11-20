/**
 * Draws and animates one creature from its species rig: shared geometry
 * and materials, no lights. Animation is procedural and cheap:
 *
 * - breathing (chest swell) and a slow weight shift at rest,
 * - gait-specific leg timing (walk, trot, bound, hop, waddle, crawl, wade)
 *   with planted stance (feet sweep back linearly while on the ground, then
 *   lift and swing forward), body bob, roll and pitch,
 * - head look-around, or toward the camera when selected,
 * - tail sway, a newt's body wave, and wing beats for fliers.
 *
 * Beyond `LOD_FAR` (while a crowd is mounted) the parts hide and the
 * creature is drawn by the species' instanced far body instead.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Group, Mesh, Vector3 } from "three";
import type { CreaturePose } from "../motion/pose";
import type { PartName } from "./anatomy/builder";
import {
  crowd,
  joinCrowd,
  leaveCrowd,
  LOD_FAR,
  LOD_NEAR,
} from "./anatomy/crowd";
import {
  creatureMembrane,
  creatureSkin,
  creatureTime,
} from "./anatomy/material";
import type { GaitStyle } from "./anatomy/plans";
import { rigForSpecies } from "./anatomy/rig";
import { GroundContact } from "./GroundContact";

type Props = {
  speciesId: number;
  selected: boolean;
  pose: RefObject<CreaturePose>;
  /** Per-creature phase so a herd does not breathe in unison. */
  phase?: number;
};

type LegKey = "legFL" | "legFR" | "legHL" | "legHR";

const LEG_PHASES: Record<GaitStyle, Record<LegKey, number>> = {
  walk: { legHL: 0, legFL: 0.25, legHR: 0.5, legFR: 0.75 },
  waddle: { legHL: 0, legFL: 0.25, legHR: 0.5, legFR: 0.75 },
  crawl: { legHL: 0, legFL: 0.25, legHR: 0.5, legFR: 0.75 },
  wade: { legHL: 0, legHR: 0.5, legFL: 0, legFR: 0.5 },
  trot: { legFL: 0, legHR: 0, legFR: 0.5, legHL: 0.5 },
  scurry: { legFL: 0, legHR: 0, legFR: 0.5, legHL: 0.5 },
  bound: { legFL: 0, legFR: 0.08, legHL: 0.5, legHR: 0.58 },
  hop: { legFL: 0, legFR: 0.03, legHL: 0.5, legHR: 0.53 },
  fly: { legFL: 0, legFR: 0, legHL: 0, legHR: 0 },
};

const ROLL: Partial<Record<GaitStyle, number>> = {
  waddle: 0.09,
  crawl: 0.04,
  wade: 0.03,
  walk: 0.025,
  trot: 0.02,
};

const STANCE = 0.62;
const TAU = Math.PI * 2;

/** Leg angle and lift for a phase: linear sweep on the ground, then swing. */
function legCycle(u: number): { angle: number; lift: number } {
  const t = u - Math.floor(u);
  if (t < STANCE) {
    // Planted: foot moves back at constant speed relative to the body.
    return { angle: 1 - (2 * t) / STANCE, lift: 0 };
  }
  const s = (t - STANCE) / (1 - STANCE);
  const eased = s * s * (3 - 2 * s);
  return { angle: -1 + 2 * eased, lift: Math.sin(Math.PI * s) };
}

const camLocal = new Vector3();
const rootWorld = new Vector3();

export function ProceduralCreature({
  speciesId,
  selected,
  pose,
  phase = 0,
}: Props) {
  const rig = rigForSpecies(speciesId);
  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const parts = useRef(new Map<PartName, Group>());
  const bodyMesh = useRef<Mesh>(null);
  const look = useRef({ yaw: 0, far: false });
  const info = rig.info;
  const flier = info.gait === "fly";

  const sorted = useMemo(() => rig.parts, [rig]);

  useEffect(() => {
    const node = root.current;
    return () => {
      if (node) leaveCrowd(speciesId, node);
    };
  }, [speciesId]);

  useFrame((state, delta) => {
    const r = root.current;
    const tg = torso.current;
    const p = pose.current;
    if (!r || !tg || !p) return;
    const t = state.clock.elapsedTime + phase;
    creatureTime.value = state.clock.elapsedTime;

    // LOD: hand far creatures to the instanced crowd.
    r.getWorldPosition(rootWorld);
    const dist = rootWorld.distanceTo(state.camera.position);
    const L = look.current;
    const wantFar =
      crowd.mounted > 0 &&
      !selected &&
      (L.far ? dist > LOD_NEAR : dist > LOD_FAR);
    if (wantFar !== L.far) {
      L.far = wantFar;
      tg.visible = !wantFar;
      if (shadow.current) shadow.current.visible = !wantFar;
      if (wantFar) joinCrowd(speciesId, r);
      else leaveCrowd(speciesId, r);
    }
    if (wantFar) return;

    const w = p.gaitWeight;
    const g = p.gait;
    const H = info.height;

    // Breathing and weight shift.
    const breath = Math.sin(t * TAU * info.breathRate);
    if (bodyMesh.current) {
      bodyMesh.current.scale.set(1 + breath * 0.008, 1 + breath * 0.014, 1);
    }
    const shift = Math.sin(t * 0.37) * (1 - w) * 0.012;

    // Torso: crouch, bob, roll, pitch.
    const bob = flier ? 0 : -Math.abs(Math.sin(TAU * 2 * g)) * H * 0.025 * w;
    tg.position.y = bob - p.crouch * H * (flier ? 0 : 0.28);
    tg.rotation.z = Math.sin(TAU * g) * (ROLL[info.gait] ?? 0.02) * w + shift;
    tg.rotation.x =
      info.gait === "hop" || info.gait === "bound"
        ? Math.sin(TAU * g) * 0.12 * w
        : 0;
    tg.rotation.y = Math.sin(TAU * g) * info.undulate * w;

    const map = parts.current;
    // Legs.
    const phases = LEG_PHASES[info.gait];
    for (const key of ["legFL", "legFR", "legHL", "legHR"] as const) {
      const leg = map.get(key);
      if (!leg) continue;
      if (flier) {
        leg.rotation.x = 0;
        continue;
      }
      const c = legCycle(g + phases[key]);
      leg.rotation.x = -c.angle * info.stride * w;
      leg.scale.y = 1 - c.lift * 0.14 * w - p.crouch * 0.3;
    }

    // Head: look around at rest, toward the camera when selected.
    const head = map.get("head");
    if (head) {
      let target =
        (Math.sin(t * 0.23) * 0.6 + Math.sin(t * 0.61 + 1.7) * 0.4) *
        info.lookRange *
        (1 - w * 0.7);
      if (selected) {
        camLocal.copy(state.camera.position);
        head.parent?.worldToLocal(camLocal);
        const toCam = Math.atan2(
          camLocal.x - head.position.x,
          camLocal.z - head.position.z,
        );
        target = Math.max(-info.lookRange, Math.min(info.lookRange, toCam));
      }
      L.yaw += (target - L.yaw) * Math.min(1, delta * 2.5);
      head.rotation.set(
        p.headPitch - tg.rotation.x * 0.6 + breath * 0.01,
        L.yaw,
        0,
      );
    }

    // Tail.
    const tail = map.get("tail");
    if (tail) {
      tail.rotation.y =
        Math.sin(t * 1.1) * 0.12 * (1 - w) +
        Math.sin(TAU * g + 1) * (0.1 + info.undulate * 1.8) * w;
      tail.rotation.x = Math.sin(TAU * g * 2) * 0.05 * w;
    }

    // Wings.
    if (info.flap > 0) {
      const beat = Math.sin(TAU * g) * info.flap * (0.45 + 0.55 * w) + 0.12;
      const lag =
        Math.sin(TAU * (g - 0.08)) * info.flap * 0.8 * (0.45 + 0.55 * w) + 0.1;
      map.get("wingL")?.rotation.set(0, 0, beat);
      map.get("wingR")?.rotation.set(0, 0, -beat);
      map.get("wing2L")?.rotation.set(0, 0, lag);
      map.get("wing2R")?.rotation.set(0, 0, -lag);
    }

    // Fliers: the shadow stays on the ground below them.
    if (shadow.current && flier) {
      const scale = r.parent?.scale.y ?? 1;
      shadow.current.position.y = -(0.9 + p.bob) / Math.max(0.01, scale);
    }
  });

  return (
    <group ref={root}>
      <GroundContact ref={shadow} radius={info.footprint} />
      <group ref={torso}>
        {sorted.map((part) => (
          <group
            key={part.name}
            position={part.pivot}
            ref={(node) => {
              if (node) parts.current.set(part.name, node);
              else parts.current.delete(part.name);
            }}
          >
            <mesh
              ref={part.name === "body" ? bodyMesh : undefined}
              geometry={part.geometry}
              material={part.membrane ? creatureMembrane : creatureSkin}
              castShadow
            />
          </group>
        ))}
      </group>
    </group>
  );
}
