import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import type { Group } from "three";
import type { CreaturePose } from "../motion/pose";
import type { CreatureSkinPalette } from "../species-skins";
import { GroundContact } from "./GroundContact";
import { furMaterial, hardMaterial, loreGlow } from "./materials";

type Props = {
  palette: CreatureSkinPalette;
  selected: boolean;
  pose: RefObject<CreaturePose>;
};

/** Wool clumps over the back: [x, y, z, r]. */
const WOOL = [
  [0, 0.31, 0.06, 0.1],
  [0.07, 0.29, -0.04, 0.09],
  [-0.07, 0.29, -0.04, 0.09],
  [0, 0.31, -0.12, 0.09],
  [0.08, 0.26, 0.1, 0.075],
  [-0.08, 0.26, 0.1, 0.075],
  [0, 0.28, 0.17, 0.075],
] as const;

const LEGS = [
  [-0.075, 0.13, 0],
  [0.075, 0.13, 1],
  [-0.075, -0.13, 1],
  [0.075, -0.13, 0],
] as const;

/**
 * Crag ram: stocky stone-grey body, thick wool, curled horns with quartz
 * glints. Idle: slow chew and a watchful head turn. Move: sure-footed
 * diagonal walk with a heavy shoulder roll.
 */
export function CragRamMesh({ palette, selected, pose }: Props) {
  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const head = useRef<Group>(null);
  const jaw = useRef<Group>(null);
  const legRefs = [
    useRef<Group>(null),
    useRef<Group>(null),
    useRef<Group>(null),
    useRef<Group>(null),
  ];
  const offset = useRef(Math.random() * 10);
  const coat = furMaterial(palette.primary, 0.95);
  const wool = furMaterial(palette.secondary, 0.98);
  const horn = hardMaterial("#B8A88E", 0.62);
  const hoof = hardMaterial(palette.accent, 0.7);
  const face = furMaterial("#5E554D", 0.9);
  const quartz = loreGlow(palette, selected ? 1.15 : 0.8);

  useFrame(({ clock }) => {
    const p = pose.current;
    if (!p || !root.current) return;
    const t = clock.elapsedTime + offset.current;
    const idle = 1 - p.gaitWeight;
    const phase = p.gait * Math.PI * 2;
    root.current.rotation.x = p.bodyPitch * 0.3;
    if (torso.current) {
      torso.current.rotation.z = Math.sin(phase) * 0.04 * p.gaitWeight;
      torso.current.position.y =
        Math.abs(Math.cos(phase)) * 0.012 * p.gaitWeight +
        Math.sin(t * 1.2) * 0.003 * idle;
    }
    if (head.current) {
      head.current.rotation.x = p.headPitch * 0.9;
      head.current.rotation.y = Math.sin(t * 0.3) * 0.4 * idle;
    }
    if (jaw.current) {
      jaw.current.rotation.x = Math.max(0, Math.sin(t * 5)) * 0.18 * idle;
    }
    legRefs.forEach((ref, i) => {
      if (!ref.current) return;
      const pair = LEGS[i]![2];
      const swing = Math.sin(phase + pair * Math.PI) * 0.45 * p.gaitWeight;
      ref.current.rotation.x = swing;
    });
  });

  return (
    <group ref={root}>
      <GroundContact radius={0.3} opacity={selected ? 0.5 : 0.4} />

      {LEGS.map(([x, z], i) => (
        <group key={`leg-${i}`} ref={legRefs[i]} position={[x, 0.17, z]}>
          <mesh position={[0, -0.08, 0]}>
            <cylinderGeometry args={[0.02, 0.024, 0.17, 6]} />
            <meshStandardMaterial {...coat} />
          </mesh>
          <mesh position={[0, -0.16, 0.005]}>
            <cylinderGeometry args={[0.024, 0.028, 0.025, 6]} />
            <meshStandardMaterial {...hoof} />
          </mesh>
        </group>
      ))}

      <group ref={torso}>
        <mesh position={[0, 0.23, 0]} scale={[0.85, 0.75, 1.25]} castShadow>
          <sphereGeometry args={[0.15, 16, 12]} />
          <meshStandardMaterial {...coat} />
        </mesh>
        {WOOL.map(([x, y, z, r], i) => (
          <mesh key={`wool-${i}`} position={[x, y, z]}>
            <sphereGeometry args={[r, 9, 7]} />
            <meshStandardMaterial {...wool} />
          </mesh>
        ))}
        <mesh position={[0, 0.26, -0.2]} rotation={[-0.4, 0, 0]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshStandardMaterial {...wool} />
        </mesh>

        {/* Head with curled horns */}
        <group position={[0, 0.3, 0.2]}>
          <group ref={head}>
            <mesh
              position={[0, 0, 0.05]}
              rotation={[0.5, 0, 0]}
              scale={[0.75, 0.8, 1.15]}
              castShadow
            >
              <sphereGeometry args={[0.07, 12, 10]} />
              <meshStandardMaterial {...face} />
            </mesh>
            <group ref={jaw} position={[0, -0.03, 0.08]}>
              <mesh position={[0, -0.01, 0.03]} scale={[0.7, 0.45, 0.9]}>
                <sphereGeometry args={[0.04, 8, 6]} />
                <meshStandardMaterial {...face} />
              </mesh>
            </group>
            <mesh position={[0, 0.045, 0.02]}>
              <sphereGeometry args={[0.05, 9, 7]} />
              <meshStandardMaterial {...wool} />
            </mesh>
            {([-1, 1] as const).map((side) => (
              <group
                key={`horn-${side}`}
                position={[side * 0.055, 0.04, 0.0]}
                rotation={[0, (side * Math.PI) / 2, 0]}
              >
                <mesh rotation={[0, 0, -0.4]}>
                  <torusGeometry args={[0.055, 0.02, 6, 14, Math.PI * 1.45]} />
                  <meshStandardMaterial {...horn} />
                </mesh>
                <mesh position={[0.05, 0.03, 0]}>
                  <octahedronGeometry args={[0.012, 0]} />
                  <meshStandardMaterial {...quartz} />
                </mesh>
                <mesh position={[-0.02, 0.055, 0]}>
                  <octahedronGeometry args={[0.009, 0]} />
                  <meshStandardMaterial {...quartz} />
                </mesh>
              </group>
            ))}
            {([-0.035, 0.035] as const).map((x, i) => (
              <mesh key={`eye-${i}`} position={[x, 0.015, 0.085]}>
                <sphereGeometry args={[0.01, 8, 8]} />
                <meshStandardMaterial
                  color="#16130F"
                  emissive={palette.emissive}
                  emissiveIntensity={0.28}
                  roughness={0.22}
                />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}
