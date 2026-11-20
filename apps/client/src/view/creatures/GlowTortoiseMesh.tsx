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

/** Shell plates: [x, z, scale]. A low dome with one ring of scutes. */
const SCUTES = [
  [0, 0, 1],
  [0.09, 0.07, 0.72],
  [-0.09, 0.07, 0.72],
  [0.09, -0.07, 0.72],
  [-0.09, -0.07, 0.72],
  [0, 0.12, 0.66],
  [0, -0.12, 0.66],
] as const;

const LEGS = [
  [-0.13, 0.1, 0],
  [0.13, 0.1, 1],
  [-0.13, -0.1, 1],
  [0.13, -0.1, 0],
] as const;

/**
 * Glow tortoise: mossy domed shell with mint rune seams, leathery limbs.
 * Idle: slow breath in the shell and a curious head sway. Move: diagonal
 * leg pairs step together, like a real tortoise gait.
 */
export function GlowTortoiseMesh({ palette, selected, pose }: Props) {
  const root = useRef<Group>(null);
  const shell = useRef<Group>(null);
  const head = useRef<Group>(null);
  const legPairA = useRef<Group>(null);
  const legPairB = useRef<Group>(null);
  const offset = useRef(Math.random() * 10);
  const shellMat = hardMaterial(palette.primary, 0.86);
  const plate = hardMaterial("#4C5A3A", 0.9);
  const skin = furMaterial(palette.secondary, 0.82);
  const belly = hardMaterial("#9C8B66", 0.88);
  const claw = hardMaterial(palette.accent, 0.7);
  const moss = furMaterial("#3E5C3A", 0.97);
  const rune = loreGlow(palette, selected ? 1.1 : 0.75);

  useFrame(({ clock }) => {
    const p = pose.current;
    if (!p || !root.current) return;
    const t = clock.elapsedTime + offset.current;
    const idle = 1 - p.gaitWeight;
    root.current.rotation.x = p.bodyPitch * 0.2;
    if (shell.current) {
      const breath = 1 + Math.sin(t * 1.1) * 0.018 * idle;
      shell.current.scale.set(1, breath, 1);
      shell.current.rotation.z =
        Math.sin(p.gait * Math.PI * 2) * 0.05 * p.gaitWeight;
    }
    if (head.current) {
      head.current.rotation.x = p.headPitch * 0.8;
      head.current.rotation.y = Math.sin(t * 0.45) * 0.35 * idle;
      head.current.position.z = 0.02 + Math.sin(t * 0.7) * 0.012 * idle;
    }
    const step = Math.sin(p.gait * Math.PI * 2) * 0.3 * p.gaitWeight;
    if (legPairA.current) legPairA.current.rotation.x = step;
    if (legPairB.current) legPairB.current.rotation.x = -step;
  });

  const leg = (pos: readonly [number, number, number], key: string) => (
    <group key={key} position={[pos[0], 0.07, pos[1]]}>
      <mesh position={[0, -0.01, 0]} scale={[1, 1.1, 1]}>
        <cylinderGeometry args={[0.035, 0.042, 0.1, 7]} />
        <meshStandardMaterial {...skin} />
      </mesh>
      <mesh position={[0, -0.06, 0.012]} scale={[1.2, 0.5, 1.4]}>
        <sphereGeometry args={[0.035, 8, 6]} />
        <meshStandardMaterial {...claw} />
      </mesh>
    </group>
  );

  return (
    <group ref={root}>
      <GroundContact radius={0.34} opacity={selected ? 0.52 : 0.42} />

      <group ref={legPairA}>
        {LEGS.filter((l) => l[2] === 0).map((l, i) =>
          leg([l[0], l[1], 0], `a-${i}`),
        )}
      </group>
      <group ref={legPairB}>
        {LEGS.filter((l) => l[2] === 1).map((l, i) =>
          leg([l[0], l[1], 0], `b-${i}`),
        )}
      </group>

      <group ref={shell} position={[0, 0.1, 0]}>
        {/* Plastron (belly) and the shell dome */}
        <mesh position={[0, 0, 0]} scale={[1.05, 0.28, 1.2]}>
          <sphereGeometry args={[0.18, 16, 10]} />
          <meshStandardMaterial {...belly} />
        </mesh>
        <mesh position={[0, 0.01, 0]} scale={[1, 0.72, 1.18]} castShadow>
          <sphereGeometry
            args={[0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]}
          />
          <meshStandardMaterial {...shellMat} />
        </mesh>
        {/* Scutes with glowing seams */}
        {SCUTES.map(([x, z, s], i) => (
          <group
            key={`scute-${i}`}
            position={[x, 0.115 - Math.abs(x) * 0.35, z]}
          >
            <mesh scale={[s, 0.32 * s, s]}>
              <sphereGeometry args={[0.06, 6, 5]} />
              <meshStandardMaterial {...plate} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[s, s, s]}>
              <torusGeometry args={[0.058, 0.005, 4, 6]} />
              <meshStandardMaterial {...rune} />
            </mesh>
          </group>
        ))}
        {/* Moss tufts riding the shell */}
        {(
          [
            [0.12, 0.07, -0.1],
            [-0.11, 0.08, 0.04],
            [0.02, 0.13, -0.05],
          ] as const
        ).map((pos, i) => (
          <mesh key={`moss-${i}`} position={pos} scale={[1, 0.6, 1]}>
            <sphereGeometry args={[0.035, 7, 5]} />
            <meshStandardMaterial {...moss} />
          </mesh>
        ))}
        {/* Rim of the shell */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.005, 0]}
          scale={[1, 1.18, 1]}
        >
          <torusGeometry args={[0.197, 0.012, 5, 22]} />
          <meshStandardMaterial {...shellMat} />
        </mesh>
      </group>

      {/* Neck and head */}
      <group position={[0, 0.11, 0.2]}>
        <group ref={head}>
          <mesh position={[0, 0.01, 0.02]} rotation={[Math.PI / 2.4, 0, 0]}>
            <cylinderGeometry args={[0.038, 0.045, 0.09, 8]} />
            <meshStandardMaterial {...skin} />
          </mesh>
          <mesh position={[0, 0.04, 0.08]} scale={[0.95, 0.8, 1.2]} castShadow>
            <sphereGeometry args={[0.052, 12, 10]} />
            <meshStandardMaterial {...skin} />
          </mesh>
          <mesh position={[0, 0.03, 0.135]} scale={[1, 0.6, 0.6]}>
            <sphereGeometry args={[0.026, 8, 6]} />
            <meshStandardMaterial {...claw} />
          </mesh>
          {([-0.03, 0.03] as const).map((x, i) => (
            <mesh key={`eye-${i}`} position={[x, 0.058, 0.11]}>
              <sphereGeometry args={[0.011, 8, 8]} />
              <meshStandardMaterial
                color="#0E140F"
                emissive={palette.emissive}
                emissiveIntensity={0.3}
                roughness={0.25}
              />
            </mesh>
          ))}
        </group>
      </group>

      {/* Stubby tail */}
      <mesh position={[0, 0.08, -0.24]} rotation={[-0.6, 0, 0]}>
        <coneGeometry args={[0.022, 0.06, 6]} />
        <meshStandardMaterial {...skin} />
      </mesh>
    </group>
  );
}
