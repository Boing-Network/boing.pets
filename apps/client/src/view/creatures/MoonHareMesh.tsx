import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import type { Group } from "three";
import type { CreaturePose } from "../motion/pose";
import type { CreatureSkinPalette } from "../species-skins";
import { GroundContact } from "./GroundContact";
import { downMaterial, furMaterial, loreGlow } from "./materials";

type Props = {
  palette: CreatureSkinPalette;
  selected: boolean;
  pose: RefObject<CreaturePose>;
};

/**
 * Moon hare: pale silver-blue fur, cream belly, long ears with moonlit tips.
 * Idle: ear twitches and a sniffing nose. Move: a bounding hop — the body
 * arcs while the big hind legs push and the forelegs reach.
 */
export function MoonHareMesh({ palette, selected, pose }: Props) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const leftEar = useRef<Group>(null);
  const rightEar = useRef<Group>(null);
  const hind = useRef<Group>(null);
  const fore = useRef<Group>(null);
  const nose = useRef<Group>(null);
  const offset = useRef(Math.random() * 10);
  const fur = furMaterial(palette.primary, 0.93);
  const cream = furMaterial(palette.secondary, 0.95);
  const inner = furMaterial("#D9B8C4", 0.9);
  const tail = downMaterial("#F8F6F0");
  const glow = loreGlow(palette, selected ? 1.1 : 0.8);

  useFrame(({ clock }) => {
    const p = pose.current;
    if (!p || !root.current) return;
    const t = clock.elapsedTime + offset.current;
    const idle = 1 - p.gaitWeight;
    const phase = p.gait * Math.PI * 2;
    root.current.rotation.x = p.bodyPitch * 0.3;
    if (body.current) {
      const hop = Math.abs(Math.sin(phase)) * 0.09 * p.gaitWeight;
      body.current.position.y = hop;
      body.current.rotation.x = Math.cos(phase) * 0.18 * p.gaitWeight;
    }
    if (hind.current) {
      hind.current.rotation.x = -Math.sin(phase) * 0.7 * p.gaitWeight;
    }
    if (fore.current) {
      fore.current.rotation.x = Math.sin(phase) * 0.55 * p.gaitWeight;
    }
    if (head.current) head.current.rotation.x = p.headPitch;
    const twitch = Math.max(0, Math.sin(t * 0.9) - 0.85) * 4;
    if (leftEar.current) {
      leftEar.current.rotation.x =
        -0.15 - twitch * 0.25 * idle - p.gaitWeight * 0.35;
      leftEar.current.rotation.z = -0.12 + Math.sin(t * 1.3) * 0.04;
    }
    if (rightEar.current) {
      rightEar.current.rotation.x =
        -0.15 -
        Math.max(0, Math.sin(t * 0.9 + 1.7) - 0.85) * 1.0 * idle -
        p.gaitWeight * 0.35;
      rightEar.current.rotation.z = 0.12 - Math.sin(t * 1.3) * 0.04;
    }
    if (nose.current) {
      const sniff = 1 + Math.max(0, Math.sin(t * 9)) * 0.25 * idle;
      nose.current.scale.set(sniff, sniff, sniff);
    }
  });

  return (
    <group ref={root}>
      <GroundContact radius={0.26} opacity={selected ? 0.48 : 0.36} />
      <group ref={body}>
        {/* Haunch-heavy body */}
        <mesh position={[0, 0.17, -0.04]} scale={[0.85, 0.82, 1.1]} castShadow>
          <sphereGeometry args={[0.15, 18, 14]} />
          <meshStandardMaterial {...fur} />
        </mesh>
        <mesh position={[0, 0.13, 0.04]} scale={[0.65, 0.6, 0.85]}>
          <sphereGeometry args={[0.12, 12, 10]} />
          <meshStandardMaterial {...cream} />
        </mesh>
        <mesh position={[0, 0.21, -0.19]}>
          <sphereGeometry args={[0.05, 10, 8]} />
          <meshStandardMaterial {...tail} />
        </mesh>

        {/* Big hind legs */}
        <group ref={hind} position={[0, 0.11, -0.08]}>
          {([-0.085, 0.085] as const).map((x, i) => (
            <group key={`hind-${i}`} position={[x, 0, 0]}>
              <mesh scale={[0.6, 0.9, 1.2]}>
                <sphereGeometry args={[0.075, 10, 8]} />
                <meshStandardMaterial {...fur} />
              </mesh>
              <mesh position={[0, -0.085, 0.05]} scale={[0.7, 0.35, 1.8]}>
                <sphereGeometry args={[0.04, 8, 6]} />
                <meshStandardMaterial {...cream} />
              </mesh>
            </group>
          ))}
        </group>

        {/* Slim forelegs */}
        <group ref={fore} position={[0, 0.1, 0.09]}>
          {([-0.05, 0.05] as const).map((x, i) => (
            <mesh key={`fore-${i}`} position={[x, -0.04, 0]}>
              <cylinderGeometry args={[0.017, 0.02, 0.11, 6]} />
              <meshStandardMaterial {...cream} />
            </mesh>
          ))}
        </group>

        {/* Head with long ears */}
        <group ref={head} position={[0, 0.27, 0.1]}>
          <mesh scale={[0.9, 0.88, 1.1]} castShadow>
            <sphereGeometry args={[0.085, 14, 12]} />
            <meshStandardMaterial {...fur} />
          </mesh>
          <mesh position={[0, -0.02, 0.06]} scale={[0.8, 0.65, 0.7]}>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshStandardMaterial {...cream} />
          </mesh>
          <group ref={nose} position={[0, -0.005, 0.095]}>
            <mesh>
              <sphereGeometry args={[0.013, 8, 6]} />
              <meshStandardMaterial {...inner} />
            </mesh>
          </group>
          {([-0.035, 0.035] as const).map((x, i) => (
            <mesh key={`eye-${i}`} position={[x * 1.3, 0.02, 0.06]}>
              <sphereGeometry args={[0.014, 8, 8]} />
              <meshStandardMaterial
                color="#141826"
                emissive={palette.emissive}
                emissiveIntensity={0.32}
                roughness={0.22}
              />
            </mesh>
          ))}
          {(
            [
              [leftEar, -0.035],
              [rightEar, 0.035],
            ] as const
          ).map(([ref, x], i) => (
            <group key={`ear-${i}`} ref={ref} position={[x, 0.06, -0.01]}>
              <mesh position={[0, 0.1, 0]} scale={[0.45, 1, 0.22]}>
                <sphereGeometry args={[0.1, 10, 10]} />
                <meshStandardMaterial {...fur} />
              </mesh>
              <mesh position={[0, 0.1, 0.012]} scale={[0.28, 0.82, 0.12]}>
                <sphereGeometry args={[0.1, 8, 8]} />
                <meshStandardMaterial {...inner} />
              </mesh>
              <mesh position={[0, 0.19, 0]}>
                <sphereGeometry args={[0.016, 8, 6]} />
                <meshStandardMaterial {...glow} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
