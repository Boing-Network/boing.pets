import type { ThreeEvent } from "@react-three/fiber";
import { PastureWorldText } from "./PastureWorldText";
import { NeonHalo, YARD } from "./yardChrome";
import { yardLabelForLandmark } from "./yardLabels";

function hoverHandlers() {
  return {
    onPointerOver: () => {
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      document.body.style.cursor = "";
    },
  };
}

/** Gritty neon travel-agency / bus-depot storefront. */
export function DispatchDepot({
  x,
  z,
  y,
  rotY = 0,
  onInteract,
}: {
  x: number;
  z: number;
  y: number;
  rotY?: number;
  onInteract: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const label = yardLabelForLandmark("dispatch-station");
  return (
    <group
      position={[x, y, z]}
      rotation={[0, rotY, 0]}
      onPointerDown={onInteract}
      {...hoverHandlers()}
    >
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <boxGeometry args={[5.2, 0.08, 3.6]} />
        <meshStandardMaterial color={YARD.concrete} roughness={1} />
      </mesh>
      <mesh position={[0, 1.35, -0.35]} castShadow receiveShadow>
        <boxGeometry args={[4.4, 2.7, 2.2]} />
        <meshStandardMaterial color="#161618" roughness={0.82} />
      </mesh>
      <mesh position={[0, 2.78, -0.35]}>
        <boxGeometry args={[4.6, 0.2, 2.4]} />
        <meshStandardMaterial color={YARD.ink} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.35, 0.8]} castShadow>
        <boxGeometry args={[4.1, 1.8, 0.08]} />
        <meshStandardMaterial color="#0c0c10" roughness={0.55} />
      </mesh>
      {([-1.25, 0, 1.25] as const).map((px) => (
        <mesh key={`ticket-${px}`} position={[px, 1.25, 0.86]}>
          <boxGeometry args={[1.0, 0.85, 0.04]} />
          <meshStandardMaterial
            color="#c8e8f4"
            roughness={0.08}
            metalness={0.15}
            transparent
            opacity={0.32}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.55, 1.05]} receiveShadow>
        <boxGeometry args={[4.2, 0.14, 0.7]} />
        <meshStandardMaterial
          color={YARD.metal}
          roughness={0.45}
          metalness={0.35}
        />
      </mesh>
      <mesh position={[-1.7, 0.42, 1.15]} castShadow>
        <boxGeometry args={[0.9, 0.12, 0.35]} />
        <meshStandardMaterial color={YARD.ink} roughness={0.7} />
      </mesh>
      <mesh position={[1.6, 0.55, 1.2]} rotation={[0, 0.15, 0]} castShadow>
        <boxGeometry args={[1.35, 0.55, 0.55]} />
        <meshStandardMaterial color="#1a1a1c" roughness={0.65} />
      </mesh>
      <mesh position={[1.05, 0.72, 1.2]} rotation={[0, 0.15, 0]}>
        <boxGeometry args={[0.08, 0.22, 0.5]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.42, 0.86]}>
        <boxGeometry args={[3.4, 0.42, 0.12]} />
        <meshStandardMaterial
          color={YARD.ink}
          emissive={YARD.accent}
          emissiveIntensity={0.9}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 2.18, 0.86]}>
        <boxGeometry args={[3.1, 0.08, 0.1]} />
        <meshStandardMaterial
          color="#2ec8e0"
          emissive="#2ec8e0"
          emissiveIntensity={1.1}
        />
      </mesh>
      <NeonHalo position={[0, 2.42, 1.1]} width={3.6} height={0.55} />
      <mesh position={[-2.35, 1.7, 0.4]} rotation={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.08, 1.6, 0.7]} />
        <meshStandardMaterial
          color="#ff2bd6"
          emissive="#ff2bd6"
          emissiveIntensity={0.55}
        />
      </mesh>
      <mesh position={[2.35, 1.55, 0.35]} rotation={[0, -0.1, 0]} castShadow>
        <boxGeometry args={[0.08, 1.3, 0.55]} />
        <meshStandardMaterial
          color="#2ec8e0"
          emissive="#2ec8e0"
          emissiveIntensity={0.5}
        />
      </mesh>
      {([-0.7, 0.15, 0.95] as const).map((px, i) => (
        <mesh key={`poster-${i}`} position={[px, 1.7, 0.84]} castShadow>
          <boxGeometry args={[0.42, 0.62, 0.03]} />
          <meshStandardMaterial
            color={i === 1 ? YARD.accent : i === 0 ? "#ff2bd6" : "#2ec8e0"}
            roughness={0.55}
            emissive={i === 1 ? YARD.accent : "#000000"}
            emissiveIntensity={i === 1 ? 0.4 : 0}
          />
        </mesh>
      ))}
      <PastureWorldText
        position={[0, 3.15, 0.15]}
        fontSize={0.24}
        anchorX="center"
        anchorY="middle"
        tag={label.tag}
      >
        {label.title}
      </PastureWorldText>
    </group>
  );
}
