import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { Euler, Quaternion, Vector3, type Group } from "three";
import type { CreaturePose } from "../motion/pose";
import type { CreatureSkinPalette } from "../species-skins";
import { GroundContact } from "./GroundContact";
import { furMaterial, hardMaterial, loreGlow } from "./materials";

type Props = {
  palette: CreatureSkinPalette;
  selected: boolean;
  pose: RefObject<CreaturePose>;
};

type Quill = {
  pos: [number, number, number];
  rot: [number, number, number];
  tip: [number, number, number];
};

const QUILL_LENGTH = 0.09;
const UP = new Vector3(0, 1, 0);

/** Quills fanned over the back half of a sphere, pointing outward. */
function buildQuills(): Quill[] {
  const quills: Quill[] = [];
  const rows = [0.35, 0.75, 1.15];
  rows.forEach((polar, r) => {
    const count = 5 + r * 2;
    for (let i = 0; i < count; i += 1) {
      const az = (i / count) * Math.PI * 1.3 - Math.PI * 0.65 + Math.PI / 2;
      const dir: [number, number, number] = [
        Math.sin(polar) * Math.cos(az) * 0.9,
        Math.cos(polar),
        -Math.sin(polar) * Math.sin(az) * 0.9 - 0.15,
      ];
      const len = Math.hypot(...dir);
      const n: [number, number, number] = [
        dir[0] / len,
        dir[1] / len,
        dir[2] / len,
      ];
      const base = 0.12;
      const euler = new Euler().setFromQuaternion(
        new Quaternion().setFromUnitVectors(UP, new Vector3(...n)),
      );
      quills.push({
        pos: [n[0] * base, 0.15 + n[1] * base * 0.85, n[2] * base * 1.1],
        rot: [euler.x, euler.y, euler.z],
        tip: [
          n[0] * (base + QUILL_LENGTH),
          0.15 + n[1] * (base + QUILL_LENGTH) * 0.85,
          n[2] * (base + QUILL_LENGTH) * 1.1,
        ],
      });
    }
  });
  return quills;
}

const LEGS = [
  [-0.07, 0.07, 0],
  [0.07, 0.07, 1],
  [-0.07, -0.07, 1],
  [0.07, -0.07, 0],
] as const;

/**
 * Thistle hog: round earthy body under a mantle of quills with thistle-bloom
 * tips. Idle: quills ripple with each breath while the snout sniffs. Move: a
 * busy trot with a side-to-side waddle.
 */
export function ThistleHogMesh({ palette, selected, pose }: Props) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const mantle = useRef<Group>(null);
  const snout = useRef<Group>(null);
  const legRefs = [
    useRef<Group>(null),
    useRef<Group>(null),
    useRef<Group>(null),
    useRef<Group>(null),
  ];
  const offset = useRef(Math.random() * 10);
  const quills = useMemo(buildQuills, []);
  const fur = furMaterial(palette.primary, 0.94);
  const face = furMaterial(palette.secondary, 0.9);
  const quill = hardMaterial("#3A2E24", 0.7);
  const dark = hardMaterial(palette.accent, 0.6);
  const bloom = loreGlow(palette, selected ? 1.1 : 0.75);

  useFrame(({ clock }) => {
    const p = pose.current;
    if (!p || !root.current) return;
    const t = clock.elapsedTime + offset.current;
    const idle = 1 - p.gaitWeight;
    const phase = p.gait * Math.PI * 2;
    root.current.rotation.x = p.bodyPitch * 0.25;
    if (body.current) {
      body.current.rotation.z = Math.sin(phase) * 0.09 * p.gaitWeight;
      body.current.position.y =
        Math.abs(Math.sin(phase)) * 0.015 * p.gaitWeight;
    }
    if (mantle.current) {
      const breath = 1 + Math.sin(t * 1.6) * 0.035 * idle;
      mantle.current.scale.set(breath, breath, breath);
    }
    if (snout.current) {
      snout.current.rotation.x = p.headPitch + Math.sin(t * 7) * 0.06 * idle;
      snout.current.rotation.y = Math.sin(t * 0.6) * 0.25 * idle;
    }
    legRefs.forEach((ref, i) => {
      if (!ref.current) return;
      const pair = LEGS[i]![2];
      ref.current.rotation.x =
        Math.sin(phase + pair * Math.PI) * 0.6 * p.gaitWeight;
    });
  });

  return (
    <group ref={root}>
      <GroundContact radius={0.24} opacity={selected ? 0.48 : 0.38} />

      {LEGS.map(([x, z], i) => (
        <group key={`leg-${i}`} ref={legRefs[i]} position={[x, 0.07, z]}>
          <mesh position={[0, -0.035, 0]}>
            <cylinderGeometry args={[0.018, 0.02, 0.07, 6]} />
            <meshStandardMaterial {...dark} />
          </mesh>
        </group>
      ))}

      <group ref={body}>
        <mesh position={[0, 0.15, 0]} scale={[0.95, 0.85, 1.15]} castShadow>
          <sphereGeometry args={[0.13, 16, 12]} />
          <meshStandardMaterial {...fur} />
        </mesh>

        <group ref={mantle} position={[0, 0, -0.01]}>
          {quills.map((q, i) => (
            <group key={`q-${i}`}>
              <mesh position={q.pos} rotation={q.rot}>
                <coneGeometry args={[0.012, QUILL_LENGTH * 2, 4]} />
                <meshStandardMaterial {...quill} />
              </mesh>
              {i % 2 === 0 ? (
                <mesh position={q.tip}>
                  <sphereGeometry args={[0.011, 6, 4]} />
                  <meshStandardMaterial {...bloom} />
                </mesh>
              ) : null}
            </group>
          ))}
        </group>

        {/* Snout */}
        <group ref={snout} position={[0, 0.14, 0.13]}>
          <mesh position={[0, 0, 0.02]} scale={[0.85, 0.8, 1]}>
            <sphereGeometry args={[0.065, 12, 10]} />
            <meshStandardMaterial {...face} />
          </mesh>
          <mesh position={[0, -0.01, 0.075]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.032, 0.05, 10]} />
            <meshStandardMaterial {...face} />
          </mesh>
          <mesh position={[0, -0.01, 0.102]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.004, 10]} />
            <meshStandardMaterial {...dark} />
          </mesh>
          {([-0.032, 0.032] as const).map((x, i) => (
            <mesh key={`eye-${i}`} position={[x, 0.025, 0.06]}>
              <sphereGeometry args={[0.01, 8, 8]} />
              <meshStandardMaterial
                color="#120E0B"
                emissive={palette.emissive}
                emissiveIntensity={0.3}
                roughness={0.22}
              />
            </mesh>
          ))}
          {([-0.045, 0.045] as const).map((x, i) => (
            <mesh
              key={`ear-${i}`}
              position={[x, 0.055, 0.0]}
              scale={[1, 0.8, 0.5]}
            >
              <sphereGeometry args={[0.022, 8, 6]} />
              <meshStandardMaterial {...fur} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}
